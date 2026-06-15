#!/usr/bin/env python3
"""Global port registry manager.

The registry keeps only active leases in a lock-protected TSV file under
`$CODEX_HOME/state/port-registry` when `CODEX_HOME` is set, otherwise
`~/.codex/state/port-registry`.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import socket
import sys
import tempfile
import time
from pathlib import Path

try:
    import fcntl
except ImportError as exc:  # pragma: no cover
    raise SystemExit(f"fcntl is required for safe locking: {exc}")

FIELDS = [
    "scope_id",
    "project",
    "repo_root",
    "branch",
    "worktree_path",
    "service",
    "port",
    "port_base",
    "block_size",
    "claimed_at",
    "last_seen_at",
    "agent_session",
    "pid",
]

DEFAULT_REGISTRY_DIR = "~/.codex/state/port-registry"
DEFAULT_START_BASE = 10000
DEFAULT_STEP = 10
DEFAULT_BLOCK_SIZE = 10
DEFAULT_TTL_HOURS = 24.0
LOCK_WAIT_INTERVAL_SEC = 0.1


class RegistryError(RuntimeError):
    """Raised when registry data is invalid or operation is unsafe."""


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> dt.datetime | None:
    if not value:
        return None
    data = value.strip()
    if not data:
        return None
    if data.endswith("Z"):
        data = data[:-1] + "+00:00"
    try:
        parsed = dt.datetime.fromisoformat(data)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def port_listening(port: int) -> bool:
    if port <= 0 or port > 65535:
        return False
    for host in ("127.0.0.1", "::1"):
        try:
            with socket.create_connection((host, port), timeout=0.2):
                return True
        except OSError:
            continue
    return False


def process_alive(pid: int | None) -> bool:
    if pid is None or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def service_offset(service: str) -> int | None:
    mapping = {
        "app": 0,
        "web": 0,
        "frontend": 0,
        "api": 1,
        "backend": 1,
        "db": 2,
        "postgres": 2,
        "mysql": 2,
        "redis": 3,
        "cache": 3,
    }
    return mapping.get(service.lower().strip())


def parse_int(value: str, field_name: str) -> int:
    try:
        result = int(value)
    except ValueError as exc:
        raise RegistryError(f"invalid integer for {field_name}: {value}") from exc
    return result


def assert_tcp_port(port: int, field_name: str = "port") -> int:
    if port < 1 or port > 65535:
        raise RegistryError(f"invalid TCP {field_name}: {port} (must be 1..65535)")
    return port


def parse_pid(value: str | None) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return parse_int(text, "pid")


def default_registry_dir() -> str:
    explicit = os.environ.get("CODEX_PORT_REGISTRY_DIR")
    if explicit:
        return explicit
    codex_home = os.environ.get("CODEX_HOME")
    if codex_home:
        return str((Path(codex_home).expanduser() / "state" / "port-registry").resolve())
    return DEFAULT_REGISTRY_DIR


class Registry:
    def __init__(self, root_dir: str) -> None:
        self.root = Path(root_dir).expanduser()
        self.tsv_path = self.root / "leases.tsv"
        self.lock_path = self.root / "leases.lock"

    def ensure_layout(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock_path.touch(exist_ok=True)
        if not self.tsv_path.exists():
            self._atomic_write([])

    def _acquire_lock(self, timeout_sec: float):
        self.ensure_layout()
        handle = self.lock_path.open("a+", encoding="utf-8")
        deadline = time.time() + timeout_sec
        while True:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.time() >= deadline:
                    handle.close()
                    raise RegistryError(f"timed out waiting for lock: {self.lock_path}")
                time.sleep(LOCK_WAIT_INTERVAL_SEC)
        return handle

    def with_locked_rows(self, timeout_sec: float, callback):
        lock_handle = self._acquire_lock(timeout_sec)
        try:
            rows = self.read_rows()
            changed, result = callback(rows)
            if changed:
                self.validate_rows(rows)
                self._atomic_write(rows)
            return result
        finally:
            try:
                fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
            lock_handle.close()

    def read_rows(self) -> list[dict[str, str]]:
        self.ensure_layout()
        rows: list[dict[str, str]] = []
        with self.tsv_path.open("r", encoding="utf-8", newline="") as handle:
            for line_no, raw in enumerate(handle, start=1):
                line = raw.rstrip("\n")
                if not line or line.startswith("#"):
                    continue
                cols = line.split("\t")
                if cols == FIELDS:
                    continue
                if len(cols) != len(FIELDS):
                    raise RegistryError(
                        f"invalid column count in {self.tsv_path}:{line_no}, "
                        f"expected {len(FIELDS)} got {len(cols)}"
                    )
                row = dict(zip(FIELDS, cols))
                row["service"] = row["service"].strip().lower()
                row["port"] = str(parse_int(row["port"], "port"))
                row["block_size"] = str(parse_int(row["block_size"] or str(DEFAULT_BLOCK_SIZE), "block_size"))
                if not row["claimed_at"]:
                    row["claimed_at"] = utc_now_iso()
                if not row["last_seen_at"]:
                    row["last_seen_at"] = row["claimed_at"]
                rows.append(row)
        self.validate_rows(rows)
        return rows

    def validate_rows(self, rows: list[dict[str, str]]) -> None:
        seen_key: dict[tuple[str, str], int] = {}
        seen_port: dict[int, tuple[str, str]] = {}
        for index, row in enumerate(rows, start=1):
            key = (row["scope_id"], row["service"])
            if key in seen_key:
                first = seen_key[key]
                raise RegistryError(f"duplicate scope/service lease at row {first} and row {index}: {key}")
            seen_key[key] = index

            port = assert_tcp_port(parse_int(row["port"], "port"), "port")
            if port in seen_port:
                prev = seen_port[port]
                raise RegistryError(
                    f"duplicate port lease for {port}: {prev[0]}/{prev[1]} and {row['scope_id']}/{row['service']}"
                )
            seen_port[port] = key
            base_text = row.get("port_base", "")
            if base_text:
                assert_tcp_port(parse_int(base_text, "port_base"), "port_base")
            if row.get("pid"):
                parse_pid(row["pid"])

    def _atomic_write(self, rows: list[dict[str, str]]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            delete=False,
            dir=self.root,
            prefix="leases.",
            suffix=".tmp",
        ) as temp:
            temp.write("# Active global port leases\n")
            temp.write("# " + "\t".join(FIELDS) + "\n")
            writer = csv.writer(temp, delimiter="\t", lineterminator="\n")
            for row in rows:
                writer.writerow([row.get(field, "") for field in FIELDS])
            temp.flush()
            os.fsync(temp.fileno())
            temp_name = temp.name

        os.replace(temp_name, self.tsv_path)
        os.chmod(self.tsv_path, 0o600)


def run_gc(rows: list[dict[str, str]], ttl_hours: float) -> list[dict[str, str]]:
    now = dt.datetime.now(dt.timezone.utc)
    kept: list[dict[str, str]] = []
    removed: list[dict[str, str]] = []

    for row in rows:
        pid = parse_pid(row.get("pid"))
        if pid is not None:
            port = parse_int(row["port"], "port")
            if not process_alive(pid):
                removed.append({**row, "gc_reason": "pid_dead"})
                continue
            if not port_listening(port):
                removed.append({**row, "gc_reason": "port_not_listening"})
                continue
            kept.append(row)
            continue

        marker = parse_iso(row.get("last_seen_at", "")) or parse_iso(row.get("claimed_at", ""))
        if marker is None:
            kept.append(row)
            continue

        age_hours = (now - marker).total_seconds() / 3600.0
        if age_hours <= ttl_hours:
            kept.append(row)
            continue

        port = parse_int(row["port"], "port")
        if port_listening(port):
            kept.append(row)
            continue

        removed.append(row)

    rows[:] = kept
    return removed


def scope_rows(rows: list[dict[str, str]], scope_id: str) -> list[dict[str, str]]:
    return [row for row in rows if row["scope_id"] == scope_id]


def stable_scope_base_key(scope_id: str, base: int) -> bytes:
    data = f"{scope_id}\0{base}".encode("utf-8")
    return hashlib.sha256(data).digest()


def stable_scope_candidate_bases(
    scope_id: str,
    start_base: int,
    step: int,
    used_bases: set[int],
) -> list[int]:
    candidates: list[int] = []
    candidate = start_base
    while candidate <= 65535:
        if candidate not in used_bases:
            candidates.append(candidate)
        candidate += step
    candidates.sort(key=lambda base: stable_scope_base_key(scope_id, base))
    return candidates


def select_port(
    rows: list[dict[str, str]],
    scope_id: str,
    service: str,
    start_base: int,
    step: int,
    block_size: int,
) -> tuple[int, int]:
    for row in rows:
        if row["scope_id"] == scope_id and row["service"] == service:
            port = parse_int(row["port"], "port")
            base_text = row.get("port_base", "")
            if base_text:
                return port, parse_int(base_text, "port_base")
            inferred_base = port - (port % max(block_size, 1))
            return port, inferred_base

    used_ports = {parse_int(row["port"], "port") for row in rows}
    used_bases: set[int] = set()
    for row in rows:
        base_text = row.get("port_base", "")
        if base_text:
            used_bases.add(parse_int(base_text, "port_base"))

    existing_scope_bases = []
    for row in scope_rows(rows, scope_id):
        base_text = row.get("port_base", "")
        if not base_text:
            continue
        base = parse_int(base_text, "port_base")
        if base not in existing_scope_bases:
            existing_scope_bases.append(base)

    preferred = service_offset(service)
    offset_order = list(range(block_size))
    if preferred is not None and preferred in offset_order:
        offset_order.remove(preferred)
        offset_order.insert(0, preferred)

    new_bases = stable_scope_candidate_bases(
        scope_id=scope_id,
        start_base=start_base,
        step=step,
        used_bases=used_bases,
    )

    for base in existing_scope_bases + new_bases:
        for offset in offset_order:
            port = base + offset
            if port < 1 or port > 65535:
                continue
            if port in used_ports:
                continue
            if port_listening(port):
                continue
            return port, base

    raise RegistryError("no available port candidates in configured range")


def upsert_row(
    rows: list[dict[str, str]],
    payload: dict[str, str],
    refresh_claimed_at: bool,
) -> tuple[dict[str, str], bool]:
    key_scope = payload["scope_id"]
    key_service = payload["service"].strip().lower()
    now = utc_now_iso()

    for row in rows:
        if row["scope_id"] == key_scope and row["service"] == key_service:
            if payload.get("port") and payload["port"] != row["port"]:
                row["claimed_at"] = now
            elif refresh_claimed_at:
                row["claimed_at"] = now

            for field in FIELDS:
                if field in ("claimed_at", "last_seen_at"):
                    continue
                value = payload.get(field)
                if value is not None and value != "":
                    row[field] = value
            row["service"] = key_service
            row["last_seen_at"] = now
            return row, False

    new_row = {field: "" for field in FIELDS}
    for field in FIELDS:
        value = payload.get(field)
        if value is not None:
            new_row[field] = value
    new_row["service"] = key_service
    new_row["claimed_at"] = now
    new_row["last_seen_at"] = now
    rows.append(new_row)
    return new_row, True


def emit(result: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return

    if "rows" in result:
        print(f"count={result.get('count', len(result['rows']))}")
        print("\t".join(FIELDS))
        for row in result["rows"]:
            print("\t".join(row.get(field, "") for field in FIELDS))
        for key in ("released", "gc_removed"):
            if key in result:
                print(f"{key}={result[key]}")
        return

    for key, value in result.items():
        if isinstance(value, (dict, list)):
            value = json.dumps(value, ensure_ascii=False)
        print(f"{key}={value}")


def allocate_cmd(registry: Registry, args: argparse.Namespace) -> dict:
    payload = {
        "scope_id": args.scope_id,
        "project": args.project,
        "repo_root": args.repo_root,
        "branch": args.branch,
        "worktree_path": args.worktree_path,
        "service": args.service.lower(),
        "block_size": str(args.block_size),
        "agent_session": args.agent_session or "",
        "pid": str(args.pid) if args.pid is not None else "",
    }

    def mutate(rows: list[dict[str, str]]):
        gc_removed = run_gc(rows, args.ttl_hours)
        port, base = select_port(
            rows,
            scope_id=args.scope_id,
            service=args.service.lower(),
            start_base=args.start_base,
            step=args.step,
            block_size=args.block_size,
        )
        payload["port"] = str(port)
        payload["port_base"] = str(base)
        row, created = upsert_row(rows, payload, refresh_claimed_at=False)
        row["port"] = str(port)
        row["port_base"] = str(base)
        row["block_size"] = str(args.block_size)
        return True, {
            "action": "allocated",
            "scope_id": row["scope_id"],
            "service": row["service"],
            "port": parse_int(row["port"], "port"),
            "port_base": parse_int(row["port_base"], "port_base"),
            "block_size": parse_int(row["block_size"], "block_size"),
            "claimed_at": row["claimed_at"],
            "last_seen_at": row["last_seen_at"],
            "gc_removed": len(gc_removed),
            "created": created,
        }

    return registry.with_locked_rows(args.lock_timeout_sec, mutate)


def suggest_cmd(registry: Registry, args: argparse.Namespace) -> dict:
    lock_handle = registry._acquire_lock(args.lock_timeout_sec)
    try:
        rows = registry.read_rows()
        gc_removed = run_gc(rows, args.ttl_hours)
        port, base = select_port(
            rows,
            scope_id=args.scope_id,
            service=args.service.lower(),
            start_base=args.start_base,
            step=args.step,
            block_size=args.block_size,
        )
        return {
            "action": "suggested",
            "scope_id": args.scope_id,
            "service": args.service.lower(),
            "port": port,
            "port_base": base,
            "block_size": args.block_size,
            "gc_removed_preview": len(gc_removed),
            "note": "non-mutating recommendation",
        }
    finally:
        try:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        lock_handle.close()


def register_cmd(registry: Registry, args: argparse.Namespace) -> dict:
    assert_tcp_port(args.port, "port")
    default_port_base = args.port - (args.port % max(args.block_size, 1))
    assert_tcp_port(default_port_base, "port_base")
    payload = {
        "scope_id": args.scope_id,
        "project": args.project or "",
        "repo_root": args.repo_root or "",
        "branch": args.branch or "",
        "worktree_path": args.worktree_path or "",
        "service": args.service.lower(),
        "port": str(args.port),
        "port_base": str(args.port_base) if args.port_base is not None else str(default_port_base),
        "block_size": str(args.block_size),
        "agent_session": args.agent_session or "",
        "pid": str(args.pid) if args.pid is not None else "",
    }

    def mutate(rows: list[dict[str, str]]):
        gc_removed = run_gc(rows, args.ttl_hours)
        key = (args.scope_id, args.service.lower())

        for row in rows:
            if row["scope_id"] == key[0] and row["service"] == key[1]:
                continue
            if parse_int(row["port"], "port") == args.port:
                raise RegistryError(
                    f"port {args.port} already leased by {row['scope_id']}/{row['service']}"
                )

        if port_listening(args.port):
            for row in rows:
                if row["scope_id"] == key[0] and row["service"] == key[1] and parse_int(row["port"], "port") == args.port:
                    break
            else:
                raise RegistryError(
                    f"port {args.port} is currently LISTENing; refuse to register blindly"
                )

        row, created = upsert_row(rows, payload, refresh_claimed_at=args.refresh_claimed_at)
        return True, {
            "action": "registered",
            "scope_id": row["scope_id"],
            "service": row["service"],
            "port": parse_int(row["port"], "port"),
            "port_base": parse_int(row["port_base"], "port_base") if row["port_base"] else None,
            "block_size": parse_int(row["block_size"], "block_size"),
            "claimed_at": row["claimed_at"],
            "last_seen_at": row["last_seen_at"],
            "created": created,
            "gc_removed": len(gc_removed),
        }

    return registry.with_locked_rows(args.lock_timeout_sec, mutate)


def heartbeat_cmd(registry: Registry, args: argparse.Namespace) -> dict:
    def mutate(rows: list[dict[str, str]]):
        gc_removed = run_gc(rows, args.ttl_hours)
        now = utc_now_iso()
        for row in rows:
            if row["scope_id"] == args.scope_id and row["service"] == args.service.lower():
                row["last_seen_at"] = now
                if args.pid is not None:
                    row["pid"] = str(args.pid)
                if args.agent_session is not None:
                    row["agent_session"] = args.agent_session
                return True, {
                    "action": "heartbeat",
                    "scope_id": row["scope_id"],
                    "service": row["service"],
                    "last_seen_at": now,
                    "gc_removed": len(gc_removed),
                }
        raise RegistryError(f"lease not found for {args.scope_id}/{args.service.lower()}")

    return registry.with_locked_rows(args.lock_timeout_sec, mutate)


def release_service_cmd(registry: Registry, args: argparse.Namespace) -> dict:
    def mutate(rows: list[dict[str, str]]):
        gc_removed = run_gc(rows, args.ttl_hours)
        before = len(rows)
        rows[:] = [
            row
            for row in rows
            if not (row["scope_id"] == args.scope_id and row["service"] == args.service.lower())
        ]
        released = before - len(rows)
        return released > 0 or len(gc_removed) > 0, {
            "action": "released-service",
            "scope_id": args.scope_id,
            "service": args.service.lower(),
            "released": released,
            "gc_removed": len(gc_removed),
        }

    return registry.with_locked_rows(args.lock_timeout_sec, mutate)


def release_scope_cmd(registry: Registry, args: argparse.Namespace) -> dict:
    def mutate(rows: list[dict[str, str]]):
        gc_removed = run_gc(rows, args.ttl_hours)
        before = len(rows)
        rows[:] = [row for row in rows if row["scope_id"] != args.scope_id]
        released = before - len(rows)
        return released > 0 or len(gc_removed) > 0, {
            "action": "released-scope",
            "scope_id": args.scope_id,
            "released": released,
            "gc_removed": len(gc_removed),
        }

    return registry.with_locked_rows(args.lock_timeout_sec, mutate)


def inspect_cmd(registry: Registry, args: argparse.Namespace) -> dict:
    def mutate(rows: list[dict[str, str]]):
        gc_removed = run_gc(rows, args.ttl_hours)
        filtered = []
        for row in rows:
            if args.scope_id and row["scope_id"] != args.scope_id:
                continue
            if args.project and row["project"] != args.project:
                continue
            if args.repo_root and row["repo_root"] != args.repo_root:
                continue
            if args.branch and row["branch"] != args.branch:
                continue
            if args.worktree_path and row["worktree_path"] != args.worktree_path:
                continue
            if args.service and row["service"] != args.service.lower():
                continue
            if args.port is not None and parse_int(row["port"], "port") != args.port:
                continue
            filtered.append(row)
        filtered.sort(key=lambda item: item.get("claimed_at", ""), reverse=True)
        return len(gc_removed) > 0, {
            "action": "inspect",
            "count": len(filtered),
            "rows": filtered,
            "gc_removed": len(gc_removed),
        }

    return registry.with_locked_rows(args.lock_timeout_sec, mutate)


def gc_cmd(registry: Registry, args: argparse.Namespace) -> dict:
    def mutate(rows: list[dict[str, str]]):
        removed = run_gc(rows, args.ttl_hours)
        return len(removed) > 0, {
            "action": "gc",
            "ttl_hours": args.ttl_hours,
            "removed": len(removed),
            "rows": removed,
        }

    return registry.with_locked_rows(args.lock_timeout_sec, mutate)


def parser_build() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage global port leases.")
    parser.add_argument("--registry-dir", default=default_registry_dir())
    parser.add_argument("--lock-timeout-sec", type=float, default=10.0)
    parser.add_argument("--ttl-hours", type=float, default=DEFAULT_TTL_HOURS)
    parser.add_argument("--json", action="store_true", help="Output JSON")

    sub = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--scope-id", "--workspace-id", dest="scope_id", required=True)
    common.add_argument("--service", required=True)

    alloc = sub.add_parser("allocate", parents=[common])
    alloc.add_argument("--project", required=True)
    alloc.add_argument("--repo-root", required=True)
    alloc.add_argument("--branch", required=True)
    alloc.add_argument("--worktree-path", required=True)
    alloc.add_argument("--start-base", type=int, default=DEFAULT_START_BASE)
    alloc.add_argument("--step", type=int, default=DEFAULT_STEP)
    alloc.add_argument("--block-size", type=int, default=DEFAULT_BLOCK_SIZE)
    alloc.add_argument("--agent-session")
    alloc.add_argument("--pid", type=int)

    suggest = sub.add_parser("suggest", parents=[common])
    suggest.add_argument("--start-base", type=int, default=DEFAULT_START_BASE)
    suggest.add_argument("--step", type=int, default=DEFAULT_STEP)
    suggest.add_argument("--block-size", type=int, default=DEFAULT_BLOCK_SIZE)

    reg = sub.add_parser("register", parents=[common])
    reg.add_argument("--port", type=int, required=True)
    reg.add_argument("--project")
    reg.add_argument("--repo-root")
    reg.add_argument("--branch")
    reg.add_argument("--worktree-path")
    reg.add_argument("--port-base", type=int)
    reg.add_argument("--block-size", type=int, default=DEFAULT_BLOCK_SIZE)
    reg.add_argument("--agent-session")
    reg.add_argument("--pid", type=int)
    reg.add_argument("--refresh-claimed-at", action="store_true")

    hb = sub.add_parser("heartbeat", parents=[common])
    hb.add_argument("--agent-session")
    hb.add_argument("--pid", type=int)

    sub.add_parser("release-service", parents=[common])

    release_scope = sub.add_parser("release-scope", aliases=["release-worktree"])
    release_scope.add_argument("--scope-id", "--workspace-id", dest="scope_id", required=True)

    inspect = sub.add_parser("inspect")
    inspect.add_argument("--scope-id", "--workspace-id", dest="scope_id")
    inspect.add_argument("--project")
    inspect.add_argument("--repo-root")
    inspect.add_argument("--branch")
    inspect.add_argument("--worktree-path")
    inspect.add_argument("--service")
    inspect.add_argument("--port", type=int)

    sub.add_parser("gc")

    return parser


def validate_runtime_args(args: argparse.Namespace) -> None:
    if args.command in ("allocate", "suggest"):
        if args.step <= 0:
            raise RegistryError(f"invalid step: {args.step} (must be > 0)")
        if args.block_size <= 0:
            raise RegistryError(f"invalid block_size: {args.block_size} (must be > 0)")
        assert_tcp_port(args.start_base, "start_base")
    elif args.command == "register":
        if args.block_size <= 0:
            raise RegistryError(f"invalid block_size: {args.block_size} (must be > 0)")
        assert_tcp_port(args.port, "port")
        if args.port_base is not None:
            assert_tcp_port(args.port_base, "port_base")
    elif args.command == "inspect":
        if args.port is not None:
            assert_tcp_port(args.port, "port")


def main() -> int:
    parser = parser_build()
    args = parser.parse_args()

    try:
        validate_runtime_args(args)
        registry = Registry(args.registry_dir)
        if args.command == "allocate":
            result = allocate_cmd(registry, args)
        elif args.command == "suggest":
            result = suggest_cmd(registry, args)
        elif args.command == "register":
            result = register_cmd(registry, args)
        elif args.command == "heartbeat":
            result = heartbeat_cmd(registry, args)
        elif args.command == "release-service":
            result = release_service_cmd(registry, args)
        elif args.command in ("release-scope", "release-worktree"):
            result = release_scope_cmd(registry, args)
        elif args.command == "inspect":
            result = inspect_cmd(registry, args)
        elif args.command == "gc":
            result = gc_cmd(registry, args)
        else:
            parser.error(f"unsupported command: {args.command}")
            return 2
    except RegistryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    emit(result, args.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
