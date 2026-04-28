#!/usr/bin/env bash
set -euo pipefail

component="${COMPONENT:-}"
bump_level="${BUMP_LEVEL:-}"
channel="${CHANNEL:-}"
commit_sha="${COMMIT_SHA:-${WORKFLOW_RUN_SHA:-${GITHUB_SHA:-}}}"

if [[ -z "${component}" ]]; then
  echo "compute-version: missing COMPONENT (frontend|backend|image)" >&2
  exit 2
fi

case "${component}" in
  frontend|backend|image) ;;
  *)
    echo "compute-version: invalid COMPONENT=${component}" >&2
    exit 2
    ;;
esac

if [[ -z "${bump_level}" ]]; then
  echo "compute-version: missing BUMP_LEVEL (major|minor|patch)" >&2
  exit 2
fi

case "${bump_level}" in
  major|minor|patch) ;;
  *)
    echo "compute-version: invalid BUMP_LEVEL=${bump_level}" >&2
    exit 2
    ;;
esac

if [[ -z "${channel}" ]]; then
  echo "compute-version: missing CHANNEL (stable|rc)" >&2
  exit 2
fi

case "${channel}" in
  stable|rc) ;;
  *)
    echo "compute-version: invalid CHANNEL=${channel}" >&2
    exit 2
    ;;
esac

if [[ -z "${commit_sha}" ]]; then
  echo "compute-version: missing COMMIT_SHA/WORKFLOW_RUN_SHA/GITHUB_SHA" >&2
  exit 2
fi

sha7="$(echo "${commit_sha}" | cut -c1-7)"
if [[ ${#sha7} -ne 7 ]]; then
  echo "compute-version: invalid short sha derived from commit ${commit_sha}" >&2
  exit 2
fi

if [[ "${SKIP_FETCH_TAGS:-false}" != "true" ]]; then
  if ! git fetch --tags --force >/dev/null 2>&1; then
    echo "compute-version: failed to fetch tags from remote" >&2
    exit 3
  fi
fi

write_output() {
  local key="$1"
  local value="$2"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "${key}=${value}" >> "${GITHUB_OUTPUT}"
  fi
}

write_env() {
  local key="$1"
  local value="$2"
  if [[ -n "${GITHUB_ENV:-}" ]]; then
    echo "${key}=${value}" >> "${GITHUB_ENV}"
  fi
}

if [[ "${component}" == "image" ]]; then
  tag_prefix="v"
  stable_pattern="^v[0-9]+\.[0-9]+\.[0-9]+$"
  rc_pattern="^v[0-9]+\.[0-9]+\.[0-9]+-rc\.${sha7}$"
else
  tag_prefix="${component}-v"
  stable_pattern="^${component}-v[0-9]+\.[0-9]+\.[0-9]+$"
  rc_pattern="^${component}-v[0-9]+\.[0-9]+\.[0-9]+-rc\.${sha7}$"
fi

head_tags="$(git tag --points-at "${commit_sha}" || true)"
if [[ "${channel}" == "stable" ]]; then
  existing_tag="$({ echo "${head_tags}" | grep -E "${stable_pattern}" || true; } | sort -V | tail -n 1)"
else
  existing_tag="$({ echo "${head_tags}" | grep -E "${rc_pattern}" || true; } | sort -V | tail -n 1)"
fi

if [[ -n "${existing_tag}" ]]; then
  release_tag="${existing_tag}"
  app_version="${release_tag#${tag_prefix}}"
  release_major="$(echo "${app_version}" | cut -d. -f1)"
  is_prerelease="$([[ "${channel}" == "rc" ]] && echo true || echo false)"
  write_output "release_tag" "${release_tag}"
  write_output "app_version" "${app_version}"
  write_output "is_prerelease" "${is_prerelease}"
  write_output "release_major" "${release_major}"
  write_env "RELEASE_TAG" "${release_tag}"
  write_env "APP_EFFECTIVE_VERSION" "${app_version}"
  write_env "IS_PRERELEASE" "${is_prerelease}"
  write_env "RELEASE_MAJOR" "${release_major}"
  echo "compute-version: reusing existing ${component} tag ${release_tag}"
  exit 0
fi

max_stable_tag="$({
  git tag -l "${tag_prefix}*" \
    | grep -E "${stable_pattern}" \
    | sed -E "s/^${tag_prefix}//" \
    || true
} | sort -Vu | tail -n 1)"

legacy_stable_tag="$({
  git tag -l "v*" \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sed -E 's/^v//' \
    || true
} | sort -Vu | tail -n 1)"

package_version="$({
  node -e "const p=require('./package.json'); process.stdout.write((p.version||'').trim())"
} || true)"

if [[ -z "${max_stable_tag}" ]]; then
  if [[ -n "${legacy_stable_tag}" ]]; then
    base_version="${legacy_stable_tag}"
  elif [[ "${package_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    base_version="${package_version}"
  else
    echo "compute-version: no stable ${component} or legacy tag and package.json version is not semver: ${package_version}" >&2
    exit 2
  fi
else
  base_version="${max_stable_tag}"
fi

base_major="$(echo "${base_version}" | cut -d. -f1)"
base_minor="$(echo "${base_version}" | cut -d. -f2)"
base_patch="$(echo "${base_version}" | cut -d. -f3)"

case "${bump_level}" in
  major)
    next_major="$((base_major + 1))"
    next_minor="0"
    next_patch="0"
    ;;
  minor)
    next_major="${base_major}"
    next_minor="$((base_minor + 1))"
    next_patch="0"
    ;;
  patch)
    next_major="${base_major}"
    next_minor="${base_minor}"
    next_patch="$((base_patch + 1))"
    ;;
esac

if [[ "${channel}" == "stable" ]]; then
  candidate_patch="${next_patch}"
  while git rev-parse -q --verify "refs/tags/${tag_prefix}${next_major}.${next_minor}.${candidate_patch}" >/dev/null; do
    candidate_patch="$((candidate_patch + 1))"
  done
  stable_version="${next_major}.${next_minor}.${candidate_patch}"
  release_tag="${tag_prefix}${stable_version}"
  is_prerelease="false"
else
  stable_version="${next_major}.${next_minor}.${next_patch}"
  release_tag="${tag_prefix}${stable_version}-rc.${sha7}"
  is_prerelease="true"
fi

app_version="${release_tag#${tag_prefix}}"
release_major="${next_major}"

write_output "release_tag" "${release_tag}"
write_output "app_version" "${app_version}"
write_output "is_prerelease" "${is_prerelease}"
write_output "release_major" "${release_major}"
write_env "RELEASE_TAG" "${release_tag}"
write_env "APP_EFFECTIVE_VERSION" "${app_version}"
write_env "IS_PRERELEASE" "${is_prerelease}"
write_env "RELEASE_MAJOR" "${release_major}"

echo "compute-version:"
echo "  component=${component}"
echo "  base_version=${base_version}"
echo "  bump_level=${bump_level}"
echo "  channel=${channel}"
echo "  release_tag=${release_tag}"
