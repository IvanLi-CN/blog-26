export const WEB_DEMO_STATE_EVENT = "web-demo:state-change";
export const WEB_DEMO_ACTION_EVENT = "web-demo:action";

export type WebDemoApp = "public" | "admin";
export type WebDemoPersona = "guest" | "admin";
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

export type WebDemoState = {
  scene: WebDemoScene;
  persona: WebDemoPersona;
  network: WebDemoNetwork;
  data: WebDemoDataMode;
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
  persona: "d_persona",
  network: "d_network",
  data: "d_data",
} as const;

const defaultState: WebDemoState = {
  scene: "public-reading",
  persona: "guest",
  network: "healthy",
  data: "fixture",
};

function isValue<T extends string>(value: string | null, values: readonly T[]): value is T {
  return value !== null && values.includes(value as T);
}

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
const personas = ["guest", "admin"] as const satisfies readonly WebDemoPersona[];
const networks = ["healthy", "slow", "offline"] as const satisfies readonly WebDemoNetwork[];
const dataModes = ["fixture", "dense", "empty"] as const satisfies readonly WebDemoDataMode[];

export function getDefaultWebDemoState(pathname = ""): WebDemoState {
  if (pathname.startsWith("/admin")) {
    return { ...defaultState, scene: "admin-dashboard", persona: "admin" };
  }
  if (pathname.startsWith("/playbook/topics/")) {
    return { ...defaultState, scene: "playbook-topic" };
  }
  if (pathname.startsWith("/playbook")) {
    return { ...defaultState, scene: "playbook-index" };
  }
  if (pathname.startsWith("/memos")) {
    return { ...defaultState, scene: "memo-middle" };
  }
  return { ...defaultState, scene: "public-reading" };
}

export function normalizeWebDemoState(
  state: Partial<WebDemoState>,
  pathname = "",
  app: WebDemoApp = pathname.startsWith("/admin") ? "admin" : "public"
): WebDemoState {
  const fallback = getDefaultWebDemoState(pathname);
  const normalized: WebDemoState = {
    scene: isValue(state.scene ?? null, scenes) ? state.scene : fallback.scene,
    persona: isValue(state.persona ?? null, personas) ? state.persona : fallback.persona,
    network: isValue(state.network ?? null, networks) ? state.network : fallback.network,
    data: isValue(state.data ?? null, dataModes) ? state.data : fallback.data,
  };

  if (app === "admin" && normalized.scene.startsWith("memo-")) {
    normalized.scene = "admin-dashboard";
  }
  if (app === "public" && normalized.scene.startsWith("admin-")) {
    normalized.scene = getDefaultWebDemoState(pathname).scene;
  }
  if (normalized.scene === "memo-network-fault") normalized.network = "offline";
  return normalized;
}

export function getWebDemoState(
  location: Pick<Location, "pathname" | "search"> = window.location,
  app: WebDemoApp = location.pathname.startsWith("/admin") ? "admin" : "public"
): WebDemoState {
  const params = new URLSearchParams(location.search);
  return normalizeWebDemoState(
    {
      scene: params.get(stateKeys.scene) as WebDemoScene | null,
      persona: params.get(stateKeys.persona) as WebDemoPersona | null,
      network: params.get(stateKeys.network) as WebDemoNetwork | null,
      data: params.get(stateKeys.data) as WebDemoDataMode | null,
    },
    location.pathname,
    app
  );
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

export function writeWebDemoStateToLocation(state: WebDemoState, location = window.location) {
  const url = new URL(location.href);
  url.searchParams.set(stateKeys.scene, state.scene);
  url.searchParams.set(stateKeys.persona, state.persona);
  url.searchParams.set(stateKeys.network, state.network);
  url.searchParams.set(stateKeys.data, state.data);
  window.history.replaceState(window.history.state, "", url);
}

export function getWebDemoShareUrl(state: WebDemoState, location = window.location) {
  const url = new URL(location.href);
  url.searchParams.set(stateKeys.scene, state.scene);
  url.searchParams.set(stateKeys.persona, state.persona);
  url.searchParams.set(stateKeys.network, state.network);
  url.searchParams.set(stateKeys.data, state.data);
  return url.toString();
}

export function setWebDemoState(state: WebDemoState) {
  writeWebDemoStateToLocation(state);
  window.dispatchEvent(
    new CustomEvent<{ state: WebDemoState }>(WEB_DEMO_STATE_EVENT, { detail: { state } })
  );
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
