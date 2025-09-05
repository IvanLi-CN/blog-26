/**
 * URL构建工具测试
 * 验证在不同环境下URL构建的正确性
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  buildBaseUrl,
  buildHttpUrl,
  buildMockRequestUrl,
  buildWebSocketUrl,
  getServerConfig,
} from "../url-builder";

// 模拟浏览器环境
const mockWindow = {
  location: {
    protocol: "http:",
    hostname: "localhost",
    port: "3000",
  },
};

describe("URL Builder", () => {
  let originalWindow: any;
  let originalProcess: any;

  beforeEach(() => {
    // 保存原始环境
    originalWindow = (global as any).window;
    originalProcess = process.env;
  });

  afterEach(() => {
    // 恢复原始环境
    (global as any).window = originalWindow;
    process.env = originalProcess;
  });

  describe("客户端环境", () => {
    beforeEach(() => {
      // 模拟浏览器环境
      (global as any).window = mockWindow;
    });

    it("应该正确构建WebSocket URL（有端口）", () => {
      const url = buildWebSocketUrl("/trpc-ws");
      expect(url).toBe("ws://localhost:3000/trpc-ws");
    });

    it("应该正确构建WebSocket URL（无端口）", () => {
      (global as any).window = {
        location: {
          protocol: "https:",
          hostname: "example.com",
          port: "", // 端口为空
        },
      };

      const url = buildWebSocketUrl("/trpc-ws");
      expect(url).toBe("wss://example.com/trpc-ws");
    });

    it("应该正确构建HTTP URL", () => {
      const url = buildHttpUrl("/api/trpc");
      expect(url).toBe("http://localhost:3000/api/trpc");
    });

    it("应该正确构建基础URL", () => {
      const url = buildBaseUrl();
      expect(url).toBe("http://localhost:3000");
    });

    it("应该正确处理HTTPS协议", () => {
      (global as any).window = {
        location: {
          protocol: "https:",
          hostname: "example.com",
          port: "443",
        },
      };

      const wsUrl = buildWebSocketUrl("/trpc-ws");
      const httpUrl = buildHttpUrl("/api/trpc");

      expect(wsUrl).toBe("wss://example.com:443/trpc-ws");
      expect(httpUrl).toBe("https://example.com:443/api/trpc");
    });
  });

  describe("服务器端环境", () => {
    beforeEach(() => {
      // 确保没有window对象
      (global as any).window = undefined;
      process.env.PORT = "3000";
    });

    it("应该正确构建WebSocket URL", () => {
      const url = buildWebSocketUrl("/trpc-ws");
      expect(url).toBe("ws://localhost:3000/trpc-ws");
    });

    it("应该正确构建HTTP URL", () => {
      const url = buildHttpUrl("/api/trpc");
      expect(url).toBe("http://localhost:3000/api/trpc");
    });

    it("应该正确构建模拟请求URL", () => {
      const url = buildMockRequestUrl("/api/trpc");
      expect(url).toBe("http://localhost:3000/api/trpc");
    });

    it("应该使用默认端口当环境变量未设置时", () => {
      delete process.env.PORT;

      const url = buildWebSocketUrl("/trpc-ws");
      expect(url).toBe("ws://localhost:3000/trpc-ws");
    });
  });

  describe("getServerConfig", () => {
    it("应该返回正确的客户端配置", () => {
      (global as any).window = mockWindow;

      const config = getServerConfig();
      expect(config).toEqual({
        hostname: "localhost",
        port: "3000",
        protocol: "http",
        wsProtocol: "ws",
        isClient: true,
      });
    });

    it("应该返回正确的服务器端配置", () => {
      (global as any).window = undefined;
      process.env.PORT = "3001";

      const config = getServerConfig();
      expect(config).toEqual({
        hostname: "localhost",
        port: "3001",
        protocol: "http",
        wsProtocol: "ws",
        isClient: false,
      });
    });
  });

  describe("边缘情况", () => {
    it("应该正确处理路径参数", () => {
      (global as any).window = mockWindow;

      // 测试不同的路径格式
      expect(buildWebSocketUrl("trpc-ws")).toBe("ws://localhost:3000/trpc-ws");
      expect(buildWebSocketUrl("/trpc-ws")).toBe("ws://localhost:3000/trpc-ws");
      expect(buildWebSocketUrl("")).toBe("ws://localhost:3000/");
    });

    it("应该使用默认路径", () => {
      (global as any).window = mockWindow;

      expect(buildWebSocketUrl()).toBe("ws://localhost:3000/trpc-ws");
      expect(buildHttpUrl()).toBe("http://localhost:3000/api/trpc");
    });
  });
});
