import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { extractAuthFromRequest } from '../../src/lib/auth-utils';
import { signJwt } from '../../src/lib/jwt';
import { createContext } from '../../src/server/context';

// Import setup
import '../setup';

// Mock initializeDB
mock.module('../../src/lib/db', () => ({
  initializeDB: mock(() => Promise.resolve()),
}));

describe('Authentication Flow Integration', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      ADMIN_MODE: process.env.ADMIN_MODE,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    };

    // Set test environment
    process.env.ADMIN_EMAIL = 'admin@test.com';
    delete process.env.ADMIN_MODE;
  });

  afterEach(() => {
    // Restore original environment
    Object.assign(process.env, originalEnv);
  });

  describe('Complete authentication scenarios', () => {
    it('should handle unauthenticated user flow', async () => {
      const request = new Request('http://localhost');

      // Test auth-utils
      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toBeUndefined();
      expect(authResult.isAdmin).toBe(false);

      // Test tRPC context
      const context = await createContext({
        req: request,
        resHeaders: new Headers(),
      });
      expect(context.user).toBeUndefined();
      expect(context.isAdmin).toBe(false);
    });

    it('should handle regular user authentication flow', async () => {
      const token = await signJwt({
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      });

      const request = new Request('http://localhost', {
        headers: {
          cookie: `token=${token}`,
        },
      });

      // Test auth-utils
      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toEqual({
        id: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
        avatarUrl: undefined,
      });
      expect(authResult.isAdmin).toBe(false);

      // Test tRPC context
      const context = await createContext({
        req: request,
        resHeaders: new Headers(),
      });
      expect(context.user).toEqual(authResult.user);
      expect(context.isAdmin).toBe(false);
    });

    it('should handle admin user via JWT flow', async () => {
      const token = await signJwt({
        sub: 'admin123',
        nickname: 'admin',
        email: 'admin@test.com',
      });

      const request = new Request('http://localhost', {
        headers: {
          cookie: `token=${token}`,
        },
      });

      // Test auth-utils
      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toEqual({
        id: 'admin123',
        nickname: 'admin',
        email: 'admin@test.com',
        avatarUrl: undefined,
      });
      expect(authResult.isAdmin).toBe(true);

      // Test tRPC context
      const context = await createContext({
        req: request,
        resHeaders: new Headers(),
      });
      expect(context.user).toEqual(authResult.user);
      expect(context.isAdmin).toBe(true);
    });

    it('should handle admin user via header flow', async () => {
      const request = new Request('http://localhost', {
        headers: {
          'Remote-Email': 'admin@test.com',
        },
      });

      // Test auth-utils
      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toEqual({
        id: 'admin-header-user',
        nickname: 'Admin',
        email: 'admin@test.com',
      });
      expect(authResult.isAdmin).toBe(true);

      // Test tRPC context
      const context = await createContext({
        req: request,
        resHeaders: new Headers(),
      });
      expect(context.user).toEqual(authResult.user);
      expect(context.isAdmin).toBe(true);
    });

    it('should handle JWT user with admin header override', async () => {
      const token = await signJwt({
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      });

      const request = new Request('http://localhost', {
        headers: {
          cookie: `token=${token}`,
          'Remote-Email': 'admin@test.com',
        },
      });

      // Test auth-utils
      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toEqual({
        id: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
        avatarUrl: undefined,
      });
      expect(authResult.isAdmin).toBe(true); // Admin status from header

      // Test tRPC context
      const context = await createContext({
        req: request,
        resHeaders: new Headers(),
      });
      expect(context.user).toEqual(authResult.user);
      expect(context.isAdmin).toBe(true);
    });

    it('should handle development mode flow', async () => {
      process.env.ADMIN_MODE = 'true';

      const request = new Request('http://localhost');

      // Test auth-utils
      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toEqual({
        id: 'admin-header-user',
        nickname: 'Admin',
        email: 'admin@test.com',
      });
      expect(authResult.isAdmin).toBe(true);

      // Test tRPC context
      const context = await createContext({
        req: request,
        resHeaders: new Headers(),
      });
      expect(context.user).toEqual(authResult.user);
      expect(context.isAdmin).toBe(true);
    });

    it('should handle invalid JWT token gracefully', async () => {
      const request = new Request('http://localhost', {
        headers: {
          cookie: 'token=invalid-jwt-token',
        },
      });

      // Test auth-utils
      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toBeUndefined();
      expect(authResult.isAdmin).toBe(false);

      // Test tRPC context
      const context = await createContext({
        req: request,
        resHeaders: new Headers(),
      });
      expect(context.user).toBeUndefined();
      expect(context.isAdmin).toBe(false);
    });

    it('should handle wrong admin email in header', async () => {
      const request = new Request('http://localhost', {
        headers: {
          'Remote-Email': 'wrong@test.com',
        },
      });

      // Test auth-utils
      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toBeUndefined();
      expect(authResult.isAdmin).toBe(false);

      // Test tRPC context
      const context = await createContext({
        req: request,
        resHeaders: new Headers(),
      });
      expect(context.user).toBeUndefined();
      expect(context.isAdmin).toBe(false);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle missing admin email configuration', async () => {
      delete process.env.ADMIN_EMAIL;

      const request = new Request('http://localhost', {
        headers: {
          'Remote-Email': 'admin@test.com',
        },
      });

      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toBeUndefined();
      expect(authResult.isAdmin).toBe(false);
    });

    it('should handle malformed cookie header', async () => {
      const request = new Request('http://localhost', {
        headers: {
          cookie: 'malformed-cookie-without-equals',
        },
      });

      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toBeUndefined();
      expect(authResult.isAdmin).toBe(false);
    });

    it('should handle empty cookie values', async () => {
      const request = new Request('http://localhost', {
        headers: {
          cookie: 'token=; other=value',
        },
      });

      const authResult = await extractAuthFromRequest(request);
      expect(authResult.user).toBeUndefined();
      expect(authResult.isAdmin).toBe(false);
    });
  });
});
