import { handlePublicApiRequest } from "@/server/public-api/router";

function getSubPath(segments: string[] | undefined) {
  if (!segments || segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}

export async function GET(request: Request, context: { params: Promise<{ segments?: string[] }> }) {
  const { segments } = await context.params;
  return handlePublicApiRequest(request, getSubPath(segments));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ segments?: string[] }> }
) {
  const { segments } = await context.params;
  return handlePublicApiRequest(request, getSubPath(segments));
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ segments?: string[] }> }
) {
  const { segments } = await context.params;
  return handlePublicApiRequest(request, getSubPath(segments));
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ segments?: string[] }> }
) {
  const { segments } = await context.params;
  return handlePublicApiRequest(request, getSubPath(segments));
}
