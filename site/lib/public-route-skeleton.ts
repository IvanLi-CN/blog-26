import type { PublicRouteKind } from "./public-route";

const asyncRouteKinds = new Set<PublicRouteKind>([
  "home",
  "posts",
  "post",
  "projects",
  "project",
  "tags",
  "tag",
  "memos",
  "memo",
  "playbook",
  "playbookDetail",
  "search",
]);

export function isAsyncPublicRouteKind(kind: PublicRouteKind | null | undefined) {
  return kind ? asyncRouteKinds.has(kind) : false;
}
