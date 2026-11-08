"""Seed setup-node's tool cache from a checksum-pinned official Node archive."""

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

VERSION = "22.23.2"
SHA256 = "d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307"
URL = f"https://nodejs.org/dist/v{VERSION}/node-v{VERSION}-linux-x64.tar.xz"


def digest(path: Path) -> str:
    if path.is_symlink() or not path.is_file():
        return ""
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def prepare(archive: Path, tool_cache: Path, version: str, expected: str, url: str) -> None:
    started = time.monotonic()
    parent = tool_cache / "node" / version
    target = parent / "x64"
    marker = parent / "x64.complete"
    if marker.is_file() and (target / "bin/node").is_file():
        actual = subprocess.check_output([str(target / "bin/node"), "--version"], text=True).strip()
        if actual != f"v{version}":
            raise ValueError("Runner Node tool cache has the wrong version")
        print("Using runner-provided Node tool cache")
        return
    if target.exists() or target.is_symlink():
        raise ValueError("Refusing to overwrite an incomplete Node tool cache")
    archive.parent.mkdir(parents=True, exist_ok=True)
    hit = digest(archive) == expected
    if not hit:
        # Only this owned temporary file is replaced; a restored symlink is never followed.
        fd, filename = tempfile.mkstemp(prefix="node-download-", dir=archive.parent)
        os.close(fd)
        download = Path(filename)
        try:
            subprocess.run(["curl", "--fail", "--location", "--output", str(download), url], check=True)
            if digest(download) != expected:
                raise ValueError("Official Node archive checksum mismatch")
            download.replace(archive)
        finally:
            download.unlink(missing_ok=True)
    parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".node-install-", dir=parent))
    try:
        subprocess.run(["tar", "-xJf", str(archive), "--strip-components=1", "-C", str(stage)], check=True)
        actual = subprocess.check_output([str(stage / "bin/node"), "--version"], text=True).strip()
        if actual != f"v{version}":
            raise ValueError("Official Node archive has the wrong version")
        stage.rename(target)
        marker.touch()
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    print(f"Node archive verified; cache_hit={str(hit).lower()}; milliseconds={round((time.monotonic() - started) * 1000)}")


if __name__ == "__main__":
    if os.uname().sysname != "Linux" or os.uname().machine != "x86_64":
        raise SystemExit("CI Node archive requires Linux x86_64")
    prepare(Path(os.environ["RUNNER_TEMP"]) / "ci-node-22.23.2-linux-x64.tar.xz",
            Path(os.environ["RUNNER_TOOL_CACHE"]), VERSION, SHA256, URL)
