import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth-utils";
import { organizeTagsWithAI } from "@/server/services/tag-ai";
import {
  readTagGroupsConfig,
  validateTagGroupsConfig,
  writeTagGroupsConfig,
} from "@/server/services/tag-groups-config";
import { getTagSummaries } from "@/server/services/tag-service";

export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
}

export async function GET(request: Request) {
  if (!(await isAdminRequest(request))) {
    return forbidden();
  }

  const current = await readTagGroupsConfig();
  return NextResponse.json({ success: true, data: current });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) {
    return forbidden();
  }

  let body: { targetGroups?: number; persist?: boolean; model?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let result: Awaited<ReturnType<typeof organizeTagsWithAI>>;
  try {
    result = await organizeTagsWithAI({
      targetGroups: body.targetGroups,
      model: body.model,
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "AI grouping failed" },
      { status: 500 }
    );
  }

  if (body.persist) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    const tagSummaries = await getTagSummaries({ includeDrafts: true, includeUnpublished: true });
    const knownTags = tagSummaries.map((t) => t.name);
    const validation = validateTagGroupsConfig({ groups: result.groups }, { knownTags });
    if (validation.valid === false) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: validation.errors },
        { status: 422 }
      );
    }
    try {
      await writeTagGroupsConfig({ groups: result.groups });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "Persist failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true, data: result });
}

export async function PUT(request: Request) {
  if (!(await isAdminRequest(request))) {
    return forbidden();
  }

  const payload = await request.json();
  const groups = payload?.groups;
  if (!Array.isArray(groups)) {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }

  const tagSummaries = await getTagSummaries({ includeDrafts: true, includeUnpublished: true });
  const knownTags = tagSummaries.map((t) => t.name);
  const validation = validateTagGroupsConfig({ groups }, { knownTags });
  if (validation.valid === false) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: validation.errors },
      { status: 422 }
    );
  }

  try {
    await writeTagGroupsConfig({ groups });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Persist failed" },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
