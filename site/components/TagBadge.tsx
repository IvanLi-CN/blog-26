import { NativeTagLink } from "@/components/common/NativeTagLink";
import { normalizeTagPath } from "@/lib/tag-directory";
import { buildTagHref } from "@/lib/tag-href";
import { pickTagIconSvg } from "../lib/public-site-client";
import { toPublicSitePath } from "../lib/runtime-urls";

interface Props {
  tag: string;
  iconMap?: Record<string, string | null>;
  iconSvgMap?: Record<string, string | null>;
  className?: string;
}
export default function TagBadge(props: Props) {
  const { tag, iconMap = {}, iconSvgMap = {}, className = "" } = props;
  const label = normalizeTagPath(String(tag)).split("/").at(-1) ?? String(tag);
  const { iconId, iconSvg } = pickTagIconSvg(String(tag), iconMap, iconSvgMap);
  return (
    <NativeTagLink
      href={toPublicSitePath(buildTagHref(String(tag))) ?? "/tags"}
      label={label}
      iconId={iconId}
      iconSvg={iconSvg}
      className={className}
    />
  );
}
