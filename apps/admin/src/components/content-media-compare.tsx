import { Button } from "~/components/ui";

export interface ContentRepoMediaRow {
  path: string;
  mime: string;
  localSha: string | null;
  remoteSha: string | null;
  changed: boolean;
  missing: boolean;
}

function localUrl(path: string) {
  return `/api/files/local/${path.replace(/^\/+/u, "")}`;
}

function remoteUrl(row: ContentRepoMediaRow) {
  return `/api/admin/content-repo/media/remote?sha=${encodeURIComponent(row.remoteSha ?? "")}&path=${encodeURIComponent(row.path)}`;
}

function MediaPreview({
  label,
  url,
  mime,
  fileName,
}: {
  label: string;
  url: string;
  mime: string;
  fileName: string;
}) {
  const previewable =
    mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/");
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {mime.startsWith("image/") ? (
        // biome-ignore lint/performance/noImgElement: user attachments are served directly
        <img
          src={url}
          alt={`${label} ${fileName}`}
          className="max-h-40 rounded-xl bg-muted/46 object-contain"
        />
      ) : mime.startsWith("video/") ? (
        // biome-ignore lint/a11y/useMediaCaption: attachments carry no caption tracks
        <video src={url} controls className="max-h-40 w-full rounded-xl bg-muted/46" />
      ) : mime.startsWith("audio/") ? (
        // biome-ignore lint/a11y/useMediaCaption: attachments carry no caption tracks
        <audio src={url} controls className="w-full" />
      ) : null}
      <a
        href={url}
        download={previewable ? undefined : fileName}
        target="_blank"
        rel="noreferrer"
        className="block truncate text-xs text-primary underline"
      >
        {previewable ? "在新窗口查看" : "下载"}
      </a>
    </div>
  );
}

export function ContentMediaCompare({
  items,
  onAdopt,
  busy,
}: {
  items: ContentRepoMediaRow[];
  onAdopt?: (mediaPath: string) => void;
  busy?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-3" data-testid="content-media-compare">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">附件</p>
      {items.map((row) => {
        const fileName = row.path.split("/").pop() ?? row.path;
        return (
          <div key={row.path} className="space-y-2 rounded-2xl bg-muted/32 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-xs">{row.path}</span>
              {row.changed ? <span className="text-xs text-warning">两侧不同</span> : null}
              {row.missing ? <span className="text-xs text-destructive">本地缺失</span> : null}
              {row.remoteSha && row.changed ? (
                <Button size="sm" disabled={busy} onClick={() => onAdopt?.(row.path)}>
                  采用远端
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {row.remoteSha ? (
                <MediaPreview
                  label="远端"
                  url={remoteUrl(row)}
                  mime={row.mime}
                  fileName={fileName}
                />
              ) : (
                <p className="text-xs text-muted-foreground">远端没有该附件</p>
              )}
              {row.localSha ? (
                <MediaPreview
                  label="本地"
                  url={localUrl(row.path)}
                  mime={row.mime}
                  fileName={fileName}
                />
              ) : (
                <p className="text-xs text-destructive">本地文件缺失</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
