import type { APIRoute } from "astro";
import { getStaticRouteDataEntries, readStaticRouteData } from "../lib/static-route-data";

export const prerender =
  process.env.CONSOLE_RUNTIME !== "true" && process.env.WEB_DEMO_BUILD !== "true";
export const getStaticPaths = getStaticRouteDataEntries;

export const GET: APIRoute = ({ request, params, props }) => {
  if (!params.route?.startsWith("_content/routes/"))
    return new Response("Not Found", { status: 404 });
  return readStaticRouteData(request, props.publicPath);
};
