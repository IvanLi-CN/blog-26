#!/usr/bin/env bash
set -euo pipefail

api_root="${GITHUB_API_URL:-https://api.github.com}"
repo="${GITHUB_REPOSITORY:-}"
token="${GITHUB_TOKEN:-}"
sha="${WORKFLOW_RUN_SHA:-${COMMIT_SHA:-${GITHUB_SHA:-}}}"

if [[ -z "${repo}" ]]; then
  echo "release-intent: missing GITHUB_REPOSITORY" >&2
  exit 2
fi

if [[ -z "${token}" ]]; then
  echo "release-intent: missing GITHUB_TOKEN" >&2
  exit 2
fi

if [[ -z "${sha}" ]]; then
  echo "release-intent: missing WORKFLOW_RUN_SHA/COMMIT_SHA/GITHUB_SHA" >&2
  exit 2
fi

write_output() {
  local key="$1"
  local value="$2"

  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "${key}=${value}" >> "${GITHUB_OUTPUT}"
  fi
}

emit_skip() {
  local reason="$1"
  echo "release-intent: should_release=false reason=${reason}"
  write_output "should_release" "false"
  write_output "bump_level" ""
  write_output "channel" ""
  write_output "intent_type" ""
  write_output "pr_number" ""
  write_output "pr_url" ""
  write_output "reason" "${reason}"
}

emit_failure() {
  local reason="$1"
  echo "release-intent: ${reason}" >&2
  write_output "should_release" "false"
  write_output "bump_level" ""
  write_output "channel" ""
  write_output "intent_type" ""
  write_output "pr_number" ""
  write_output "pr_url" ""
  write_output "reason" "${reason}"
  exit 3
}

pulls_json=""
if ! pulls_json="$(
  curl -fsSL \
    --retry 3 \
    --retry-delay 2 \
    --retry-all-errors \
    --max-time 20 \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${token}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${api_root}/repos/${repo}/commits/${sha}/pulls?per_page=100"
)"; then
  emit_failure "api_failure:commit_pulls"
fi

export pulls_json
pull_info="$(
  python3 - <<'PY'
from __future__ import annotations

import json
import os
import sys

pulls = json.loads(os.environ["pulls_json"])
if not isinstance(pulls, list):
    print("count=0")
    sys.exit(0)

print(f"count={len(pulls)}")
if len(pulls) != 1:
    sys.exit(0)

pull = pulls[0]
number = pull.get("number")
url = pull.get("html_url", "")
if not isinstance(number, int):
    print("count=0")
    sys.exit(0)

print(f"pr_number={number}")
print(f"pr_url={url}")
PY
)"

count="$(echo "${pull_info}" | sed -n 's/^count=//p')"
pr_number="$(echo "${pull_info}" | sed -n 's/^pr_number=//p')"
pr_url="$(echo "${pull_info}" | sed -n 's/^pr_url=//p')"

if [[ "${count}" != "1" ]] || [[ -z "${pr_number}" ]]; then
  emit_skip "ambiguous_or_missing_pr(count=${count:-0})"
  exit 0
fi

labels_json=""
if ! labels_json="$(
  curl -fsSL \
    --retry 3 \
    --retry-delay 2 \
    --retry-all-errors \
    --max-time 20 \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${token}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${api_root}/repos/${repo}/issues/${pr_number}/labels?per_page=100"
)"; then
  emit_failure "api_failure:pr_labels"
fi

export labels_json
decision="$(
  python3 - <<'PY'
from __future__ import annotations

import json
import os

allowed_types = {
    "type:docs",
    "type:skip",
    "type:patch",
    "type:minor",
    "type:major",
}
allowed_channels = {"channel:stable", "channel:rc"}

labels = json.loads(os.environ["labels_json"])
names = [item.get("name", "") for item in labels if isinstance(item, dict)]

type_like = sorted({name for name in names if name.startswith("type:")})
channel_like = sorted({name for name in names if name.startswith("channel:")})

unknown_type = sorted({name for name in type_like if name not in allowed_types})
unknown_channel = sorted({name for name in channel_like if name not in allowed_channels})
present_type = sorted({name for name in names if name in allowed_types})
present_channel = sorted({name for name in names if name in allowed_channels})

if unknown_type or unknown_channel:
    unknown_all = unknown_type + unknown_channel
    print("should_release=false")
    print("bump_level=")
    print("channel=")
    print("intent_type=")
    print(f"reason=unknown_label({','.join(unknown_all)})")
    raise SystemExit(0)

if len(present_type) != 1 or len(present_channel) != 1:
    print("should_release=false")
    print("bump_level=")
    print("channel=")
    print("intent_type=")
    print(f"reason=invalid_label_count(type={len(present_type)},channel={len(present_channel)})")
    raise SystemExit(0)

intent = present_type[0]
channel_label = present_channel[0]
channel = channel_label.removeprefix("channel:")

if intent in {"type:docs", "type:skip"}:
    print("should_release=false")
    print("bump_level=")
    print(f"channel={channel}")
    print(f"intent_type={intent}")
    print("reason=intent_skip")
    raise SystemExit(0)

bump_level = intent.removeprefix("type:")
print("should_release=true")
print(f"bump_level={bump_level}")
print(f"channel={channel}")
print(f"intent_type={intent}")
print("reason=intent_release")
PY
)"

should_release="$(echo "${decision}" | sed -n 's/^should_release=//p')"
bump_level="$(echo "${decision}" | sed -n 's/^bump_level=//p')"
channel="$(echo "${decision}" | sed -n 's/^channel=//p')"
intent_type="$(echo "${decision}" | sed -n 's/^intent_type=//p')"
reason="$(echo "${decision}" | sed -n 's/^reason=//p')"

echo "release-intent:"
echo "  sha=${sha}"
echo "  pr_number=${pr_number}"
echo "  intent_type=${intent_type:-<none>}"
echo "  channel=${channel:-<none>}"
echo "  should_release=${should_release}"
echo "  bump_level=${bump_level:-<none>}"
echo "  reason=${reason}"

write_output "should_release" "${should_release}"
write_output "bump_level" "${bump_level}"
write_output "channel" "${channel}"
write_output "intent_type" "${intent_type}"
write_output "pr_number" "${pr_number}"
write_output "pr_url" "${pr_url}"
write_output "reason" "${reason}"
