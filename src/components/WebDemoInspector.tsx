import * as SelectPrimitive from "@radix-ui/react-select";
import {
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleUserRound,
  Copy,
  Database,
  Gauge,
  MonitorCog,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UserRound,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { UI_THEME_PREFERENCE_EVENT } from "../lib/theme";
import {
  dispatchWebDemoAction,
  getDefaultWebDemoEnvironment,
  getDefaultWebDemoSceneState,
  getWebDemoRuntimeState,
  getWebDemoSceneOptions,
  getWebDemoShareUrl,
  getWebDemoStateChangeKeys,
  initializeWebDemoEnvironment,
  normalizeWebDemoEnvironment,
  normalizeWebDemoSceneState,
  readWebDemoMutations,
  recordWebDemoMutation,
  setWebDemoRuntimeState,
  WEB_DEMO_ACTION_EVENT,
  WEB_DEMO_ROUTE_EVENT,
  WEB_DEMO_STATE_EVENT,
  type WebDemoActionDetail,
  type WebDemoApp,
  type WebDemoConnection,
  type WebDemoDataMode,
  type WebDemoDelayMode,
  type WebDemoEnvironment,
  type WebDemoMotionPreference,
  type WebDemoMutation,
  type WebDemoPersona,
  type WebDemoRuntimeState,
  type WebDemoSceneState,
  type WebDemoStateChangeDetail,
  type WebDemoThemeSelection,
} from "../lib/web-demo-runtime";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Switch } from "./ui/switch";
import "./WebDemoInspector.css";

const OPEN_STORAGE_KEY = "web-demo-inspector-open";
const ADVANCED_STORAGE_KEY = "web-demo-inspector-advanced";
const DEFAULT_INSPECTOR_OPEN = false;

const personaOptions: Array<{ value: WebDemoPersona; label: string; icon: typeof UserRound }> = [
  { value: "guest", label: "未登录", icon: UserRound },
  { value: "user", label: "普通用户", icon: CircleUserRound },
  { value: "admin", label: "管理员", icon: ShieldCheck },
];

const connectionOptions: Array<{ value: WebDemoConnection; label: string; icon: typeof Wifi }> = [
  { value: "online", label: "在线", icon: Wifi },
  { value: "offline", label: "离线", icon: WifiOff },
];

const delayOptions: Array<{ value: WebDemoDelayMode; label: string }> = [
  { value: "normal", label: "正常" },
  { value: "slow", label: "慢速" },
];

const themeOptions: Array<{ value: WebDemoThemeSelection; label: string; icon: typeof Sun }> = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "跟随系统", icon: MonitorCog },
];

const motionOptions: Array<{ value: WebDemoMotionPreference; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "reduce", label: "减少动效" },
];

const dataOptions: Array<{ value: WebDemoDataMode; label: string }> = [
  { value: "fixture", label: "标准" },
  { value: "dense", label: "密集" },
  { value: "empty", label: "空数据" },
];

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const stored = window.sessionStorage.getItem(key);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return fallback;
}

function readInitialOpen() {
  if (typeof window === "undefined") return DEFAULT_INSPECTOR_OPEN;
  const stored = window.localStorage.getItem(OPEN_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return DEFAULT_INSPECTOR_OPEN;
}

function formatMutationTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function formatDelaySummary(environment: WebDemoEnvironment) {
  if (environment.delay === "custom") return `自定义 ${environment.delayMs} ms`;
  return environment.delay === "slow" ? "慢速 · +1500 ms" : "正常 · +0 ms";
}

function getRuntimeFromEvent(event: Event): WebDemoRuntimeState | null {
  const detail = (event as CustomEvent<WebDemoStateChangeDetail>).detail;
  if (!detail?.sceneState || !detail.environment) return null;
  return { sceneState: detail.sceneState, environment: detail.environment };
}

export default function WebDemoInspector({
  app,
  initialPathname = "",
}: {
  app: WebDemoApp;
  initialPathname?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [pathname, setPathname] = useState(
    () => initialPathname || (typeof window === "undefined" ? "/" : window.location.pathname)
  );
  const [runtimeState, setRuntimeState] = useState<WebDemoRuntimeState>(() =>
    typeof window === "undefined"
      ? {
          sceneState: getDefaultWebDemoSceneState(initialPathname),
          environment: getDefaultWebDemoEnvironment(initialPathname, app),
        }
      : getWebDemoRuntimeState(window.location, app)
  );
  const [mutations, setMutations] = useState<WebDemoMutation[]>(readWebDemoMutations);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [customDelayDraft, setCustomDelayDraft] = useState(() =>
    String(runtimeState.environment.delayMs)
  );
  const [customDelayError, setCustomDelayError] = useState<string | null>(null);
  const customDelayInputRef = useRef<HTMLInputElement>(null);
  const runtimeRef = useRef(runtimeState);

  const { sceneState, environment } = runtimeState;
  const sceneOptions = useMemo(() => getWebDemoSceneOptions(pathname, app), [app, pathname]);
  const activeScene = sceneOptions.some((option) => option.value === sceneState.scene)
    ? sceneState.scene
    : sceneOptions[0]?.value;
  const activeSceneDescription =
    sceneOptions.find((option) => option.value === activeScene)?.description ??
    "当前页面使用固定的 Demo 模拟输入。";
  const activeSceneLabel =
    sceneOptions.find((option) => option.value === activeScene)?.label ?? "选择 Demo 场景";
  const shareUrl = typeof window === "undefined" ? "" : getWebDemoShareUrl(runtimeState);
  const advancedItems = [
    environment.delay === "custom" ? formatDelaySummary(environment) : null,
    environment.motion === "reduce" ? "减少动效" : null,
  ].filter(Boolean) as string[];
  const advancedSummary =
    advancedItems.length > 0 ? advancedItems.join(" · ") : isAdvancedOpen ? "收起设置" : "展开设置";

  useEffect(() => {
    setIsOpen(readInitialOpen());
    setIsAdvancedOpen(readStoredBoolean(ADVANCED_STORAGE_KEY, false));
    const initial = initializeWebDemoEnvironment(app);
    setRuntimeState(initial);
    runtimeRef.current = initial;
  }, [app]);

  useEffect(() => {
    const handleThemePreference = (event: Event) => {
      const theme = (event as CustomEvent<{ theme?: string }>).detail?.theme;
      if (theme !== "light" && theme !== "dark" && theme !== "system") return;
      if (runtimeRef.current.environment.theme === theme) return;

      const next = {
        ...runtimeRef.current,
        environment: { ...runtimeRef.current.environment, theme },
      } satisfies WebDemoRuntimeState;
      runtimeRef.current = next;
      setRuntimeState(next);
      setWebDemoRuntimeState(next, { syncTheme: false });
    };

    window.addEventListener(UI_THEME_PREFERENCE_EVENT, handleThemePreference);
    return () => window.removeEventListener(UI_THEME_PREFERENCE_EVENT, handleThemePreference);
  }, []);

  useEffect(() => {
    const syncFromLocation = (notify = false) => {
      const next = getWebDemoRuntimeState(window.location, app);
      const previous = runtimeRef.current;
      setPathname(window.location.pathname);
      runtimeRef.current = next;
      setRuntimeState(next);
      if (notify && previous) {
        window.dispatchEvent(
          new CustomEvent<WebDemoStateChangeDetail>(WEB_DEMO_STATE_EVENT, {
            detail: {
              state: {
                ...next.sceneState,
                persona: next.environment.persona,
                network:
                  next.environment.connection === "offline"
                    ? "offline"
                    : next.environment.delay === "slow"
                      ? "slow"
                      : "healthy",
              },
              sceneState: next.sceneState,
              environment: next.environment,
              changed: getWebDemoStateChangeKeys(previous, next),
            },
          })
        );
      }
    };
    const handleState = (event: Event) => {
      const next = getRuntimeFromEvent(event);
      if (!next) return syncFromLocation();
      runtimeRef.current = next;
      setRuntimeState(next);
      setPathname(window.location.pathname);
    };
    const handleAction = (event: Event) => {
      const detail = (event as CustomEvent<WebDemoActionDetail>).detail;
      if (!detail) return;
      if (detail.action === "clear-mutations" || detail.action === "reset-state") {
        window.__webDemoMutationLog = [];
      }
      setMutations(readWebDemoMutations());
    };
    const handlePageLoad = () => syncFromLocation();
    const handleRouteChange = () => syncFromLocation();

    const handlePopState = () => syncFromLocation(true);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener(WEB_DEMO_STATE_EVENT, handleState);
    window.addEventListener(WEB_DEMO_ROUTE_EVENT, handleRouteChange);
    window.addEventListener(WEB_DEMO_ACTION_EVENT, handleAction);
    document.addEventListener("astro:page-load", handlePageLoad);
    return () => {
      window.removeEventListener(WEB_DEMO_STATE_EVENT, handleState);
      window.removeEventListener(WEB_DEMO_ROUTE_EVENT, handleRouteChange);
      window.removeEventListener(WEB_DEMO_ACTION_EVENT, handleAction);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("astro:page-load", handlePageLoad);
    };
  }, [app]);

  useEffect(() => {
    document.documentElement.dataset.webDemoScene = sceneState.scene;
    document.documentElement.dataset.webDemoData = sceneState.data;
    document.documentElement.dataset.webDemoPersona = environment.persona;
    document.documentElement.dataset.webDemoConnection = environment.connection;
    document.documentElement.dataset.webDemoDelay = environment.delay;
    document.documentElement.dataset.webDemoMotion = environment.motion;
  }, [environment, sceneState]);

  useEffect(() => {
    document.body.dataset.webDemoInspectorApp = app;
    document.body.dataset.webDemoInspectorOpen = String(isOpen);
    return () => {
      delete document.body.dataset.webDemoInspectorApp;
      delete document.body.dataset.webDemoInspectorOpen;
    };
  }, [app, isOpen]);

  useEffect(() => {
    if (environment.delay !== "custom") setCustomDelayDraft(String(environment.delayMs));
  }, [environment.delay, environment.delayMs]);

  const setRuntime = (next: WebDemoRuntimeState) => {
    runtimeRef.current = next;
    setRuntimeState(next);
    setWebDemoRuntimeState(next);
  };

  const updateEnvironment = (partial: Partial<WebDemoEnvironment>) => {
    const nextEnvironment = normalizeWebDemoEnvironment(
      { ...environment, ...partial },
      pathname,
      app
    );
    setRuntime({ sceneState, environment: nextEnvironment });
  };

  const updateScene = (partial: Partial<WebDemoSceneState>) => {
    const nextSceneState = normalizeWebDemoSceneState({ ...sceneState, ...partial }, pathname, app);
    setRuntime({ sceneState: nextSceneState, environment });
  };

  const commitCustomDelay = () => {
    const value = Number(customDelayDraft);
    if (
      !/^\d+$/.test(customDelayDraft) ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 30_000
    ) {
      setCustomDelayError("请输入 0–30000 之间的整数毫秒数。");
      return;
    }
    setCustomDelayError(null);
    updateEnvironment({ delay: "custom", delayMs: value });
  };

  const toggleCustomDelay = (checked: boolean) => {
    setCustomDelayError(null);
    if (checked) {
      const value = Number(customDelayDraft);
      const nextDelayMs =
        /^\d+$/.test(customDelayDraft) &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= 30_000
          ? value
          : environment.delayMs;
      setIsAdvancedOpen(true);
      window.sessionStorage.setItem(ADVANCED_STORAGE_KEY, "true");
      updateEnvironment({ delay: "custom", delayMs: nextDelayMs });
      window.setTimeout(() => customDelayInputRef.current?.focus(), 0);
    } else {
      updateEnvironment({ delay: "normal" });
    }
  };

  const resetState = () => {
    const next = {
      sceneState: getDefaultWebDemoSceneState(pathname),
      environment: getDefaultWebDemoEnvironment(pathname, app),
    };
    setCustomDelayError(null);
    setCustomDelayDraft(String(next.environment.delayMs));
    setRuntime(next);
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
            <section
              className="web-demo-inspector-group web-demo-inspector-global-group"
              aria-labelledby="web-demo-inspector-global-heading"
            >
              <h3
                id="web-demo-inspector-global-heading"
                className="web-demo-inspector-group-heading"
              >
                <Settings2 aria-hidden="true" size={15} />
                全局环境
              </h3>
              <div className="web-demo-inspector-setting-list">
                <div className="web-demo-inspector-setting web-demo-inspector-setting-persona">
                  <span className="web-demo-inspector-setting-label">
                    <UserRound aria-hidden="true" size={14} />
                    模拟身份
                  </span>
                  <RadioGroup
                    className="web-demo-inspector-radio-group web-demo-inspector-radio-group-three"
                    orientation="horizontal"
                    value={environment.persona}
                    onValueChange={(value) =>
                      updateEnvironment({ persona: value as WebDemoPersona })
                    }
                    aria-label="模拟身份"
                  >
                    {personaOptions.map(({ value, label, icon: Icon }) => (
                      <RadioGroupItem
                        key={value}
                        value={value}
                        density="compact"
                        aria-label={label}
                        data-testid={`web-demo-persona-${value}`}
                      >
                        <Icon aria-hidden="true" size={13} />
                        {label}
                      </RadioGroupItem>
                    ))}
                  </RadioGroup>
                </div>

                <div className="web-demo-inspector-setting web-demo-inspector-setting-connection">
                  <span className="web-demo-inspector-setting-label">
                    {environment.connection === "offline" ? (
                      <WifiOff aria-hidden="true" size={14} />
                    ) : (
                      <Wifi aria-hidden="true" size={14} />
                    )}
                    网络连接
                  </span>
                  <RadioGroup
                    className="web-demo-inspector-radio-group"
                    orientation="horizontal"
                    value={environment.connection}
                    onValueChange={(value) =>
                      updateEnvironment({ connection: value as WebDemoConnection })
                    }
                    aria-label="网络连接"
                  >
                    {connectionOptions.map(({ value, label, icon: Icon }) => (
                      <RadioGroupItem
                        key={value}
                        value={value}
                        density="compact"
                        aria-label={label}
                        data-testid={`web-demo-connection-${value}`}
                      >
                        <Icon aria-hidden="true" size={13} />
                        {label}
                      </RadioGroupItem>
                    ))}
                  </RadioGroup>
                </div>

                <div className="web-demo-inspector-setting web-demo-inspector-setting-delay">
                  <span className="web-demo-inspector-setting-label">
                    <Gauge aria-hidden="true" size={14} />
                    请求延迟
                  </span>
                  {environment.delay === "custom" ? (
                    <button
                      type="button"
                      className="web-demo-inspector-custom-delay-button"
                      onClick={() => {
                        setIsAdvancedOpen(true);
                        window.sessionStorage.setItem(ADVANCED_STORAGE_KEY, "true");
                        window.setTimeout(() => customDelayInputRef.current?.focus(), 0);
                      }}
                    >
                      自定义 · {environment.delayMs} ms
                      <ChevronDown aria-hidden="true" size={14} />
                    </button>
                  ) : (
                    <RadioGroup
                      className="web-demo-inspector-radio-group"
                      orientation="horizontal"
                      value={environment.delay}
                      onValueChange={(value) =>
                        updateEnvironment({ delay: value as WebDemoDelayMode })
                      }
                      aria-label="请求延迟"
                    >
                      {delayOptions.map(({ value, label }) => (
                        <RadioGroupItem
                          key={value}
                          value={value}
                          density="compact"
                          aria-label={label}
                          data-testid={`web-demo-delay-${value}`}
                        >
                          {label}
                        </RadioGroupItem>
                      ))}
                    </RadioGroup>
                  )}
                </div>

                <div className="web-demo-inspector-setting web-demo-inspector-setting-theme">
                  <span className="web-demo-inspector-setting-label">
                    {environment.theme === "dark" ? (
                      <Moon aria-hidden="true" size={14} />
                    ) : environment.theme === "light" ? (
                      <Sun aria-hidden="true" size={14} />
                    ) : (
                      <MonitorCog aria-hidden="true" size={14} />
                    )}
                    产品主题
                  </span>
                  <RadioGroup
                    className="web-demo-inspector-radio-group web-demo-inspector-radio-group-three"
                    orientation="horizontal"
                    value={environment.theme}
                    onValueChange={(value) =>
                      updateEnvironment({ theme: value as WebDemoThemeSelection })
                    }
                    aria-label="产品主题"
                  >
                    {themeOptions.map(({ value, label, icon: Icon }) => (
                      <RadioGroupItem
                        key={value}
                        value={value}
                        density="compact"
                        aria-label={label}
                        data-testid={`web-demo-theme-${value}`}
                      >
                        <Icon aria-hidden="true" size={13} />
                        {label}
                      </RadioGroupItem>
                    ))}
                  </RadioGroup>
                </div>
              </div>

              <div className="web-demo-inspector-advanced">
                <button
                  type="button"
                  className="web-demo-inspector-advanced-trigger"
                  aria-expanded={isAdvancedOpen}
                  aria-controls="web-demo-inspector-advanced-content"
                  onClick={() => {
                    const next = !isAdvancedOpen;
                    setIsAdvancedOpen(next);
                    window.sessionStorage.setItem(ADVANCED_STORAGE_KEY, String(next));
                  }}
                >
                  <span className="web-demo-inspector-advanced-label">
                    <SlidersHorizontal
                      className="web-demo-inspector-advanced-icon"
                      aria-hidden="true"
                      size={14}
                    />
                    高级
                    {advancedItems.length > 0 ? ` · ${advancedItems.length}` : ""}
                  </span>
                  <span className="web-demo-inspector-advanced-summary">
                    {advancedSummary}
                    {isAdvancedOpen ? (
                      <ChevronUp aria-hidden="true" size={14} />
                    ) : (
                      <ChevronDown aria-hidden="true" size={14} />
                    )}
                  </span>
                </button>
                {isAdvancedOpen ? (
                  <div
                    id="web-demo-inspector-advanced-content"
                    className="web-demo-inspector-advanced-content"
                  >
                    <div className="web-demo-inspector-advanced-row">
                      <div>
                        <span className="web-demo-inspector-setting-label">自定义延迟</span>
                        <small>启用后使用下方毫秒数。</small>
                      </div>
                      <Switch
                        checked={environment.delay === "custom"}
                        onCheckedChange={toggleCustomDelay}
                        aria-label="启用自定义请求延迟"
                      />
                    </div>
                    <label
                      className="web-demo-inspector-delay-input"
                      htmlFor="web-demo-custom-delay"
                    >
                      <span>附加延迟（毫秒）</span>
                      <Input
                        ref={customDelayInputRef}
                        id="web-demo-custom-delay"
                        density="compact"
                        type="number"
                        min={0}
                        max={30000}
                        step={1}
                        inputMode="numeric"
                        value={customDelayDraft}
                        onChange={(event) => setCustomDelayDraft(event.currentTarget.value)}
                        onBlur={commitCustomDelay}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitCustomDelay();
                        }}
                        aria-invalid={customDelayError ? "true" : undefined}
                        aria-describedby={
                          customDelayError ? "web-demo-custom-delay-error" : undefined
                        }
                      />
                      {customDelayError ? (
                        <small
                          id="web-demo-custom-delay-error"
                          className="web-demo-inspector-error"
                        >
                          {customDelayError}
                        </small>
                      ) : null}
                    </label>
                    <div className="web-demo-inspector-advanced-row web-demo-inspector-motion-row">
                      <div>
                        <span className="web-demo-inspector-setting-label">动效偏好</span>
                        <small>同时作用于产品动效和环境背景。</small>
                      </div>
                      <RadioGroup
                        className="web-demo-inspector-radio-group"
                        orientation="horizontal"
                        value={environment.motion}
                        onValueChange={(value) =>
                          updateEnvironment({ motion: value as WebDemoMotionPreference })
                        }
                        aria-label="动效偏好"
                      >
                        {motionOptions.map(({ value, label }) => (
                          <RadioGroupItem
                            key={value}
                            value={value}
                            density="compact"
                            aria-label={label}
                          >
                            {label}
                          </RadioGroupItem>
                        ))}
                      </RadioGroup>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section
              className="web-demo-inspector-group web-demo-inspector-scene-group"
              aria-labelledby="web-demo-inspector-scene-heading"
            >
              <h3
                id="web-demo-inspector-scene-heading"
                className="web-demo-inspector-group-heading"
              >
                <SlidersHorizontal aria-hidden="true" size={15} />
                Scene
              </h3>
              <label className="web-demo-inspector-field" htmlFor="web-demo-inspector-scene">
                <span>场景</span>
                <SelectPrimitive.Root
                  value={activeScene}
                  onValueChange={(value) =>
                    updateScene({ scene: value as WebDemoSceneState["scene"] })
                  }
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
            </section>

            <section
              className="web-demo-inspector-group web-demo-inspector-data-group"
              aria-labelledby="web-demo-inspector-data-heading"
            >
              <h3 id="web-demo-inspector-data-heading" className="web-demo-inspector-group-heading">
                <Database aria-hidden="true" size={15} />
                Data
              </h3>
              <RadioGroup
                className="web-demo-inspector-radio-group web-demo-inspector-radio-group-three web-demo-inspector-data-mode"
                orientation="horizontal"
                value={sceneState.data}
                onValueChange={(value) => updateScene({ data: value as WebDemoSceneState["data"] })}
                aria-label="数据规模"
              >
                {dataOptions.map(({ value, label }) => (
                  <RadioGroupItem key={value} value={value} density="compact" aria-label={label}>
                    {label}
                  </RadioGroupItem>
                ))}
              </RadioGroup>
            </section>

            <section
              className="web-demo-inspector-group web-demo-inspector-actions-group"
              aria-labelledby="web-demo-inspector-actions-heading"
            >
              <h3
                id="web-demo-inspector-actions-heading"
                className="web-demo-inspector-group-heading"
              >
                <Zap aria-hidden="true" size={15} />
                Actions
              </h3>
              <div className="web-demo-inspector-actions">
                <Button
                  type="button"
                  variant="outline"
                  size="compact"
                  onClick={() => runAction("refresh-data", "刷新数据")}
                >
                  <RefreshCw aria-hidden="true" size={15} />
                  刷新数据
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="compact"
                  onClick={() => runAction("simulate-save", "模拟保存")}
                >
                  <Save aria-hidden="true" size={15} />
                  模拟保存
                </Button>
                <Button type="button" variant="outline" size="compact" onClick={resetState}>
                  <RotateCcw aria-hidden="true" size={15} />
                  重置场景
                </Button>
              </div>
            </section>

            <details className="web-demo-inspector-secondary">
              <summary>
                <span>
                  <Share2 aria-hidden="true" size={15} />
                  分享与记录
                </span>
                <span className="web-demo-inspector-secondary-summary">
                  {mutations.length > 0 ? `${mutations.length} 条记录` : "分享链接"}
                  <ChevronDown aria-hidden="true" size={14} />
                </span>
              </summary>
              <section
                className="web-demo-inspector-group web-demo-inspector-share-group"
                aria-labelledby="web-demo-inspector-share-heading"
              >
                <h3
                  id="web-demo-inspector-share-heading"
                  className="web-demo-inspector-group-heading"
                >
                  Share state
                </h3>
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
                    : "场景、身份、连接、延迟、主题和动效写入 d_* 参数。"}
                </small>
              </section>

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
            </details>
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
