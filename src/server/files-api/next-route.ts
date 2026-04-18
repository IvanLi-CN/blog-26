import { filesApiDynamic, filesApiRuntime, handleFilesApiRequest } from "./router";

export { filesApiDynamic, filesApiRuntime };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string; path: string[] }> }
) {
  return handleFilesApiRequest(request, await params);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ source: string; path: string[] }> }
) {
  return handleFilesApiRequest(request, await params);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ source: string; path: string[] }> }
) {
  return handleFilesApiRequest(request, await params);
}
