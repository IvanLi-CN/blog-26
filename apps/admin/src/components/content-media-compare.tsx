import { useEffect, useRef, useState } from "react";
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
  const sourceUrl = url;
  const previewable =
    mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/");
  const [failed, setFailed] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!previewable) return undefined;
    let cancelled = false;
    let url: string | null = null;
    setFailed(false);
    setObjectUrl(null);
    void fetch(sourceUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [previewable, sourceUrl]);

  const source = objectUrl ?? url;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !objectUrl || !mime.startsWith("image/")) return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBox({ width: rect.width, height: rect.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [mime, objectUrl]);

  useEffect(() => {
    if (!objectUrl) return undefined;
    const probe = new Image();
    probe.onload = () => setNatural({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.src = objectUrl;
    return () => {
      probe.onload = null;
    };
  }, [objectUrl]);

  const fitted = (() => {
    if (!natural || !box.width || !box.height) return null;
    const scale = Math.min(box.width / natural.width, box.height / natural.height, 2);
    return { width: natural.width * scale, height: natural.height * scale };
  })();
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {mime.startsWith("image/") && failed ? (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/32 px-3 text-center text-xs text-muted-foreground">
          {fileName} · 预览不可用
        </div>
      ) : mime.startsWith("image/") && !objectUrl ? (
        <div
          className="aspect-[4/3] w-full animate-pulse rounded-xl bg-muted/46"
          role="status"
          aria-label="加载预览"
        />
      ) : mime.startsWith("image/") ? (
        <div
          ref={frameRef}
          className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-muted/32"
        >
          {/* biome-ignore lint/performance/noImgElement: user attachments are served directly */}
          <img
            src={source}
            alt={`${label} ${fileName}`}
            onError={() => setFailed(true)}
            style={fitted ?? { maxWidth: "100%", maxHeight: "100%" }}
            className="object-contain"
          />
        </div>
      ) : mime.startsWith("video/") ? (
        // biome-ignore lint/a11y/useMediaCaption: attachments carry no caption tracks
        <video src={source} controls className="max-h-40 w-full rounded-xl bg-muted/46" />
      ) : mime.startsWith("audio/") ? (
        // biome-ignore lint/a11y/useMediaCaption: attachments carry no caption tracks
        <audio src={source} controls className="w-full" />
      ) : null}
      <a
        href={source}
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
