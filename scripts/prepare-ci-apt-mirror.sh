#!/usr/bin/env bash
set -euo pipefail

# Only run on disposable GitHub-hosted Linux runners, never on a developer host.
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${RUNNER_ENVIRONMENT:-}" != "github-hosted" || "$(uname -s)" != "Linux" ]]; then
  echo "This script requires a GitHub-hosted Linux runner." >&2
  exit 1
fi

# Playwright installs the full system dependency/font set through apt. Azure's
# Ubuntu mirror has caused multi-minute font downloads; keep the packages and
# suites unchanged and use Ubuntu's official HTTPS archive instead.
for source in /etc/apt/apt-mirrors.txt /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  [[ -f "$source" ]] || continue
  if grep -Eq 'https?://azure\.archive\.ubuntu\.com/ubuntu' "$source"; then
    echo "Using Ubuntu archive in $source"
    sudo sed -i -E 's@https?://azure\.archive\.ubuntu\.com/ubuntu@https://archive.ubuntu.com/ubuntu@g' "$source"
  fi
done
