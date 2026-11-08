"""Copy the Git-selected fixture files without spawning a shell per file."""

import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time


def copy_snapshot(root: Path, destination: Path) -> None:
    started = time.perf_counter()
    copied, total_bytes = 0, 0
    root, destination = root.resolve(), destination.resolve()
    if root == destination or root in destination.parents or destination in root.parents:
        raise ValueError("Snapshot source and destination must be disjoint")
    selected = subprocess.check_output(
        ["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z"]
    )
    mask = os.umask(0)
    os.umask(mask)
    for entry in selected.split(b"\0"):
        if not entry:
            continue
        relative = Path(os.fsdecode(entry))
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Snapshot input escapes its source")
        source, target = root / relative, destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        existed = target.exists()
        # Match plain cp: follow file links, preserve an existing destination's mode,
        # and apply the umask to the source mode for newly created files.
        shutil.copyfile(source, target)
        info = source.stat()
        if not existed:
            target.chmod(stat.S_IMODE(info.st_mode) & 0o777 & ~mask)
        copied += 1
        total_bytes += info.st_size
    print(json.dumps({"event": "worktree-snapshot-copy", "files": copied, "bytes": total_bytes, "milliseconds": round((time.perf_counter() - started) * 1000)}))


if __name__ == "__main__":
    copy_snapshot(Path(sys.argv[1]), Path(sys.argv[2]))
