#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


def env(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    if value is None:
        return default
    return value


def env_bool(name: str, default: bool = False) -> bool:
    value = env(name, "")
    if not value:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def write_output(key: str, value: str) -> None:
    output_path = env("GITHUB_OUTPUT")
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as handle:
        handle.write(f"{key}={value}\n")


def log(message: str) -> None:
    print(f"release-receipt: {message}")


def parse_json_env(name: str, default: Any) -> Any:
    raw = env(name, "")
    if not raw:
        return default
    return json.loads(raw)


class ReceiptCommentError(RuntimeError):
    """Base error for managed release receipt comment operations."""


class ReceiptPermissionError(ReceiptCommentError):
    """GitHub token cannot manage the PR receipt comment in this run context."""


@dataclass
class Config:
    api_root: str
    repo: str
    token: str
    pr_number: str
    pr_url: str
    should_release: bool
    head_sha: str
    intent_type: str
    channel: str
    frontend_release: bool
    backend_release: bool
    frontend_release_tag: str
    backend_release_tag: str
    image_release_tag: str
    is_latest_branch_head: bool
    workflow_event_name: str
    workflow_run_url: str
    workflow_run_attempt: str
    publish_frontend_result: str
    publish_backend_result: str
    publish_image_result: str
    deploy_frontend_edgeone_result: str
    edgeone_status: str
    dry_run: bool
    issue_comments_json: Any

    @property
    def expected_frontend(self) -> bool:
        return self.frontend_release

    @property
    def expected_backend(self) -> bool:
        return self.backend_release

    @property
    def expected_image(self) -> bool:
        return self.frontend_release or self.backend_release

    @property
    def repo_lower(self) -> str:
        return self.repo.lower()

    @property
    def marker(self) -> str:
        return f"<!-- release-receipt:managed repo={self.repo} pr={self.pr_number} -->"


class GitHubApi:
    def __init__(self, config: Config) -> None:
        self.config = config

    def request(self, method: str, path: str, payload: Any | None = None) -> Any:
        if self.config.dry_run and method in {"POST", "PATCH", "DELETE"}:
            log(f"dry-run {method} {path}")
            if payload is not None:
                log(f"dry-run payload keys={','.join(sorted(payload.keys()))}")
            if method == "DELETE":
                return None
            return {
                "id": 0,
                "html_url": f"{self.config.pr_url}#issuecomment-dry-run",
            }

        url = f"{self.config.api_root}{path}"
        data = None
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.config.token:
            headers["Authorization"] = f"Bearer {self.config.token}"
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        last_error: Exception | None = None
        for attempt in range(1, 4):
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    body = response.read().decode("utf-8")
                if not body:
                    return None
                return json.loads(body)
            except urllib.error.HTTPError as exc:
                if 500 <= exc.code < 600 and attempt < 3:
                    last_error = exc
                    time.sleep(attempt * 2)
                    continue
                detail = exc.read().decode("utf-8", errors="replace")
                message = f"GitHub API {method} {path} failed: {exc.code} {detail}"
                if exc.code == 403:
                    raise ReceiptPermissionError(message) from exc
                raise ReceiptCommentError(message) from exc
            except urllib.error.URLError as exc:
                last_error = exc
                if attempt < 3:
                    time.sleep(attempt * 2)
                    continue
                raise ReceiptCommentError(f"GitHub API {method} {path} failed: {exc}") from exc
        raise ReceiptCommentError(f"GitHub API {method} {path} failed after retries: {last_error}")

    def list_issue_comments(self) -> list[dict[str, Any]]:
        if self.config.issue_comments_json is not None:
            payload = self.config.issue_comments_json
            if not isinstance(payload, list):
                raise ReceiptCommentError("ISSUE_COMMENTS_JSON must be a JSON array")
            return [item for item in payload if isinstance(item, dict)]

        comments: list[dict[str, Any]] = []
        page = 1
        while True:
            path = f"/repos/{self.config.repo}/issues/{self.config.pr_number}/comments?per_page=100&page={page}"
            payload = self.request("GET", path)
            if not isinstance(payload, list):
                raise ReceiptCommentError("GitHub issue comments response is not a list")
            page_items = [item for item in payload if isinstance(item, dict)]
            comments.extend(page_items)
            if len(page_items) < 100:
                break
            page += 1
            if page > 30:
                raise ReceiptCommentError("Issue comments pagination exceeded 30 pages")
        return comments


def parse_iso8601(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def ensure_successful_release(config: Config) -> tuple[bool, str]:
    if not config.should_release:
        return False, "should_release=false"
    if not config.pr_number:
        return False, "missing pr_number"
    if config.expected_frontend and config.publish_frontend_result != "success":
        return False, f"frontend job result={config.publish_frontend_result}"
    if config.expected_backend and config.publish_backend_result != "success":
        return False, f"backend job result={config.publish_backend_result}"
    if config.expected_image and config.publish_image_result != "success":
        return False, f"image job result={config.publish_image_result}"
    if config.expected_frontend and config.deploy_frontend_edgeone_result not in {"success", "skipped"}:
        return False, f"edgeone job result={config.deploy_frontend_edgeone_result}"
    return True, "ready"


def release_url(repo: str, tag: str) -> str:
    encoded_tag = urllib.parse.quote(tag, safe="")
    return f"https://github.com/{repo}/releases/tag/{encoded_tag}"


def render_edgeone_line(config: Config) -> str | None:
    if not config.expected_frontend:
        return None

    status = config.edgeone_status.strip()
    if status == "deployed":
        return "- EdgeOne Makers: deployed"

    reason_map = {
        "skipped_initial_non_head": "skipped because the release commit was not the latest `main` head when this run started",
        "skipped_recheck_head_moved": "skipped because `main` moved before the deploy step re-check completed",
        "skipped_prerelease": "skipped because `channel:rc` never deploys a production frontend",
        "skipped_frontend_not_released": "skipped because this PR did not publish `frontend`",
        "skipped_unknown": "skipped by workflow contract",
    }

    if not status:
        if not config.is_latest_branch_head:
            status = "skipped_initial_non_head"
        elif config.deploy_frontend_edgeone_result == "skipped":
            status = "skipped_unknown"

    reason = reason_map.get(status, f"skipped ({status})")
    return f"- EdgeOne Makers: {reason}"


def build_comment_body(config: Config) -> str:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    release_targets = []
    if config.expected_frontend:
        release_targets.append("release:frontend")
    if config.expected_backend:
        release_targets.append("release:backend")

    trigger_label = f"`{config.workflow_event_name}`"
    if config.workflow_event_name == "workflow_dispatch":
        trigger_label += " (manual backfill)"

    lines = [
        config.marker,
        "## Release Receipt",
        "",
        "This comment is managed by the release workflow. Reruns and backfills update the same receipt.",
        "",
        f"- PR: [#{config.pr_number}]({config.pr_url})",
        f"- head_sha: `{config.head_sha}`",
        f"- trigger: {trigger_label}",
        f"- intent: `{config.intent_type}`",
        f"- channel: `{config.channel}`",
        f"- release targets: `{', '.join(release_targets)}`",
    ]

    if config.expected_frontend and config.frontend_release_tag:
        tag = config.frontend_release_tag
        lines.append(f"- frontend release: [`{tag}`]({release_url(config.repo, tag)})")

    if config.expected_backend and config.backend_release_tag:
        tag = config.backend_release_tag
        lines.append(f"- backend release: [`{tag}`]({release_url(config.repo, tag)})")

    if config.expected_image and config.image_release_tag:
        lines.append(f"- image release: `ghcr.io/{config.repo_lower}:{config.image_release_tag}`")

    edgeone_line = render_edgeone_line(config)
    if edgeone_line:
        lines.append(edgeone_line)

    run_label = f"Run {env('GITHUB_RUN_ID', 'unknown')}"
    if config.workflow_run_attempt:
        run_label += f" attempt {config.workflow_run_attempt}"
    lines.append(f"- workflow run: [{run_label}]({config.workflow_run_url})")
    lines.append(f"- updated_at: `{now}`")
    lines.append("")
    return "\n".join(lines)


def select_managed_comments(config: Config, comments: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    managed = []
    for comment in comments:
        body = str(comment.get("body", ""))
        if config.marker not in body:
            continue
        managed.append(comment)

    if not managed:
        return None, []

    def sort_key(item: dict[str, Any]) -> tuple[datetime, int]:
        updated_at = str(item.get("updated_at", item.get("created_at", "1970-01-01T00:00:00Z")))
        try:
            dt = parse_iso8601(updated_at)
        except Exception:
            dt = datetime(1970, 1, 1, tzinfo=timezone.utc)
        return (dt, int(item.get("id", 0)))

    managed.sort(key=sort_key, reverse=True)
    canonical = managed[0]
    duplicates = managed[1:]
    return canonical, duplicates


def main() -> int:
    config = Config(
        api_root=env("GITHUB_API_URL", "https://api.github.com"),
        repo=env("GITHUB_REPOSITORY"),
        token=env("GITHUB_TOKEN"),
        pr_number=env("PR_NUMBER"),
        pr_url=env("PR_URL"),
        should_release=env_bool("SHOULD_RELEASE"),
        head_sha=env("HEAD_SHA"),
        intent_type=env("INTENT_TYPE"),
        channel=env("CHANNEL"),
        frontend_release=env_bool("FRONTEND_RELEASE"),
        backend_release=env_bool("BACKEND_RELEASE"),
        frontend_release_tag=env("FRONTEND_RELEASE_TAG"),
        backend_release_tag=env("BACKEND_RELEASE_TAG"),
        image_release_tag=env("IMAGE_RELEASE_TAG"),
        is_latest_branch_head=env_bool("IS_LATEST_BRANCH_HEAD"),
        workflow_event_name=env("WORKFLOW_EVENT_NAME", env("GITHUB_EVENT_NAME", "unknown")),
        workflow_run_url=env(
            "WORKFLOW_RUN_URL",
            f"{env('GITHUB_SERVER_URL', 'https://github.com')}/{env('GITHUB_REPOSITORY')}/actions/runs/{env('GITHUB_RUN_ID')}",
        ),
        workflow_run_attempt=env("GITHUB_RUN_ATTEMPT"),
        publish_frontend_result=env("PUBLISH_FRONTEND_RESULT", "skipped"),
        publish_backend_result=env("PUBLISH_BACKEND_RESULT", "skipped"),
        publish_image_result=env("PUBLISH_IMAGE_RESULT", "skipped"),
        deploy_frontend_edgeone_result=env("DEPLOY_FRONTEND_EDGEONE_RESULT", "skipped"),
        edgeone_status=env("EDGEONE_STATUS"),
        dry_run=env_bool("RELEASE_RECEIPT_DRY_RUN"),
        issue_comments_json=parse_json_env("ISSUE_COMMENTS_JSON", None),
    )

    if not config.repo:
        raise ReceiptCommentError("missing GITHUB_REPOSITORY")
    if not config.dry_run and not config.token:
        raise ReceiptCommentError("missing GITHUB_TOKEN")

    ready, reason = ensure_successful_release(config)
    if not ready:
        log(f"skip comment: {reason}")
        write_output("receipt_action", "skipped")
        write_output("receipt_reason", reason)
        return 0

    try:
        api = GitHubApi(config)
        comments = api.list_issue_comments()
        canonical, duplicates = select_managed_comments(config, comments)
        body = build_comment_body(config)

        if config.dry_run:
            print("--- release receipt body ---")
            print(body)
            print("--- end release receipt body ---")

        if canonical is None:
            created = api.request(
                "POST",
                f"/repos/{config.repo}/issues/{config.pr_number}/comments",
                {"body": body},
            )
            action = "created"
            comment_id = str(created.get("id", "")) if isinstance(created, dict) else ""
            comment_url = str(created.get("html_url", "")) if isinstance(created, dict) else ""
        else:
            comment_id = str(canonical.get("id", ""))
            updated = api.request(
                "PATCH",
                f"/repos/{config.repo}/issues/comments/{comment_id}",
                {"body": body},
            )
            action = "updated"
            comment_url = str(updated.get("html_url", "")) if isinstance(updated, dict) else str(canonical.get("html_url", ""))

        for duplicate in duplicates:
            duplicate_id = str(duplicate.get("id", ""))
            if not duplicate_id:
                continue
            api.request("DELETE", f"/repos/{config.repo}/issues/comments/{duplicate_id}")
            log(f"deleted duplicate managed comment id={duplicate_id}")

        write_output("receipt_action", action)
        write_output("receipt_reason", "comment_upserted")
        write_output("receipt_comment_id", comment_id)
        write_output("receipt_comment_url", comment_url)
        write_output("duplicate_cleanup_count", str(len(duplicates)))
        log(f"{action} managed comment id={comment_id or 'n/a'} duplicates_removed={len(duplicates)}")
    except ReceiptPermissionError as exc:
        reason = str(exc)
        write_output("receipt_action", "permission_blocked")
        write_output("receipt_reason", reason)
        write_output("receipt_comment_id", "")
        write_output("receipt_comment_url", "")
        write_output("duplicate_cleanup_count", "0")
        log(f"receipt comment permission blocked: {reason}")
        return 0
    except ReceiptCommentError as exc:
        reason = str(exc)
        write_output("receipt_action", "failed_soft")
        write_output("receipt_reason", reason)
        write_output("receipt_comment_id", "")
        write_output("receipt_comment_url", "")
        write_output("duplicate_cleanup_count", "0")
        log(f"receipt comment soft-failed: {reason}")
        return 0
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        write_output("receipt_action", "failed_soft")
        write_output("receipt_reason", str(exc))
        write_output("receipt_comment_id", "")
        write_output("receipt_comment_url", "")
        write_output("duplicate_cleanup_count", "0")
        print(f"release-receipt: error: {exc}", file=sys.stderr)
        raise SystemExit(0)
PY
