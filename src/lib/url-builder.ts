/**
 * 统一的URL构建工具
 *
 * 解决项目中URL构建逻辑分散、硬编码等问题
 * 提供统一、可靠的URL构建函数，支持客户端和服务器端环境
 */

/**
 * 服务器配置接口
 */
export interface ServerConfig {
  /** 主机名 */
  hostname: string;
  /** 端口号，可能为空 */
  port: string | null;
  /** HTTP协议 */
  protocol: "http" | "https";
  /** WebSocket协议 */
  wsProtocol: "ws" | "wss";
  /** 是否为客户端环境 */
  isClient: boolean;
}

/**
 * 获取当前环境的服务器配置
 * @returns ServerConfig 服务器配置对象
 */
export function getServerConfig(): ServerConfig {
  if (typeof window !== "undefined") {
    // 客户端环境：从浏览器location获取信息
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const hostname = window.location.hostname;
    const port = window.location.port || null;

    return {
      hostname,
      port,
      protocol,
      wsProtocol,
      isClient: true,
    };
  } else {
    // 服务器端环境：从环境变量获取信息
    const port = process.env.PORT || "25090";
    const hostname = "localhost";
    const protocol = "http"; // 服务器端默认使用http
    const wsProtocol = "ws"; // 服务器端默认使用ws

    return {
      hostname,
      port,
      protocol,
      wsProtocol,
      isClient: false,
    };
  }
}

/**
 * 构建WebSocket URL
 * @param path WebSocket路径，默认为 '/trpc-ws'
 * @returns 完整的WebSocket URL
 *
 * @example
 * // 客户端：ws://localhost:25090/trpc-ws
 * // 服务器端：ws://localhost:25090/trpc-ws
 */
export function buildWebSocketUrl(path: string = "/trpc-ws"): string {
  const config = getServerConfig();

  // 确保路径以 / 开头
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // 构建URL：只有当port存在时才拼接端口
  const url = config.port
    ? `${config.wsProtocol}://${config.hostname}:${config.port}${cleanPath}`
    : `${config.wsProtocol}://${config.hostname}${cleanPath}`;

  // 调试日志
  if (config.isClient) {
    console.log("🔌 [url-builder] 客户端 WebSocket URL:", url, {
      hostname: config.hostname,
      port: config.port || "(empty)",
      protocol: config.wsProtocol,
      path: cleanPath,
    });
  }

  return url;
}

/**
 * 构建HTTP URL
 * @param path HTTP路径，默认为 '/api/trpc'
 * @returns 完整的HTTP URL
 *
 * @example
 * // 客户端：http://localhost:25090/api/trpc
 * // 服务器端：http://localhost:25090/api/trpc
 */
export function buildHttpUrl(path: string = "/api/trpc"): string {
  const config = getServerConfig();

  // 确保路径以 / 开头
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // 构建URL：只有当port存在时才拼接端口
  const url = config.port
    ? `${config.protocol}://${config.hostname}:${config.port}${cleanPath}`
    : `${config.protocol}://${config.hostname}${cleanPath}`;

  return url;
}

/**
 * 构建基础URL（不包含路径）
 * @returns 基础URL字符串
 *
 * @example
 * // 客户端：http://localhost:25090
 * // 服务器端：http://localhost:25090
 */
export function buildBaseUrl(): string {
  const config = getServerConfig();

  // 构建基础URL：只有当port存在时才拼接端口
  return config.port
    ? `${config.protocol}://${config.hostname}:${config.port}`
    : `${config.protocol}://${config.hostname}`;
}

/**
 * 为兼容现有代码提供的函数
 * 与TRPCProvider中原有的getWsUrl()函数保持一致
 * @deprecated 建议使用 buildWebSocketUrl() 替代
 */
export function getWsUrl(): string {
  return buildWebSocketUrl("/trpc-ws");
}

/**
 * 为兼容现有代码提供的函数
 * 与TRPCProvider中原有的getBaseUrl()函数保持一致
 * @deprecated 建议使用 buildBaseUrl() 替代
 */
export function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return buildBaseUrl();
}

/**
 * 构建用于模拟请求的URL
 * 主要用于服务器端创建模拟Request对象
 * @param path 路径，默认为 '/api/trpc'
 * @returns 完整的URL字符串
 */
export function buildMockRequestUrl(path: string = "/api/trpc"): string {
  const config = getServerConfig();

  // 确保路径以 / 开头
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // 对于模拟请求，总是使用完整的URL格式
  const url = config.port
    ? `${config.wsProtocol.replace("ws", "http")}://${config.hostname}:${config.port}${cleanPath}`
    : `${config.wsProtocol.replace("ws", "http")}://${config.hostname}${cleanPath}`;

  return url;
}
