import * as SelectPrimitive from "@radix-ui/react-select";
import {
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  Database,
  Gauge,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  dispatchWebDemoAction,
  getDefaultWebDemoState,
  getWebDemoSceneOptions,
  getWebDemoShareUrl,
  getWebDemoState,
  normalizeWebDemoState,
  readWebDemoMutations,
  recordWebDemoMutation,
  setWebDemoState,
  WEB_DEMO_ACTION_EVENT,
  WEB_DEMO_STATE_EVENT,
  type WebDemoActionDetail,
  type WebDemoApp,
  type WebDemoDataMode,
  type WebDemoMutation,
  type WebDemoNetwork,
  type WebDemoPersona,
  type WebDemoState,
} from "../lib/web-demo-runtime";
import "./WebDemoInspector.css";

const OPEN_STORAGE_KEY = "web-demo-inspector-open";

const networkOptions: Array<{ value: WebDemoNetwork; label: string; icon: typeof Wifi }> = [
  { value: "healthy", label: "正常", icon: Wifi },
  { value: "slow", label: "慢速", icon: Gauge },
  { value: "offline", label: "故障", icon: WifiOff },
];

const dataOptions: Array<{ value: WebDemoDataMode; label: string }> = [
  { value: "fixture", label: "标准" },
  { value: "dense", label: "密集" },
  { value: "empty", label: "空数据" },
];

function readInitialOpen() {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(OPEN_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return !window.matchMedia("(max-width: 720px)").matches;
}

function formatMutationTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function getCurrentState(app: WebDemoApp, pathname?: string) {
  if (typeof window === "undefined") {
    return getDefaultWebDemoState(pathname ?? (app === "admin" ? "/admin/dashboard" : "/"));
  }
  return getWebDemoState(window.location, app);
}

export default function WebDemoInspector({
  app,
  initialPathname = "",
}: {
  app: WebDemoApp;
  initialPathname?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pathname, setPathname] = useState(
    () => initialPathname || (typeof window === "undefined" ? "/" : window.location.pathname)
  );
  const [state, setState] = useState<WebDemoState>(() => getCurrentState(app, initialPathname));
  const [mutations, setMutations] = useState<WebDemoMutation[]>(readWebDemoMutations);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");

  const sceneOptions = useMemo(() => getWebDemoSceneOptions(pathname, app), [app, pathname]);
  const activeScene = sceneOptions.some((option) => option.value === state.scene)
    ? state.scene
    : sceneOptions[0]?.value;
  const activeSceneDescription =
    sceneOptions.find((option) => option.value === activeScene)?.description ??
    "当前页面使用固定的 Demo 模拟输入。";
  const activeSceneLabel =
    sceneOptions.find((option) => option.value === activeScene)?.label ?? "选择 Demo 场景";
  const shareUrl = typeof window === "undefined" ? "" : getWebDemoShareUrl(state);

  useEffect(() => {
    setIsOpen(readInitialOpen());
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      setPathname(window.location.pathname);
      setState(getCurrentState(app));
    };
    const handleState = (event: Event) => {
      const next = (event as CustomEvent<{ state: WebDemoState }>).detail?.state;
      if (next) setState(next);
      syncFromLocation();
    };
    const handleAction = (event: Event) => {
      const detail = (event as CustomEvent<WebDemoActionDetail>).detail;
      if (!detail) return;
      if (detail.action === "clear-mutations" || detail.action === "reset-state") {
        window.__webDemoMutationLog = [];
      }
      setMutations(readWebDemoMutations());
    };

    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener(WEB_DEMO_STATE_EVENT, handleState);
    window.addEventListener(WEB_DEMO_ACTION_EVENT, handleAction);
    document.addEventListener("astro:page-load", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener(WEB_DEMO_STATE_EVENT, handleState);
      window.removeEventListener(WEB_DEMO_ACTION_EVENT, handleAction);
      document.removeEventListener("astro:page-load", syncFromLocation);
    };
  }, [app]);

  useEffect(() => {
    document.documentElement.dataset.webDemoScene = state.scene;
    document.documentElement.dataset.webDemoPersona = state.persona;
    document.documentElement.dataset.webDemoNetwork = state.network;
    document.documentElement.dataset.webDemoData = state.data;
  }, [state]);

  useEffect(() => {
    document.body.dataset.webDemoInspectorApp = app;
    document.body.dataset.webDemoInspectorOpen = String(isOpen);
    return () => {
      delete document.body.dataset.webDemoInspectorApp;
      delete document.body.dataset.webDemoInspectorOpen;
    };
  }, [app, isOpen]);

  const updateState = (partial: Partial<WebDemoState>) => {
    const next = normalizeWebDemoState({ ...state, ...partial }, pathname, app);
    setState(next);
    setWebDemoState(next);
  };

  const resetState = () => {
    const next = getDefaultWebDemoState(pathname);
    setState(next);
    setWebDemoState(next);
    dispatchWebDemoAction("reset-state", "重置场景");
  };

  const runAction = (
    action: "refresh-data" | "simulate-save" | "clear-mutations",
    label: string
  ) => {
    if (action === "clear-mutations") window.__webDemoMutationLog = [];
    if (action === "simulate-save") {
      recordWebDemoMutation("模拟保存", "写入内存 mock，未触达真实后端");
    }
    if (action === "refresh-data") {
      recordWebDemoMutation("刷新数据", "重新读取当前场景的确定性 fixture");
    }
    setMutations(readWebDemoMutations());
    dispatchWebDemoAction(action, label);
  };

  const copyShareUrl = async () => {
    const shareUrl = getWebDemoShareUrl(state);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
    window.setTimeout(() => setCopyState("idle"), 2400);
  };

  return (
    <div className="web-demo-inspector-host" data-web-demo-inspector-root={app}>
      {isOpen ? (
        <section
          className="web-demo-inspector"
          data-web-demo-inspector
          data-web-demo-inspector-open="true"
          aria-label="Web Demo 调试控制面板"
        >
          <header className="web-demo-inspector-header">
            <div className="web-demo-inspector-heading">
              <span className="web-demo-inspector-kicker">
                <Bug aria-hidden="true" size={14} />
                WEB DEMO
              </span>
              <h2>Inspector</h2>
              <p>构建时隔离 · 仅内存模拟</p>
            </div>
            <button
              type="button"
              className="web-demo-inspector-icon-button"
              aria-label="收起 Web Demo 控制面板"
              title="收起控制面板"
              onClick={() => {
                setIsOpen(false);
                window.localStorage.setItem(OPEN_STORAGE_KEY, "false");
              }}
            >
              <PanelRightClose aria-hidden="true" size={18} />
            </button>
          </header>

          <div className="web-demo-inspector-status-row">
            <span className="web-demo-inspector-status">
              <ShieldCheck aria-hidden="true" size={13} />
              SIMULATED
            </span>
            <code title={pathname}>{pathname}</code>
          </div>

          <div className="web-demo-inspector-scroll">
            <fieldset className="web-demo-inspector-group">
              <legend>
                <SlidersHorizontal aria-hidden="true" size={15} />
                Scene
              </legend>
              <label className="web-demo-inspector-field" htmlFor="web-demo-inspector-scene">
                <span>场景</span>
                <SelectPrimitive.Root
                  value={activeScene}
                  onValueChange={(value) => updateState({ scene: value as WebDemoState["scene"] })}
                >
                  <SelectPrimitive.Trigger
                    id="web-demo-inspector-scene"
                    className="web-demo-inspector-select-trigger"
                    aria-label="选择 Demo 场景"
                    data-testid="web-demo-inspector-scene-select"
                  >
                    <SelectPrimitive.Value>{activeSceneLabel}</SelectPrimitive.Value>
                    <SelectPrimitive.Icon asChild>
                      <ChevronDown aria-hidden="true" size={15} />
                    </SelectPrimitive.Icon>
                  </SelectPrimitive.Trigger>
                  <SelectPrimitive.Portal>
                    <SelectPrimitive.Content
                      className="web-demo-inspector-select-content"
                      position="popper"
                      sideOffset={6}
                      align="start"
                    >
                      <SelectPrimitive.Viewport>
                        {sceneOptions.map((option) => (
                          <SelectPrimitive.Item
                            key={option.value}
                            value={option.value}
                            className="web-demo-inspector-select-item"
                          >
                            <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                            <SelectPrimitive.ItemIndicator className="web-demo-inspector-select-item-indicator">
                              <Check aria-hidden="true" size={14} />
                            </SelectPrimitive.ItemIndicator>
                          </SelectPrimitive.Item>
                        ))}
                      </SelectPrimitive.Viewport>
                    </SelectPrimitive.Content>
                  </SelectPrimitive.Portal>
                </SelectPrimitive.Root>
                <small>{activeSceneDescription}</small>
              </label>
            </fieldset>

            <fieldset className="web-demo-inspector-group">
              <legend>
                <ShieldCheck aria-hidden="true" size={15} />
                Persona / 权限
              </legend>
              <div className="web-demo-inspector-segmented">
                {(
                  [
                    ["guest", "Guest"],
                    ["admin", "Admin"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={state.persona === value}
                    className={state.persona === value ? "is-selected" : ""}
                    onClick={() => updateState({ persona: value as WebDemoPersona })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <small>身份只影响 Demo mock 响应，不提供真实权限。</small>
            </fieldset>

            <fieldset className="web-demo-inspector-group">
              <legend>
                {state.network === "offline" ? (
                  <WifiOff aria-hidden="true" size={15} />
                ) : (
                  <Wifi aria-hidden="true" size={15} />
                )}
                Network
              </legend>
              <div className="web-demo-inspector-segmented web-demo-inspector-segmented-three">
                {networkOptions.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={state.network === value}
                    className={state.network === value ? "is-selected" : ""}
                    onClick={() => updateState({ network: value })}
                  >
                    <Icon aria-hidden="true" size={13} />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="web-demo-inspector-group">
              <legend>
                <Database aria-hidden="true" size={15} />
                Data
              </legend>
              <div className="web-demo-inspector-segmented web-demo-inspector-segmented-three">
                {dataOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={state.data === value}
                    className={state.data === value ? "is-selected" : ""}
                    onClick={() => updateState({ data: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="web-demo-inspector-group">
              <legend>
                <Zap aria-hidden="true" size={15} />
                Actions
              </legend>
              <div className="web-demo-inspector-actions">
                <button type="button" onClick={() => runAction("refresh-data", "刷新数据")}>
                  <RefreshCw aria-hidden="true" size={15} />
                  刷新数据
                </button>
                <button type="button" onClick={() => runAction("simulate-save", "模拟保存")}>
                  <Save aria-hidden="true" size={15} />
                  模拟保存
                </button>
                <button type="button" onClick={resetState}>
                  <RotateCcw aria-hidden="true" size={15} />
                  重置场景
                </button>
              </div>
              <small>所有写操作只记录到当前页面的内存 mock。</small>
            </fieldset>

            <fieldset className="web-demo-inspector-group">
              <legend>
                <Share2 aria-hidden="true" size={15} />
                Share state
              </legend>
              <div className="web-demo-inspector-share-row">
                <input
                  aria-label="当前 Demo 分享状态 URL"
                  readOnly
                  value={shareUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="web-demo-inspector-icon-button"
                  aria-label="复制 Demo 分享状态 URL"
                  title="复制分享状态"
                  onClick={copyShareUrl}
                >
                  {copyState === "copied" ? (
                    <Check aria-hidden="true" size={17} />
                  ) : (
                    <Copy aria-hidden="true" size={17} />
                  )}
                </button>
              </div>
              <small>
                {copyState === "manual"
                  ? "浏览器禁止自动复制，请聚焦输入框后手动复制。"
                  : "场景、身份、网络和数据状态写入 d_* 参数。"}
              </small>
            </fieldset>

            <div className="web-demo-inspector-mutations" aria-live="polite">
              <div className="web-demo-inspector-mutations-heading">
                <span>Recent mutations</span>
                <button
                  type="button"
                  aria-label="清空模拟操作记录"
                  title="清空操作记录"
                  onClick={() => runAction("clear-mutations", "清空记录")}
                >
                  <X aria-hidden="true" size={14} />
                </button>
              </div>
              {mutations.length === 0 ? (
                <p className="web-demo-inspector-empty">暂无模拟操作</p>
              ) : (
                <ul>
                  {mutations.map((mutation) => (
                    <li key={mutation.id}>
                      <span>
                        <CircleAlert aria-hidden="true" size={13} />
                        {mutation.label}
                      </span>
                      <small>{formatMutationTime(mutation.at)}</small>
                      <p>{mutation.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className="web-demo-inspector-bubble"
          data-testid="web-demo-inspector-trigger"
          aria-label="打开 Web Demo 调试控制面板"
          title="打开 Web Demo Inspector"
          onClick={() => {
            setIsOpen(true);
            window.localStorage.setItem(OPEN_STORAGE_KEY, "true");
          }}
        >
          <PanelRightOpen aria-hidden="true" size={20} />
          <span>Demo</span>
          <ChevronUp aria-hidden="true" size={14} />
        </button>
      )}
    </div>
  );
}
