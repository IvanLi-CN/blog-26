#!/usr/bin/env python3
"""Safely inspect and publish worktree bootstrap environment files."""

from __future__ import annotations

import argparse
import os
import re
import stat
import subprocess
import sys
import tempfile
from pathlib import Path


PORT_KEYS = (b"PORT", b"SITE_PORT", b"ADMIN_PORT")
PORT_LINE_RE = re.compile(rb"^(PORT|SITE_PORT|ADMIN_PORT)=")


class EnvUnavailable(Exception):
    """The requested environment file or worktree cannot be used."""


class EnvInvalid(Exception):
    """The requested environment file is readable but invalid."""


def fail(message: str, exit_code: int = 1) -> int:
    print(message, file=sys.stderr)
    return exit_code


def canonical_directory(path: str | Path) -> Path:
    candidate = Path(path).expanduser().resolve(strict=True)
    if not candidate.is_dir():
        raise EnvUnavailable("worktree directory is unavailable")
    return candidate


def primary_worktree(current_root: str) -> Path:
    try:
        result = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            cwd=current_root,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="surrogateescape",
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise EnvUnavailable("git worktree metadata is unavailable") from exc

    for block in re.split(r"\n[ \t]*\n", result.stdout):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if "bare" in lines:
            continue
        worktree_line = next((line for line in lines if line.startswith("worktree ")), "")
        if not worktree_line:
            continue
        if any(line == "prunable" or line.startswith("prunable ") for line in lines):
            raise EnvUnavailable("primary worktree is prunable")
        return canonical_directory(worktree_line.removeprefix("worktree "))

    raise EnvUnavailable("no usable primary worktree was found")


def path_kind(path: Path) -> str:
    try:
        mode = os.lstat(path).st_mode
    except FileNotFoundError:
        return "missing"
    except OSError:
        return "unavailable"
    if stat.S_ISREG(mode):
        return "regular"
    return "non-regular"


def split_line_ending(raw: bytes) -> tuple[bytes, bytes]:
    if raw.endswith(b"\r\n"):
        return raw[:-2], b"\r\n"
    if raw.endswith(b"\n") or raw.endswith(b"\r"):
        return raw[:-1], raw[-1:]
    return raw, b""


def strip_shell_quotes(value: bytes) -> bytes:
    if len(value) >= 2 and value[:1] in (b'"', b"'") and value[-1:] == value[:1]:
        return value[1:-1]
    return value


def iter_records(data: bytes):
    parts = data.split(b"\n")
    for index, part in enumerate(parts):
        ending = b"\n" if index < len(parts) - 1 else b""
        raw = part + ending
        line, line_ending = split_line_ending(raw)
        yield raw, line, line_ending


def parse_env(data: bytes) -> dict[bytes, bytes]:
    values: dict[bytes, bytes] = {}
    for _, line, _ in iter_records(data):
        if not line or line.startswith(b"#") or b"=" not in line:
            continue
        key, value = line.split(b"=", 1)
        values[key] = strip_shell_quotes(value)
    return values


def read_regular(path: Path) -> tuple[bytes, int]:
    try:
        initial_mode = os.lstat(path).st_mode
    except (FileNotFoundError, OSError) as exc:
        raise EnvUnavailable("environment file is unavailable") from exc
    if not stat.S_ISREG(initial_mode):
        raise EnvUnavailable("environment file is not a regular file")

    flags = os.O_RDONLY | getattr(os, "O_NONBLOCK", 0)
    no_follow = getattr(os, "O_NOFOLLOW", 0)
    fd = -1
    try:
        fd = os.open(path, flags | no_follow)
        opened_mode = os.fstat(fd).st_mode
        if not stat.S_ISREG(opened_mode):
            raise EnvUnavailable("environment file is not a regular file")
        with os.fdopen(fd, "rb") as handle:
            fd = -1
            data = handle.read()
    except OSError as exc:
        raise EnvUnavailable("environment file cannot be read") from exc
    finally:
        if fd >= 0:
            os.close(fd)

    return data, stat.S_IMODE(opened_mode)


def validate_env(data: bytes) -> None:
    values = parse_env(data)
    port = values.get(b"PORT", b"")
    if not re.fullmatch(rb"[0-9]+", port):
        raise EnvInvalid("PORT is missing or invalid")
    for key in (b"SITE_PORT", b"ADMIN_PORT"):
        if key in values and not re.fullmatch(rb"[0-9]+", values[key]):
            raise EnvInvalid("derived port is invalid")


def validated_source(path: Path) -> tuple[bytes, int]:
    data, source_mode = read_regular(path)
    if not source_mode & stat.S_IRUSR:
        raise EnvInvalid("source environment is not owner-readable")
    try:
        validate_env(data)
    except EnvInvalid:
        raise
    return data, source_mode


def rewrite_ports(data: bytes, ports: dict[bytes, int]) -> bytes:
    found: set[bytes] = set()
    output: list[bytes] = []
    for raw, line, ending in iter_records(data):
        match = PORT_LINE_RE.match(line)
        if not match:
            output.append(raw)
            continue
        key = match.group(1)
        key_bytes = key
        output.append(key_bytes + b"=" + str(ports[key_bytes]).encode("ascii") + ending)
        found.add(key_bytes)

    missing_keys = [key for key in PORT_KEYS if key not in found]
    if missing_keys and output and not data.endswith(b"\n"):
        output.append(b"\n")
    for key in missing_keys:
        output.append(key + b"=" + str(ports[key]).encode("ascii") + b"\n")
    return b"".join(output)


def fsync_directory(directory: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    try:
        fd = os.open(directory, flags)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def publish_bytes(target: Path, data: bytes, mode: int) -> str:
    target_kind = path_kind(target)
    if target_kind in ("regular", "non-regular"):
        return "exists"
    if target_kind != "missing":
        raise OSError("target environment is unavailable")
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
    temporary_path = Path(temporary_name)
    try:
        os.fchmod(fd, mode & 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary_path, target)
        except FileExistsError:
            return "exists"
        fsync_directory(target.parent)
        return "created"
    finally:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass


def command_primary_root(args: argparse.Namespace) -> int:
    try:
        print(primary_worktree(args.current_root))
    except EnvUnavailable as exc:
        return fail(str(exc))
    return 0


def command_kind(args: argparse.Namespace) -> int:
    print(path_kind(Path(args.path)))
    return 0


def command_validate(args: argparse.Namespace) -> int:
    try:
        data, _ = read_regular(Path(args.path))
        validate_env(data)
    except EnvInvalid:
        print("invalid")
        return 1
    except EnvUnavailable:
        print("unusable")
        return 1
    print("usable")
    return 0


def command_publish(args: argparse.Namespace) -> int:
    target = Path(args.target)
    target_kind = path_kind(target)
    if target_kind in ("regular", "non-regular"):
        print("exists")
        return 0
    if target_kind != "missing":
        return fail("target environment is unavailable")
    try:
        source_data, source_mode = validated_source(Path(args.source))
        target_mode = source_mode & 0o600
        data = rewrite_ports(
            source_data,
            {b"PORT": args.port, b"SITE_PORT": args.site_port, b"ADMIN_PORT": args.admin_port},
        )
        print(publish_bytes(target, data, target_mode))
    except EnvInvalid:
        return fail("source environment is invalid", 2)
    except EnvUnavailable:
        return fail("source environment is unavailable", 2)
    except OSError:
        return fail("environment publication failed")
    return 0


def command_default(args: argparse.Namespace) -> int:
    data = (
        f"PORT={args.port}\n"
        f"SITE_PORT={args.site_port}\n"
        f"ADMIN_PORT={args.admin_port}\n"
        "DB_PATH=./dev-data/sqlite.db\n"
        "LOCAL_CONTENT_BASE_PATH=./dev-data/local\n"
        "CONTENT_SOURCES=local\n"
    ).encode("ascii")
    target = Path(args.target)
    target_kind = path_kind(target)
    if target_kind in ("regular", "non-regular"):
        print("exists")
        return 0
    if target_kind != "missing":
        return fail("target environment is unavailable")
    try:
        print(publish_bytes(target, data, 0o600))
    except OSError:
        return fail("environment publication failed")
    return 0


def add_ports(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--site-port", type=int, required=True)
    parser.add_argument("--admin-port", type=int, required=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    primary = commands.add_parser("primary-root")
    primary.add_argument("--current-root", required=True)
    primary.set_defaults(handler=command_primary_root)

    kind = commands.add_parser("kind")
    kind.add_argument("--path", required=True)
    kind.set_defaults(handler=command_kind)

    validate = commands.add_parser("validate")
    validate.add_argument("--path", required=True)
    validate.set_defaults(handler=command_validate)

    publish = commands.add_parser("publish")
    publish.add_argument("--source", required=True)
    publish.add_argument("--target", required=True)
    add_ports(publish)
    publish.set_defaults(handler=command_publish)

    default = commands.add_parser("default")
    default.add_argument("--target", required=True)
    add_ports(default)
    default.set_defaults(handler=command_default)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
