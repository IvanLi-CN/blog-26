"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getWebDemoRuntimeState,
  isWebDemoBuildEnabled,
  WEB_DEMO_STATE_EVENT,
  type WebDemoScene,
} from "../lib/web-demo-runtime";

export function ProjectFigure({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="project-content-figure">
      {/* biome-ignore lint/performance/noImgElement: MDX figures use author-provided static assets. */}
      <img src={src} alt={alt} loading="lazy" decoding="async" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

type ProjectArtifactDownload = {
  label: string;
  href: string;
};

type ProjectArtifactBase = {
  id: string;
  label: string;
  title: string;
  description: string;
  previewUrl: string;
  downloads: ProjectArtifactDownload[];
};

type ProjectArtifact =
  | (ProjectArtifactBase & { previewKind: "pdf" })
  | (ProjectArtifactBase & { modelUrl: string; previewKind: "model" });

function ProjectModelPreview({
  modelUrl,
  revision,
  onReady,
  onError,
}: {
  modelUrl: string;
  revision: number;
  onReady: () => void;
  onError: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    const viewerRevision = revision;
    const loadViewer = customElements.get("flux-purr-model-viewer")
      ? Promise.resolve()
      : new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.type = "module";
          script.src = `/projects/flux-purr/model-viewer.js?v=theme-7&r=${viewerRevision}`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("model viewer load failed"));
          document.head.append(script);
        });
    void loadViewer
      .then(() => {
        if (disposed || !hostRef.current) return;
        const element = document.createElement("flux-purr-model-viewer");
        element.setAttribute("model-url", modelUrl);
        element.addEventListener("model-ready", onReady);
        element.addEventListener("model-error", onError);
        hostRef.current.replaceChildren(element);
      })
      .catch(onError);
    return () => {
      disposed = true;
    };
  }, [modelUrl, onError, onReady, revision]);
  return <div ref={hostRef} className="project-model-viewer-host" />;
}

type PreviewStatus = "loading" | "ready" | "error";

function previewStatusForScene(scene: WebDemoScene | null): PreviewStatus | null {
  if (scene === "mains-aegis-preview-loading") return "loading";
  if (scene === "mains-aegis-preview-error") return "error";
  return null;
}

function ProjectArtifactStatus({
  status,
  title,
  onRetry,
}: {
  status: PreviewStatus;
  title: string;
  onRetry: () => void;
}) {
  const isError = status === "error";
  const isReady = status === "ready";
  return (
    <div
      className={`project-artifact-status project-artifact-status-${status}`}
      role="status"
      aria-live="polite"
      aria-hidden={isReady}
    >
      <span className="project-artifact-status-icon" aria-hidden="true">
        {isError ? "!" : ""}
      </span>
      <div>
        <strong>{isError ? "预览加载失败" : `正在加载 ${title}`}</strong>
        <p>{isError ? "请重试，或下载原始文件查看。" : "正在准备预览内容，请稍候。"}</p>
      </div>
      {isError ? (
        <button type="button" onClick={onRetry}>
          重新加载
        </button>
      ) : null}
    </div>
  );
}

export function ProjectArtifactTabs({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: ProjectArtifact[];
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(420);
  const [previewOutOfView, setPreviewOutOfView] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [demoScene, setDemoScene] = useState<WebDemoScene | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");
  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const modalIframeRef = useRef<HTMLIFrameElement>(null);
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const activePreviewId = active?.id;
  const forcedPreviewStatus = previewStatusForScene(demoScene);
  const previewUrl = (mode?: "scroll") => {
    if (!active) return "";
    if (mode !== "scroll" || !active.previewUrl.includes("pdf-viewer.html"))
      return active.previewUrl;
    return `${active.previewUrl}${active.previewUrl.includes("?") ? "&" : "?"}mode=scroll`;
  };
  useEffect(() => {
    if (!isWebDemoBuildEnabled()) return;
    const syncScene = () => setDemoScene(getWebDemoRuntimeState(window.location).sceneState.scene);
    syncScene();
    window.addEventListener(WEB_DEMO_STATE_EVENT, syncScene);
    return () => window.removeEventListener(WEB_DEMO_STATE_EVENT, syncScene);
  }, []);

  useEffect(() => {
    if (!activePreviewId) return;
    setPreviewHeight(420);
    setPreviewStatus(forcedPreviewStatus ?? "loading");
    setPreviewRevision((revision) => revision + 1);
  }, [activePreviewId, forcedPreviewStatus]);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) =>
      setPreviewOutOfView(entry.intersectionRatio === 0)
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (
      event: MessageEvent<{ type?: string; height?: number; deltaY?: number }>
    ) => {
      const source = event.source;
      if (
        source !== iframeRef.current?.contentWindow &&
        source !== modalIframeRef.current?.contentWindow
      )
        return;
      if (
        event.data?.type === "project-preview-wheel" &&
        source === iframeRef.current?.contentWindow
      ) {
        window.scrollBy({ top: event.data.deltaY ?? 0, behavior: "auto" });
        return;
      }
      if (event.data?.type === "project-preview-ready" && !forcedPreviewStatus) {
        setPreviewStatus("ready");
        return;
      }
      if (event.data?.type !== "project-preview-height") return;
      const nextHeight = Math.min(640, Math.max(360, Math.ceil(event.data.height ?? 420)));
      setPreviewHeight((current) =>
        nextHeight >= current || previewOutOfView ? nextHeight : current
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [forcedPreviewStatus, previewOutOfView]);

  useEffect(() => {
    document.body.classList.toggle("project-artifact-modal-open", isExpanded);
    return () => document.body.classList.remove("project-artifact-modal-open");
  }, [isExpanded]);

  useEffect(() => {
    if (demoScene === "mains-aegis-preview-expanded" && title === "PDF 图纸") {
      setIsExpanded(true);
    }
  }, [demoScene, title]);

  if (!active) return null;

  const panelId = `project-artifact-panel-${active.id}`;

  return (
    <section className="project-artifact-group">
      <header className="project-artifact-group-header">
        <h4>{title}</h4>
        <p>{description}</p>
      </header>
      <div className="project-artifact-tabs-list" role="tablist" aria-label={`${title}文件`}>
        {items.map((item) => (
          <button
            key={item.id}
            id={`project-artifact-tab-${item.id}`}
            className="project-artifact-tab"
            type="button"
            role="tab"
            aria-selected={item.id === active.id}
            aria-controls={panelId}
            onClick={() => setActiveId(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button
          className="project-artifact-expand"
          type="button"
          aria-label={`放大预览 ${active.title}`}
          title="放大预览"
          onClick={() => setIsExpanded(true)}
        >
          ↗
        </button>
      </div>
      <div
        id={panelId}
        className="project-artifact-panel"
        role="tabpanel"
        aria-labelledby={`project-artifact-tab-${active.id}`}
      >
        <div
          ref={previewRef}
          className={`project-artifact-preview project-artifact-preview-${active.previewKind}`}
          style={{ height: `${previewHeight}px` }}
        >
          {active.previewKind === "model" ? (
            <ProjectModelPreview
              modelUrl={active.modelUrl}
              revision={previewRevision}
              onReady={() => {
                if (!forcedPreviewStatus) setPreviewStatus("ready");
              }}
              onError={() => setPreviewStatus("error")}
            />
          ) : (
            <iframe
              key={`${active.id}-${previewRevision}`}
              ref={iframeRef}
              title={`${active.title} 预览`}
              src={previewUrl()}
              loading="lazy"
              onLoad={() => {
                if (!forcedPreviewStatus) setPreviewStatus("ready");
              }}
              onError={() => setPreviewStatus("error")}
            />
          )}
          <ProjectArtifactStatus
            status={previewStatus}
            title={active.label}
            onRetry={() => {
              setPreviewStatus("loading");
              setPreviewRevision((revision) => revision + 1);
            }}
          />
        </div>
        <div className="project-artifact-meta">
          <div>
            <strong>{active.title}</strong>
            <span className="project-artifact-description" data-tooltip={active.description}>
              <p>{active.description}</p>
            </span>
          </div>
          <div className="project-artifact-downloads">
            {active.downloads.map((download) => (
              <a key={download.href} href={download.href} target="_blank" rel="noreferrer" download>
                {download.label}
              </a>
            ))}
          </div>
        </div>
      </div>
      {isExpanded
        ? createPortal(
            <div
              className="project-artifact-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`${title}放大预览`}
            >
              <aside className="project-artifact-modal-sidebar">
                <div className="project-artifact-modal-heading">
                  <strong>{title}</strong>
                  <button type="button" onClick={() => setIsExpanded(false)} aria-label="关闭预览">
                    ×
                  </button>
                </div>
                <div
                  className="project-artifact-modal-files"
                  role="tablist"
                  aria-label={`${title}文件列表`}
                >
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={item.id === active.id}
                      onClick={() => setActiveId(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </aside>
              <div className="project-artifact-modal-viewer">
                {active.previewKind === "model" ? (
                  <ProjectModelPreview
                    modelUrl={active.modelUrl}
                    revision={previewRevision}
                    onReady={() => {
                      if (!forcedPreviewStatus) setPreviewStatus("ready");
                    }}
                    onError={() => setPreviewStatus("error")}
                  />
                ) : (
                  <iframe
                    key={`expanded-${active.id}-${previewRevision}`}
                    ref={modalIframeRef}
                    title={`${active.title} 放大预览`}
                    src={previewUrl("scroll")}
                    onLoad={() => {
                      if (!forcedPreviewStatus) setPreviewStatus("ready");
                    }}
                    onError={() => setPreviewStatus("error")}
                  />
                )}
                <ProjectArtifactStatus
                  status={previewStatus}
                  title={active.label}
                  onRetry={() => {
                    setPreviewStatus("loading");
                    setPreviewRevision((revision) => revision + 1);
                  }}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}

export function ProjectCallout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="project-content-callout">
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </aside>
  );
}

export function ProjectFacts({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="project-content-facts">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProjectComparison({ before, after }: { before: ReactNode; after: ReactNode }) {
  return (
    <div className="project-content-comparison">
      <div>
        <span>之前</span>
        {before}
      </div>
      <div>
        <span>之后</span>
        {after}
      </div>
    </div>
  );
}

function DiagramBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="project-diagram-box">
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

export function ProjectArchitectureDiagram() {
  return (
    <figure className="project-content-figure project-diagram">
      <div className="project-diagram-row">
        <DiagramBox title="设备固件">
          ESP32-S3
          <br />
          采样 · 热控 · 输出 · EEPROM
        </DiagramBox>
        <span className="project-diagram-arrow" aria-hidden="true">
          →
        </span>
        <DiagramBox title="传输层">
          USB Serial · Web Serial
          <br />
          native IPC · LAN HTTP
        </DiagramBox>
        <span className="project-diagram-arrow" aria-hidden="true">
          →
        </span>
        <DiagramBox title="操作入口">
          React Web Console
          <br />
          flux-purr CLI · Public Demo
        </DiagramBox>
      </div>
      <figcaption>固件提供设备能力；传输层提供连接路径；Web 控制台和 CLI 位于操作层。</figcaption>
    </figure>
  );
}

export function ProjectFunctionDiagram() {
  return (
    <figure className="project-content-figure project-diagram">
      <div className="project-diagram-flow">
        <DiagramBox title="1. 发现设备">USB / Web Serial / LAN</DiagramBox>
        <span className="project-diagram-down-arrow" aria-hidden="true">
          ↓
        </span>
        <DiagramBox title="2. 确认条件">身份 · 能力 · lease · 安全条件</DiagramBox>
        <span className="project-diagram-down-arrow" aria-hidden="true">
          ↓
        </span>
        <div className="project-diagram-branches">
          <DiagramBox title="查看状态">温度 · PD · 输出 · 风扇</DiagramBox>
          <DiagramBox title="执行动作">日常控制 · 校准 · 固件维护</DiagramBox>
          <DiagramBox title="诊断">monitor · 日志 · 错误原因</DiagramBox>
        </div>
      </div>
      <figcaption>
        设备从发现和连接开始，经过状态查看、配置、校准和维护；每一步都先检查设备能力与安全条件。
      </figcaption>
    </figure>
  );
}

const repositoryLayers = [
  {
    title: "设备运行层",
    tone: "runtime",
    items: [["firmware/", "ESP32-S3 固件：采样、热控、PD、风扇和 EEPROM"]],
  },
  {
    title: "设备访问层",
    tone: "transport",
    items: [["tools/flux-purr-devd/", "CLI、守护进程、USB/串口和 native IPC"]],
  },
  {
    title: "控制台层",
    tone: "console",
    items: [["web/", "React 控制台、设备状态、校准、固件维护和 Demo"]],
  },
  {
    title: "契约与验证层",
    tone: "evidence",
    items: [
      ["docs/specs/", "功能规格、协议和验收条件"],
      ["docs/hardware/", "引脚、电源、加热、风扇和外壳资料"],
      ["fixtures/ · thermal-self-test-runs/", "模拟数据与热控自测记录"],
    ],
  },
] as const;

const repositoryTasks = [
  ["温度采样或加热逻辑", "firmware/", "docs/specs/、docs/hardware/"],
  ["USB、串口或局域网连接", "tools/flux-purr-devd/", "协议规格、CLI 行为"],
  ["Web 控制台页面", "web/", "mock/live 状态和设备能力模型"],
  ["校准流程", "firmware/、web/", "校准规格、运行记录"],
  ["硬件改版", "docs/hardware/", "firmware/ 的引脚和电源配置"],
  ["回归验证", "fixtures/、thermal-self-test-runs/", "对应功能规格"],
] as const;

export function ProjectRepositoryMap() {
  return (
    <div className="project-repository-map">
      <div className="project-repository-layers">
        {repositoryLayers.map((layer) => (
          <div
            className={`project-repository-layer project-repository-layer-${layer.tone}`}
            key={layer.title}
          >
            <strong>{layer.title}</strong>
            <div className="project-repository-layer-items">
              {layer.items.map(([path, description]) => (
                <div key={path}>
                  <code>{path}</code>
                  <span>{description}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="project-repository-tasks">
        <strong>按任务查找</strong>
        <table className="project-repository-table">
          <caption className="sr-only">按任务查找仓库目录</caption>
          <thead>
            <tr className="project-repository-row project-repository-row-head">
              <th scope="col">要修改的内容</th>
              <th scope="col">先看</th>
              <th scope="col">再看</th>
            </tr>
          </thead>
          <tbody>
            {repositoryTasks.map(([task, first, next]) => (
              <tr className="project-repository-row" key={task}>
                <td>{task}</td>
                <td>
                  <code>{first}</code>
                </td>
                <td>{next}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="project-repository-note">
        <code>docs/specs/</code> 定义系统应该如何工作，<code>firmware/</code>、<code>web/</code> 和{" "}
        <code>tools/</code> 分别实现设备、控制台和访问层；验证目录用于检查实现是否符合规格。
      </p>
    </div>
  );
}
