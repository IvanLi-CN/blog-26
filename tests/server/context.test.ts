import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { signJwt } from '../../src/lib/jwt';
import { createContext } from '../../src/server/context';

// Import setup
import '../setup';

// Mock initializeDB
mock.module('../../src/lib/db', () => ({
  initializeDB: mock(() => Promise.resolve()),
}));

describe('tRPC context', () => {
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

  describe('createContext', () => {
    it('should create context with no user for empty request', async () => {
      const req = new Request('http://localhost');
      const resHeaders = new Headers();

      const context = await createContext({ req, resHeaders });

      expect(context.user).toBeUndefined();
      expect(context.isAdmin).toBe(false);
      expect(context.req).toBe(req);
      expect(context.resHeaders).toBe(resHeaders);
      expect(context.clientAddress).toBe('unknown');
    });

    it('should create context with user from JWT token', async () => {
      const token = await signJwt({
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      });

      const req = new Request('http://localhost', {
        headers: {
          cookie: `token=${token}`,
        },
      });
      const resHeaders = new Headers();

      const context = await createContext({ req, resHeaders });

      expect(context.user).toEqual({
        id: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
        avatarUrl: undefined,
      });
      expect(context.isAdmin).toBe(false);
    });

    it('should create context with admin from Remote-Email header', async () => {
      const req = new Request('http://localhost', {
        headers: {
          'Remote-Email': 'admin@test.com',
        },
      });
      const resHeaders = new Headers();

      const context = await createContext({ req, resHeaders });

      expect(context.user).toEqual({
        id: 'admin-header-user',
        nickname: 'Admin',
        email: 'admin@test.com',
      });
      expect(context.isAdmin).toBe(true);
    });

    it('should extract client address from headers', async () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '192.168.1.100',
        },
      });
      const resHeaders = new Headers();

      const context = await createContext({ req, resHeaders });

      expect(context.clientAddress).toBe('192.168.1.100');
    });

    it('should prioritize x-forwarded-for over other IP headers', async () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '192.168.1.100',
          'x-real-ip': '192.168.1.200',
          'cf-connecting-ip': '192.168.1.300',
        },
      });
      const resHeaders = new Headers();

      const context = await createContext({ req, resHeaders });

      expect(context.clientAddress).toBe('192.168.1.100');
    });

    it('should use x-real-ip when x-forwarded-for is not available', async () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-real-ip': '192.168.1.200',
          'cf-connecting-ip': '192.168.1.300',
        },
      });
      const resHeaders = new Headers();

      const context = await createContext({ req, resHeaders });

      expect(context.clientAddress).toBe('192.168.1.200');
    });

    it('should use cf-connecting-ip when other IP headers are not available', async () => {
      const req = new Request('http://localhost', {
        headers: {
          'cf-connecting-ip': '192.168.1.300',
        },
      });
      const resHeaders = new Headers();

      const context = await createContext({ req, resHeaders });

      expect(context.clientAddress).toBe('192.168.1.300');
    });

    it('should handle admin mode in development', async () => {
      process.env.ADMIN_MODE = 'true';

      const req = new Request('http://localhost');
      const resHeaders = new Headers();

      const context = await createContext({ req, resHeaders });

      expect(context.user).toEqual({
        id: 'admin-header-user',
        nickname: 'Admin',
        email: 'admin@test.com',
      });
      expect(context.isAdmin).toBe(true);
    });

    it('should combine JWT user with admin status from headers', async () => {
      const token = await signJwt({
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      });

      const req = new Request('http://localhost', {
        headers: {
          cookie: `token=${token}`,
          'Remote-Email': 'admin@test.com',
        },
      });
      const resHeaders = new Headers();

      const context = await createContext({ req, resHeaders });

      expect(context.user).toEqual({
        id: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
        avatarUrl: undefined,
      });
      expect(context.isAdmin).toBe(true);
    });
  });
});
