import { SITE } from "@/config/site";
import type { PublicRoutePayload } from "./route-data";

export function publicRouteMetadata(payload: PublicRoutePayload) {
  const titles = {
    home: SITE.title,
    posts: "文章",
    projects: "项目",
    tags: "标签",
    memos: "Memos",
    playbook: "执念",
    search: "搜索",
    about: "关于我",
    notFound: "页面未找到",
  };
  let title: string;
  let description = SITE.description;
  let image: string | undefined;
  if (payload.kind === "post") {
    title = payload.data.post.title;
    description = payload.data.post.excerpt ?? description;
    image = payload.data.absoluteImageSrc ?? undefined;
  } else if (payload.kind === "project") {
    title = `${payload.data.project.title} - 项目案例`;
    description = payload.data.heroSummary;
  } else if (payload.kind === "memo") {
    title = payload.data.metadataTitle;
    description = payload.data.memoDescription;
  } else if (payload.kind === "tag") {
    title = `#${payload.data.summary.name}`;
    description = `标签 ${payload.data.summary.name} 的公开内容时间线`;
  } else if (payload.kind === "playbookDetail") title = `${payload.data.title} - 执念`;
  else title = titles[payload.kind];
  return {
    title: payload.kind === "home" ? title : `${title} - ${SITE.title}`,
    description,
    image,
  };
}
