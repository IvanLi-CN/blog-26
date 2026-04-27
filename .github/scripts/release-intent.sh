#!/usr/bin/env bash
set -euo pipefail

api_root="${GITHUB_API_URL:-https://api.github.com}"
repo="${GITHUB_REPOSITORY:-}"
token="${GITHUB_TOKEN:-}"
sha="${WORKFLOW_RUN_SHA:-${COMMIT_SHA:-${GITHUB_SHA:-}}}"
target_branch="${TARGET_BRANCH:-main}"
is_latest_branch_head="true"

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

if [[ -z "${target_branch}" ]]; then
  echo "release-intent: missing TARGET_BRANCH/main branch name" >&2
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
  write_output "frontend_release" "false"
  write_output "backend_release" "false"
  write_output "components" ""
  write_output "pr_number" ""
  write_output "pr_url" ""
  write_output "is_latest_branch_head" "${is_latest_branch_head}"
  write_output "reason" "${reason}"
}

emit_failure() {
  local reason="$1"
  echo "release-intent: ${reason}" >&2
  write_output "should_release" "false"
  write_output "bump_level" ""
  write_output "channel" ""
  write_output "intent_type" ""
  write_output "frontend_release" "false"
  write_output "backend_release" "false"
  write_output "components" ""
  write_output "pr_number" ""
  write_output "pr_url" ""
  write_output "is_latest_branch_head" "${is_latest_branch_head}"
  write_output "reason" "${reason}"
  exit 3
}

branch_ref_json=""
if ! branch_ref_json="$(
  curl -fsSL \
    --retry 3 \
    --retry-delay 2 \
    --retry-all-errors \
    --max-time 20 \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${token}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${api_root}/repos/${repo}/git/ref/heads/${target_branch}"
)"; then
  emit_failure "api_failure:branch_head"
fi

export branch_ref_json
branch_head_sha="$({
  python3 - <<'PY'
from __future__ import annotations

import json
import os

payload = json.loads(os.environ["branch_ref_json"])
sha = payload.get("object", {}).get("sha", "")
if isinstance(sha, str):
    print(sha.strip())
PY
} || true)"

if [[ -z "${branch_head_sha}" ]]; then
  emit_failure "api_failure:branch_head_parse"
fi

if [[ "${branch_head_sha}" != "${sha}" ]]; then
  is_latest_branch_head="false"
  echo "release-intent: non-head commit on ${target_branch}; continue with commit-level intent resolution"
fi

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
  echo "release-intent: commit_pulls API failed; falling back to closed PR merge_commit_sha scan" >&2

  closed_pulls_json=""
  if ! closed_pulls_json="$(
    curl -fsSL \
      --retry 3 \
      --retry-delay 2 \
      --retry-all-errors \
      --max-time 20 \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${token}" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "${api_root}/repos/${repo}/pulls?state=closed&base=${target_branch}&sort=updated&direction=desc&per_page=100"
  )"; then
    emit_failure "api_failure:commit_pulls"
  fi

  closed_pulls_file="$(mktemp)"
  printf '%s' "${closed_pulls_json}" > "${closed_pulls_file}"
  export closed_pulls_file sha
  pulls_json="$({
    python3 - <<'PY'
from __future__ import annotations

import json
import os

target_sha = os.environ["sha"]
with open(os.environ["closed_pulls_file"], "r", encoding="utf-8") as handle:
    payload = json.load(handle)
if not isinstance(payload, list):
    print("[]")
    raise SystemExit(0)

matches = []
for pull in payload:
    if not isinstance(pull, dict):
        continue
    merge_sha = str(pull.get("merge_commit_sha") or "")
    head_sha = str((pull.get("head") or {}).get("sha") or "")
    if target_sha in {merge_sha, head_sha}:
        matches.append(pull)

print(json.dumps(matches))
PY
  } || true)"
  rm -f "${closed_pulls_file}"

  if [[ -z "${pulls_json}" ]]; then
    emit_failure "api_failure:commit_pulls_fallback_parse"
  fi
fi

export pulls_json
pull_info="$({
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
merged_at = pull.get("merged_at", "")
if not isinstance(number, int):
    print("count=0")
    sys.exit(0)

print(f"pr_number={number}")
print(f"pr_url={url}")
print(f"pr_merged_at={merged_at}")
PY
} || true)"

count="$(echo "${pull_info}" | sed -n 's/^count=//p')"
pr_number="$(echo "${pull_info}" | sed -n 's/^pr_number=//p')"
pr_url="$(echo "${pull_info}" | sed -n 's/^pr_url=//p')"
pr_merged_at="$(echo "${pull_info}" | sed -n 's/^pr_merged_at=//p')"

if [[ "${count}" != "1" ]] || [[ -z "${pr_number}" ]]; then
  emit_skip "ambiguous_or_missing_pr(count=${count:-0})"
  exit 0
fi

if [[ -z "${pr_merged_at}" ]]; then
  emit_skip "pr_not_merged_or_missing_merged_at"
  exit 0
fi

post_merge_release_label_events="0"
events_page="1"
events_page_max="30"
while :; do
  events_json=""
  if ! events_json="$(
    curl -fsSL \
      --retry 3 \
      --retry-delay 2 \
      --retry-all-errors \
      --max-time 20 \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${token}" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "${api_root}/repos/${repo}/issues/${pr_number}/events?per_page=100&page=${events_page}"
  )"; then
    emit_failure "api_failure:pr_issue_events(page=${events_page})"
  fi

  export events_json pr_merged_at
  page_analysis="$({
    python3 - <<'PY'
from __future__ import annotations

import json
import os
from datetime import datetime, timezone


def parse_ts(value: str) -> datetime | None:
    if not value:
        return None
    normalized = value
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        ts = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


merged_at = parse_ts(os.environ.get("pr_merged_at", ""))
if merged_at is None:
    print("events=-1")
    print("mutations=-1")
    raise SystemExit(0)

payload = json.loads(os.environ["events_json"])
if not isinstance(payload, list):
    print("events=-1")
    print("mutations=-1")
    raise SystemExit(0)

allowed_prefixes = ("type:", "channel:", "release:")
mutations = 0
for item in payload:
    if not isinstance(item, dict):
        continue
    event = str(item.get("event", ""))
    if event not in {"labeled", "unlabeled"}:
        continue
    label_name = str(item.get("label", {}).get("name", ""))
    if not label_name.startswith(allowed_prefixes):
        continue
    created_at = parse_ts(str(item.get("created_at", "")))
    if created_at is None:
        continue
    if created_at >= merged_at:
        mutations += 1

print(f"events={len(payload)}")
print(f"mutations={mutations}")
PY
  } || true)"

  page_events="$(echo "${page_analysis}" | sed -n 's/^events=//p')"
  page_mutations="$(echo "${page_analysis}" | sed -n 's/^mutations=//p')"

  if [[ "${page_events}" == "-1" ]] || [[ "${page_mutations}" == "-1" ]]; then
    emit_failure "api_failure:post_merge_label_check"
  fi

  post_merge_release_label_events="$((post_merge_release_label_events + page_mutations))"

  if [[ "${page_events}" -lt 100 ]]; then
    break
  fi

  events_page="$((events_page + 1))"
  if [[ "${events_page}" -gt "${events_page_max}" ]]; then
    emit_failure "api_failure:pr_issue_events_page_limit(max=${events_page_max})"
  fi
done

if [[ "${post_merge_release_label_events}" != "0" ]]; then
  emit_failure "post_merge_label_mutation(count=${post_merge_release_label_events})"
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
decision="$({
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
allowed_components = {"release:frontend", "release:backend"}

labels = json.loads(os.environ["labels_json"])
names = [item.get("name", "") for item in labels if isinstance(item, dict)]

type_like = sorted({name for name in names if name.startswith("type:")})
channel_like = sorted({name for name in names if name.startswith("channel:")})
component_like = sorted({name for name in names if name.startswith("release:")})

unknown_type = sorted({name for name in type_like if name not in allowed_types})
unknown_channel = sorted({name for name in channel_like if name not in allowed_channels})
unknown_component = sorted({name for name in component_like if name not in allowed_components})
present_type = sorted({name for name in names if name in allowed_types})
present_channel = sorted({name for name in names if name in allowed_channels})
present_component = sorted({name for name in names if name in allowed_components})

if unknown_type or unknown_channel or unknown_component:
    unknown_all = unknown_type + unknown_channel + unknown_component
    print("should_release=false")
    print("bump_level=")
    print("channel=")
    print("intent_type=")
    print("frontend_release=false")
    print("backend_release=false")
    print("components=")
    print(f"reason=unknown_label({','.join(unknown_all)})")
    raise SystemExit(0)

if len(present_type) != 1 or len(present_channel) != 1:
    print("should_release=false")
    print("bump_level=")
    print("channel=")
    print("intent_type=")
    print("frontend_release=false")
    print("backend_release=false")
    print("components=")
    print(
        f"reason=invalid_label_count(type={len(present_type)},channel={len(present_channel)},release={len(present_component)})"
    )
    raise SystemExit(0)

intent = present_type[0]
channel_label = present_channel[0]
channel = channel_label.removeprefix("channel:")

if intent in {"type:docs", "type:skip"}:
    print("should_release=false")
    print("bump_level=")
    print(f"channel={channel}")
    print(f"intent_type={intent}")
    print("frontend_release=false")
    print("backend_release=false")
    print("components=")
    print("reason=intent_skip")
    raise SystemExit(0)

if len(present_component) == 0:
    print("should_release=false")
    print("bump_level=")
    print(f"channel={channel}")
    print(f"intent_type={intent}")
    print("frontend_release=false")
    print("backend_release=false")
    print("components=")
    print(
        f"reason=invalid_label_count(type={len(present_type)},channel={len(present_channel)},release={len(present_component)})"
    )
    raise SystemExit(0)

bump_level = intent.removeprefix("type:")
if bump_level == "major" and len(present_component) != len(allowed_components):
    print("should_release=false")
    print(f"bump_level={bump_level}")
    print(f"channel={channel}")
    print(f"intent_type={intent}")
    print("frontend_release=false")
    print("backend_release=false")
    print("components=")
    print("reason=invalid_major_release_targets")
    raise SystemExit(0)

components = []
frontend_release = "release:frontend" in present_component
backend_release = "release:backend" in present_component
if frontend_release:
    components.append("frontend")
if backend_release:
    components.append("backend")

print("should_release=true")
print(f"bump_level={bump_level}")
print(f"channel={channel}")
print(f"intent_type={intent}")
print(f"frontend_release={'true' if frontend_release else 'false'}")
print(f"backend_release={'true' if backend_release else 'false'}")
print(f"components={','.join(components)}")
print("reason=intent_release")
PY
} || true)"

should_release="$(echo "${decision}" | sed -n 's/^should_release=//p')"
bump_level="$(echo "${decision}" | sed -n 's/^bump_level=//p')"
channel="$(echo "${decision}" | sed -n 's/^channel=//p')"
intent_type="$(echo "${decision}" | sed -n 's/^intent_type=//p')"
frontend_release="$(echo "${decision}" | sed -n 's/^frontend_release=//p')"
backend_release="$(echo "${decision}" | sed -n 's/^backend_release=//p')"
components="$(echo "${decision}" | sed -n 's/^components=//p')"
reason="$(echo "${decision}" | sed -n 's/^reason=//p')"

if [[ "${reason}" == unknown_label\(* ]] || [[ "${reason}" == invalid_label_count\(* ]] || [[ "${reason}" == "invalid_major_release_targets" ]]; then
  emit_failure "${reason}"
fi

echo "release-intent:"
echo "  sha=${sha}"
echo "  is_latest_branch_head=${is_latest_branch_head}"
echo "  pr_number=${pr_number}"
echo "  intent_type=${intent_type:-<none>}"
echo "  channel=${channel:-<none>}"
echo "  should_release=${should_release}"
echo "  components=${components:-<none>}"
echo "  bump_level=${bump_level:-<none>}"
echo "  reason=${reason}"

write_output "should_release" "${should_release}"
write_output "bump_level" "${bump_level}"
write_output "channel" "${channel}"
write_output "intent_type" "${intent_type}"
write_output "frontend_release" "${frontend_release}"
write_output "backend_release" "${backend_release}"
write_output "components" "${components}"
write_output "pr_number" "${pr_number}"
write_output "pr_url" "${pr_url}"
write_output "is_latest_branch_head" "${is_latest_branch_head}"
write_output "reason" "${reason}"
