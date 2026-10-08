import { MemoTypeBadge } from "@/components/memos/MemoTypeBadge";
import Icon from "@/components/ui/Icon";
import { getMemoPresentation } from "@/lib/memo-presentation";
import type { PublicMemoRecord } from "@/public-site/snapshot";
import { formatAbsoluteDate, formatDateTime } from "../lib/format";
import { classList } from "../lib/react-template";
import TagBadge from "./TagBadge";

interface Props {
  memo: PublicMemoRecord;
  metadataTitle: string;
  displayDate: string;
  tagIconMap?: Record<string, string | null>;
  tagIconSvgMap?: Record<string, string | null>;
}

export default function MemoDetailHeading({
  memo,
  metadataTitle,
  displayDate,
  tagIconMap,
  tagIconSvgMap,
}: Props) {
  const presentation = getMemoPresentation(memo);
  return (
    <header data-testid="public-memo-detail-heading">
      <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
        <span className="nature-chip nature-chip-info gap-1">
          <Icon name="tabler:clock" className="h-3.5 w-3.5" />
          <time dateTime={displayDate} title={formatDateTime(displayDate)}>
            {formatAbsoluteDate(displayDate)}
          </time>
        </span>
        <MemoTypeBadge record={memo} />
      </div>
      <h1
        className={classList([
          "nature-title mt-5 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl",
          !memo.title && "sr-only",
        ])}
      >
        {metadataTitle}
      </h1>
      {presentation.tags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {presentation.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} iconMap={tagIconMap} iconSvgMap={tagIconSvgMap} />
          ))}
        </div>
      )}
    </header>
  );
}
