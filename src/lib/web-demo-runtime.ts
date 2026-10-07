import { setThemePreference } from "./theme";

export const WEB_DEMO_STATE_EVENT = "web-demo:state-change";
export const WEB_DEMO_ACTION_EVENT = "web-demo:action";
export const WEB_DEMO_MOTION_EVENT = "web-demo:motion-change";
export const WEB_DEMO_ROUTE_EVENT = "web-demo:route-change";

const WEB_DEMO_SESSION_KEY = "web-demo-global-environment";

export type WebDemoApp = "public" | "admin";
export type WebDemoPersona = "guest" | "user" | "admin";
export type WebDemoConnection = "online" | "offline";
export type WebDemoDelayMode = "normal" | "slow" | "custom";
export type WebDemoThemeSelection = "light" | "dark" | "system";
export type WebDemoMotionPreference = "system" | "reduce";

/** @deprecated Use WebDemoConnection and WebDemoDelayMode for new code. */
export type WebDemoNetwork = "healthy" | "slow" | "offline";

export type WebDemoDataMode = "fixture" | "dense" | "empty";
export type WebDemoScene =
  | "public-reading"
  | "memo-middle"
  | "memo-newest"
  | "memo-oldest"
  | "memo-network-fault"
  | "playbook-index"
  | "playbook-topic"
  | "admin-dashboard"
  | "admin-editor";

export type WebDemoSceneState = {
  scene: WebDemoScene;
  data: WebDemoDataMode;
};

export type WebDemoEnvironment = {
  persona: WebDemoPersona;
  connection: WebDemoConnection;
  delay: WebDemoDelayMode;
  delayMs: number;
  theme: WebDemoThemeSelection;
  motion: WebDemoMotionPreference;
};

/** Compatibility snapshot for existing scene consumers. New code should use WebDemoRuntimeState. */
export type WebDemoState = WebDemoSceneState & {
  persona: WebDemoPersona;
  network: WebDemoNetwork;
};

export type WebDemoRuntimeState = {
  sceneState: WebDemoSceneState;
  environment: WebDemoEnvironment;
};

export type WebDemoStateChangeKey =
  | "scene"
  | "data"
  | "persona"
  | "connection"
  | "delay"
  | "theme"
  | "motion";

export type WebDemoStateChangeDetail = {
  state: WebDemoState;
  sceneState: WebDemoSceneState;
  environment: WebDemoEnvironment;
  changed: WebDemoStateChangeKey[];
};

export type WebDemoAction = "refresh-data" | "simulate-save" | "reset-state" | "clear-mutations";

export type WebDemoActionDetail = {
  action: WebDemoAction;
  label: string;
  at: number;
};

export type WebDemoMutation = {
  id: string;
  label: string;
  detail: string;
  at: number;
};

export type WebDemoSceneOption = {
  value: WebDemoScene;
  label: string;
  description: string;
};

const stateKeys = {
  scene: "d_scene",
  data: "d_data",
  persona: "d_persona",
  connection: "d_connection",
  delay: "d_delay",
  delayMs: "d_delay_ms",
  theme: "d_theme",
  motion: "d_motion",
  legacyNetwork: "d_network",
} as const;

const defaultSceneState: WebDemoSceneState = {
  scene: "public-reading",
  data: "fixture",
};

const defaultEnvironment: WebDemoEnvironment = {
  persona: "guest",
  connection: "online",
  delay: "normal",
  delayMs: 1500,
  theme: "system",
  motion: "system",
};

const scenes = [
  "public-reading",
  "memo-middle",
  "memo-newest",
  "memo-oldest",
  "memo-network-fault",
  "playbook-index",
  "playbook-topic",
  "admin-dashboard",
  "admin-editor",
] as const satisfies readonly WebDemoScene[];
const personas = ["guest", "user", "admin"] as const satisfies readonly WebDemoPersona[];
const connections = ["online", "offline"] as const satisfies readonly WebDemoConnection[];
const delays = ["normal", "slow", "custom"] as const satisfies readonly WebDemoDelayMode[];
const themes = ["light", "dark", "system"] as const satisfies readonly WebDemoThemeSelection[];
const motions = ["system", "reduce"] as const satisfies readonly WebDemoMotionPreference[];
const dataModes = ["fixture", "dense", "empty"] as const satisfies readonly WebDemoDataMode[];

function isValue<T extends string>(
  value: string | null | undefined,
  values: readonly T[]
): value is T {
  return value !== null && value !== undefined && values.includes(value as T);
}

function getLocation(location?: Pick<Location, "pathname" | "search">) {
  if (location) return location;
  return window.location;
}

function clampDelayMs(value: number) {
  return Math.min(30_000, Math.max(0, Math.trunc(value)));
}

function isValidDelayMs(value: string | null | undefined): value is string {
  if (!value || !/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 30_000;
}

function readSessionEnvironment(): Partial<WebDemoEnvironment> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(WEB_DEMO_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<WebDemoEnvironment>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessionEnvironment(environment: WebDemoEnvironment) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WEB_DEMO_SESSION_KEY, JSON.stringify(environment));
  } catch {
    // Session storage is an optional reproduction aid; URL state remains authoritative.
  }
}

function legacyNetworkToEnvironment(
  network: WebDemoNetwork
): Pick<WebDemoEnvironment, "connection" | "delay"> {
  if (network === "offline") return { connection: "offline", delay: "normal" };
  return { connection: "online", delay: network === "slow" ? "slow" : "normal" };
}

function environmentToLegacyNetwork(environment: WebDemoEnvironment): WebDemoNetwork {
  if (environment.connection === "offline") return "offline";
  return environment.delay === "slow" ? "slow" : "healthy";
}

export function getDefaultWebDemoSceneState(pathname = ""): WebDemoSceneState {
  if (pathname.startsWith("/admin")) return { ...defaultSceneState, scene: "admin-dashboard" };
  if (pathname.startsWith("/playbook/topics/"))
    return { ...defaultSceneState, scene: "playbook-topic" };
  if (pathname.startsWith("/playbook")) return { ...defaultSceneState, scene: "playbook-index" };
  if (pathname.startsWith("/memos")) return { ...defaultSceneState, scene: "memo-middle" };
  return { ...defaultSceneState };
}

export function getDefaultWebDemoEnvironment(pathname = "", app: WebDemoApp = "public") {
  return {
    ...defaultEnvironment,
    persona: pathname.startsWith("/admin") || app === "admin" ? "admin" : "guest",
  } satisfies WebDemoEnvironment;
}

export function normalizeWebDemoEnvironment(
  environment: Partial<WebDemoEnvironment>,
  pathname = "",
  app: WebDemoApp = pathname.startsWith("/admin") ? "admin" : "public"
): WebDemoEnvironment {
  const fallback = getDefaultWebDemoEnvironment(pathname, app);
  const delayMs = Number.isSafeInteger(environment.delayMs)
    ? clampDelayMs(environment.delayMs as number)
    : fallback.delayMs;
  return {
    persona: isValue(environment.persona, personas) ? environment.persona : fallback.persona,
    connection: isValue(environment.connection, connections)
      ? environment.connection
      : fallback.connection,
    delay: isValue(environment.delay, delays) ? environment.delay : fallback.delay,
    delayMs,
    theme: isValue(environment.theme, themes) ? environment.theme : fallback.theme,
    motion: isValue(environment.motion, motions) ? environment.motion : fallback.motion,
  };
}

export function normalizeWebDemoSceneState(
  state: Partial<WebDemoSceneState>,
  pathname = "",
  app: WebDemoApp = pathname.startsWith("/admin") ? "admin" : "public"
): WebDemoSceneState {
  const fallback = getDefaultWebDemoSceneState(pathname);
  let scene = isValue(state.scene, scenes) ? state.scene : fallback.scene;
  if (app === "admin" && scene.startsWith("memo-")) scene = "admin-dashboard";
  if (app === "public" && scene.startsWith("admin-")) scene = fallback.scene;
  return {
    scene,
    data: isValue(state.data, dataModes) ? state.data : fallback.data,
  };
}

export function getDefaultWebDemoState(pathname = ""): WebDemoState {
  const app: WebDemoApp = pathname.startsWith("/admin") ? "admin" : "public";
  return toLegacyWebDemoState({
    sceneState: getDefaultWebDemoSceneState(pathname),
    environment: getDefaultWebDemoEnvironment(pathname, app),
  });
}

export function normalizeWebDemoState(
  state: Partial<WebDemoState>,
  pathname = "",
  app: WebDemoApp = pathname.startsWith("/admin") ? "admin" : "public"
): WebDemoState {
  const legacyNetwork = isValue(state.network, ["healthy", "slow", "offline"] as const)
    ? state.network
    : undefined;
  const environment = normalizeWebDemoEnvironment(
    {
      persona: state.persona,
      ...(legacyNetwork ? legacyNetworkToEnvironment(legacyNetwork) : {}),
    },
    pathname,
    app
  );
  return toLegacyWebDemoState({
    sceneState: normalizeWebDemoSceneState(state, pathname, app),
    environment,
  });
}

export function getWebDemoEnvironment(
  location?: Pick<Location, "pathname" | "search">,
  app: WebDemoApp = location?.pathname.startsWith("/admin") ? "admin" : "public"
): WebDemoEnvironment {
  const currentLocation = getLocation(location);
  const params = new URLSearchParams(currentLocation.search);
  const session = readSessionEnvironment();
  const fallback = getDefaultWebDemoEnvironment(currentLocation.pathname, app);
  const personaParam = params.get(stateKeys.persona);
  const connectionParam = params.get(stateKeys.connection);
  const delayParam = params.get(stateKeys.delay);
  const delayMsParam = params.get(stateKeys.delayMs);
  const themeParam = params.get(stateKeys.theme);
  const motionParam = params.get(stateKeys.motion);
  const legacyNetwork = params.get(stateKeys.legacyNetwork);
  const legacyEnvironment = isValue(legacyNetwork, ["healthy", "slow", "offline"] as const)
    ? legacyNetworkToEnvironment(legacyNetwork)
    : null;
  const hasNewConnection = isValue(connectionParam, connections);
  const hasNewDelay = isValue(delayParam, delays);
  const hasNewDelayMs = isValidDelayMs(delayMsParam);

  return normalizeWebDemoEnvironment(
    {
      persona: isValue(personaParam, personas)
        ? personaParam
        : isValue(session.persona, personas)
          ? session.persona
          : fallback.persona,
      connection: hasNewConnection
        ? connectionParam
        : (legacyEnvironment?.connection ??
          (isValue(session.connection, connections) ? session.connection : fallback.connection)),
      delay: hasNewDelay
        ? delayParam
        : (legacyEnvironment?.delay ??
          (isValue(session.delay, delays) ? session.delay : fallback.delay)),
      delayMs: hasNewDelayMs
        ? Number(delayMsParam)
        : Number.isSafeInteger(session.delayMs)
          ? session.delayMs
          : fallback.delayMs,
      theme: isValue(themeParam, themes)
        ? themeParam
        : isValue(session.theme, themes)
          ? session.theme
          : fallback.theme,
      motion: isValue(motionParam, motions)
        ? motionParam
        : isValue(session.motion, motions)
          ? session.motion
          : fallback.motion,
    },
    currentLocation.pathname,
    app
  );
}

export function getWebDemoSceneState(
  location?: Pick<Location, "pathname" | "search">,
  app: WebDemoApp = location?.pathname.startsWith("/admin") ? "admin" : "public"
): WebDemoSceneState {
  const currentLocation = getLocation(location);
  const params = new URLSearchParams(currentLocation.search);
  const sceneParam = params.get(stateKeys.scene);
  const dataParam = params.get(stateKeys.data);
  return normalizeWebDemoSceneState(
    {
      scene: sceneParam && isValue(sceneParam, scenes) ? sceneParam : undefined,
      data: dataParam && isValue(dataParam, dataModes) ? dataParam : undefined,
    },
    currentLocation.pathname,
    app
  );
}

export function getWebDemoRuntimeState(
  location?: Pick<Location, "pathname" | "search">,
  app: WebDemoApp = location?.pathname.startsWith("/admin") ? "admin" : "public"
): WebDemoRuntimeState {
  return {
    sceneState: getWebDemoSceneState(location, app),
    environment: getWebDemoEnvironment(location, app),
  };
}

export function getWebDemoState(
  location?: Pick<Location, "pathname" | "search">,
  app: WebDemoApp = location?.pathname.startsWith("/admin") ? "admin" : "public"
): WebDemoState {
  return toLegacyWebDemoState(getWebDemoRuntimeState(location, app));
}

function toLegacyWebDemoState(runtimeState: WebDemoRuntimeState): WebDemoState {
  return {
    ...runtimeState.sceneState,
    persona: runtimeState.environment.persona,
    network: environmentToLegacyNetwork(runtimeState.environment),
  };
}

function runtimeFromLegacyState(
  state: WebDemoState,
  pathname: string,
  app: WebDemoApp
): WebDemoRuntimeState {
  return {
    sceneState: normalizeWebDemoSceneState(state, pathname, app),
    environment: normalizeWebDemoEnvironment(
      {
        persona: state.persona,
        ...legacyNetworkToEnvironment(state.network),
      },
      pathname,
      app
    ),
  };
}

export function getWebDemoSceneOptions(pathname: string, app: WebDemoApp): WebDemoSceneOption[] {
  if (app === "admin") {
    return [
      {
        value: "admin-dashboard",
        label: "后台 · 仪表盘",
        description: "统计卡片、近期活动和权限状态。",
      },
      {
        value: "admin-editor",
        label: "后台 · 编辑器",
        description: "文件树、编辑器和模拟保存反馈。",
      },
    ];
  }

  if (pathname.startsWith("/memos")) {
    return [
      {
        value: "memo-middle",
        label: "Memos · 中段窗口",
        description: "从中间游标开始，向两端连续加载。",
      },
      {
        value: "memo-newest",
        label: "Memos · 最新边界",
        description: "从最新记录开始，验证向旧记录加载。",
      },
      {
        value: "memo-oldest",
        label: "Memos · 最旧边界",
        description: "从最旧记录开始，验证向新记录加载。",
      },
      {
        value: "memo-network-fault",
        label: "Memos · 网络故障",
        description: "加载下一页时返回可恢复的模拟错误。",
      },
    ];
  }

  if (pathname.startsWith("/playbook/topics/")) {
    return [
      {
        value: "playbook-topic",
        label: "Playbook · 主题详情",
        description: "固定版本的主题正文和资源。",
      },
      {
        value: "playbook-index",
        label: "Playbook · 主题索引",
        description: "主题目录、版本信息和检索入口。",
      },
    ];
  }

  if (pathname.startsWith("/playbook")) {
    return [
      {
        value: "playbook-index",
        label: "Playbook · 主题索引",
        description: "主题目录、版本信息和检索入口。",
      },
      {
        value: "playbook-topic",
        label: "Playbook · 主题详情",
        description: "固定版本的主题正文和资源。",
      },
    ];
  }

  return [
    {
      value: "public-reading",
      label: "公共站点 · 阅读",
      description: "正式公共页面的只读模拟状态。",
    },
  ];
}

export function getWebDemoStateChangeKeys(
  previous: WebDemoRuntimeState,
  next: WebDemoRuntimeState
): WebDemoStateChangeKey[] {
  const changed: WebDemoStateChangeKey[] = [];
  if (previous.sceneState.scene !== next.sceneState.scene) changed.push("scene");
  if (previous.sceneState.data !== next.sceneState.data) changed.push("data");
  if (previous.environment.persona !== next.environment.persona) changed.push("persona");
  if (previous.environment.connection !== next.environment.connection) changed.push("connection");
  if (
    previous.environment.delay !== next.environment.delay ||
    previous.environment.delayMs !== next.environment.delayMs
  ) {
    changed.push("delay");
  }
  if (previous.environment.theme !== next.environment.theme) changed.push("theme");
  if (previous.environment.motion !== next.environment.motion) changed.push("motion");
  return changed;
}

function emitWebDemoStateChange(next: WebDemoRuntimeState, previous: WebDemoRuntimeState) {
  const detail: WebDemoStateChangeDetail = {
    state: toLegacyWebDemoState(next),
    sceneState: next.sceneState,
    environment: next.environment,
    changed: getWebDemoStateChangeKeys(previous, next),
  };
  window.dispatchEvent(new CustomEvent<WebDemoStateChangeDetail>(WEB_DEMO_STATE_EVENT, { detail }));
}

export function writeWebDemoRuntimeStateToLocation(
  runtimeState: WebDemoRuntimeState,
  location = window.location
) {
  const url = new URL(location.href);
  const { sceneState, environment } = runtimeState;
  url.searchParams.set(stateKeys.scene, sceneState.scene);
  url.searchParams.set(stateKeys.data, sceneState.data);
  url.searchParams.set(stateKeys.persona, environment.persona);
  url.searchParams.set(stateKeys.connection, environment.connection);
  url.searchParams.set(stateKeys.delay, environment.delay);
  url.searchParams.set(stateKeys.delayMs, String(environment.delayMs));
  url.searchParams.set(stateKeys.theme, environment.theme);
  url.searchParams.set(stateKeys.motion, environment.motion);
  url.searchParams.delete(stateKeys.legacyNetwork);
  window.history.replaceState(window.history.state, "", url);
}

export function writeWebDemoStateToLocation(state: WebDemoState, location = window.location) {
  writeWebDemoRuntimeStateToLocation(
    runtimeFromLegacyState(
      state,
      location.pathname,
      location.pathname.startsWith("/admin") ? "admin" : "public"
    ),
    location
  );
}

export function getWebDemoShareUrl(
  state: WebDemoState | WebDemoRuntimeState,
  location = window.location
) {
  const runtimeState =
    "environment" in state
      ? state
      : runtimeFromLegacyState(
          state,
          location.pathname,
          location.pathname.startsWith("/admin") ? "admin" : "public"
        );
  const url = new URL(location.href);
  const { sceneState, environment } = runtimeState;
  url.searchParams.set(stateKeys.scene, sceneState.scene);
  url.searchParams.set(stateKeys.data, sceneState.data);
  url.searchParams.set(stateKeys.persona, environment.persona);
  url.searchParams.set(stateKeys.connection, environment.connection);
  url.searchParams.set(stateKeys.delay, environment.delay);
  url.searchParams.set(stateKeys.delayMs, String(environment.delayMs));
  url.searchParams.set(stateKeys.theme, environment.theme);
  url.searchParams.set(stateKeys.motion, environment.motion);
  url.searchParams.delete(stateKeys.legacyNetwork);
  return url.toString();
}

export function setWebDemoRuntimeState(
  next: WebDemoRuntimeState,
  options: { syncTheme?: boolean } = {}
) {
  const previous = getWebDemoRuntimeState(window.location);
  const normalized: WebDemoRuntimeState = {
    sceneState: normalizeWebDemoSceneState(next.sceneState, window.location.pathname),
    environment: normalizeWebDemoEnvironment(next.environment, window.location.pathname),
  };
  const changed = getWebDemoStateChangeKeys(previous, normalized);
  if (changed.some((key) => key === "persona" || key === "connection" || key === "delay")) {
    cancelWebDemoRequests();
  }
  writeWebDemoRuntimeStateToLocation(normalized);
  writeSessionEnvironment(normalized.environment);
  if (previous.environment.theme !== normalized.environment.theme && options.syncTheme !== false) {
    setThemePreference(normalized.environment.theme);
  }
  if (previous.environment.motion !== normalized.environment.motion) {
    document.documentElement.dataset.webDemoMotion = normalized.environment.motion;
    window.dispatchEvent(
      new CustomEvent<{ motion: WebDemoMotionPreference }>(WEB_DEMO_MOTION_EVENT, {
        detail: { motion: normalized.environment.motion },
      })
    );
  }
  emitWebDemoStateChange(normalized, previous);
}

export function setWebDemoState(state: WebDemoState) {
  setWebDemoRuntimeState(
    runtimeFromLegacyState(
      state,
      window.location.pathname,
      window.location.pathname.startsWith("/admin") ? "admin" : "public"
    )
  );
}

export function initializeWebDemoEnvironment(app: WebDemoApp) {
  const runtimeState = getWebDemoRuntimeState(window.location, app);
  writeSessionEnvironment(runtimeState.environment);
  setThemePreference(runtimeState.environment.theme);
  document.documentElement.dataset.webDemoPersona = runtimeState.environment.persona;
  document.documentElement.dataset.webDemoConnection = runtimeState.environment.connection;
  document.documentElement.dataset.webDemoDelay = runtimeState.environment.delay;
  document.documentElement.dataset.webDemoMotion = runtimeState.environment.motion;
  return runtimeState;
}

export function isWebDemoBuildEnabled() {
  return (
    typeof document !== "undefined" && document.documentElement.dataset.webDemoBuild === "true"
  );
}

export function subscribeWebDemoRequestChanges(onChange: () => void) {
  if (!isWebDemoBuildEnabled()) return () => undefined;
  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent<WebDemoStateChangeDetail>).detail;
    if (detail?.changed.some((key) => ["persona", "connection", "delay"].includes(key))) {
      onChange();
    }
  };
  window.addEventListener(WEB_DEMO_STATE_EVENT, handleChange);
  return () => window.removeEventListener(WEB_DEMO_STATE_EVENT, handleChange);
}

let webDemoRequestController: AbortController | null = null;

export function getWebDemoRequestSignal(): AbortSignal | undefined {
  if (typeof window === "undefined" || !isWebDemoBuildEnabled()) {
    return undefined;
  }

  if (!webDemoRequestController || webDemoRequestController.signal.aborted) {
    webDemoRequestController = new AbortController();
  }
  return webDemoRequestController.signal;
}

export function cancelWebDemoRequests() {
  webDemoRequestController?.abort();
  webDemoRequestController = null;
}

export function getWebDemoRequestDelayMs(environment: WebDemoEnvironment) {
  if (environment.delay === "slow") return 1500;
  if (environment.delay === "custom") return environment.delayMs;
  return 0;
}

function createAbortError() {
  if (typeof DOMException !== "undefined")
    return new DOMException("The request was aborted.", "AbortError");
  const error = new Error("The request was aborted.");
  error.name = "AbortError";
  return error;
}

export function isWebDemoAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function assertWebDemoRequestAvailable(
  environment: WebDemoEnvironment,
  signal?: AbortSignal
) {
  if (signal?.aborted) throw createAbortError();
  if (environment.connection === "offline") throw new TypeError("Failed to fetch");
}

export function waitForWebDemoRequest(environment: WebDemoEnvironment, signal?: AbortSignal) {
  assertWebDemoRequestAvailable(environment, signal);
  const delayMs = getWebDemoRequestDelayMs(environment);
  if (delayMs === 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    timer = window.setTimeout(() => {
      cleanup();
      if (signal?.aborted) reject(createAbortError());
      else resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function dispatchWebDemoAction(action: WebDemoAction, label: string) {
  const detail: WebDemoActionDetail = { action, label, at: Date.now() };
  window.dispatchEvent(new CustomEvent<WebDemoActionDetail>(WEB_DEMO_ACTION_EVENT, { detail }));
}

export function readWebDemoMutations(): WebDemoMutation[] {
  if (typeof window === "undefined") return [];
  return [...(window.__webDemoMutationLog ?? [])];
}

export function recordWebDemoMutation(label: string, detail: string): WebDemoMutation {
  const mutation: WebDemoMutation = {
    id: `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    detail,
    at: Date.now(),
  };
  window.__webDemoMutationLog = [mutation, ...(window.__webDemoMutationLog ?? [])].slice(0, 8);
  return mutation;
}

declare global {
  interface Window {
    __webDemoMutationLog?: WebDemoMutation[];
  }
}
