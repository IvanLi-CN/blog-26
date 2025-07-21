import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  forbiddenResponse,
  getUserFromCookies,
  isAdmin,
  isAdminFromCookies,
  isAdminFromHeaders,
  isAdminFromRequest,
  redirectToAdminLogin,
  redirectToLogin,
} from '../../src/lib/auth';
import { signJwt } from '../../src/lib/jwt';

// Import setup
import '../setup';

// Mock AstroCookies
const createMockCookies = (cookies: Record<string, string> = {}) => ({
  get: (name: string) => {
    const value = cookies[name];
    return value ? { value } : undefined;
  },
  set: mock(() => {}),
  delete: mock(() => {}),
  has: (name: string) => name in cookies,
});

describe('auth', () => {
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

  describe('getUserFromCookies', () => {
    it('should return null when no token cookie', async () => {
      const cookies = createMockCookies();
      const result = await getUserFromCookies(cookies as any);
      expect(result).toBeNull();
    });

    it('should return null when token is empty', async () => {
      const cookies = createMockCookies({ token: '' });
      const result = await getUserFromCookies(cookies as any);
      expect(result).toBeNull();
    });

    it('should return user info from valid token', async () => {
      const token = await signJwt({
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      });

      const cookies = createMockCookies({ token });
      const result = await getUserFromCookies(cookies as any);

      expect(result).toEqual({
        id: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      });
    });

    it('should return null for invalid token', async () => {
      const cookies = createMockCookies({ token: 'invalid-token' });
      const result = await getUserFromCookies(cookies as any);
      expect(result).toBeNull();
    });

    it('should return null for token with missing fields', async () => {
      const token = await signJwt({
        sub: 'user123',
        // missing nickname and email
      });

      const cookies = createMockCookies({ token });
      const result = await getUserFromCookies(cookies as any);
      expect(result).toBeNull();
    });
  });

  describe('isAdmin', () => {
    it('should return true for admin email', () => {
      const result = isAdmin('admin@test.com');
      expect(result).toBe(true);
    });

    it('should return false for non-admin email', () => {
      const result = isAdmin('user@test.com');
      expect(result).toBe(false);
    });

    it('should return false when admin email is not configured', () => {
      const originalAdminEmail = process.env.ADMIN_EMAIL;
      delete process.env.ADMIN_EMAIL;

      const result = isAdmin('admin@test.com');
      expect(result).toBe(false);

      // Restore
      if (originalAdminEmail) {
        process.env.ADMIN_EMAIL = originalAdminEmail;
      }
    });

    it('should handle configuration errors gracefully', () => {
      // This simulates a configuration error during prerender
      const originalAdminEmail = process.env.ADMIN_EMAIL;
      delete process.env.ADMIN_EMAIL;

      const result = isAdmin('admin@test.com');
      expect(result).toBe(false);

      process.env.ADMIN_EMAIL = originalAdminEmail;
    });
  });

  describe('isAdminFromHeaders', () => {
    it('should return true for admin email in headers', () => {
      const headers = new Headers({
        'Remote-Email': 'admin@test.com',
      });

      const result = isAdminFromHeaders(headers);
      expect(result).toBe(true);
    });

    it('should return false for non-admin email in headers', () => {
      const headers = new Headers({
        'Remote-Email': 'user@test.com',
      });

      const result = isAdminFromHeaders(headers);
      expect(result).toBe(false);
    });

    it('should return false when no Remote-Email header', () => {
      const headers = new Headers();
      const result = isAdminFromHeaders(headers);
      expect(result).toBe(false);
    });

    it('should return false when admin email is not configured', () => {
      const originalAdminEmail = process.env.ADMIN_EMAIL;
      delete process.env.ADMIN_EMAIL;

      const headers = new Headers({
        'Remote-Email': 'admin@test.com',
      });

      const result = isAdminFromHeaders(headers);
      expect(result).toBe(false);

      // Restore
      if (originalAdminEmail) {
        process.env.ADMIN_EMAIL = originalAdminEmail;
      }
    });
  });

  describe('isAdminFromCookies', () => {
    it('should return true for admin user in cookies', async () => {
      const token = await signJwt({
        sub: 'admin123',
        nickname: 'admin',
        email: 'admin@test.com',
      });

      const cookies = createMockCookies({ token });
      const result = await isAdminFromCookies(cookies as any);
      expect(result).toBe(true);
    });

    it('should return false for non-admin user in cookies', async () => {
      const token = await signJwt({
        sub: 'user123',
        nickname: 'user',
        email: 'user@test.com',
      });

      const cookies = createMockCookies({ token });
      const result = await isAdminFromCookies(cookies as any);
      expect(result).toBe(false);
    });

    it('should return false when no user in cookies', async () => {
      const cookies = createMockCookies();
      const result = await isAdminFromCookies(cookies as any);
      expect(result).toBe(false);
    });
  });

  describe('isAdminFromRequest', () => {
    it('should return true for admin via headers', async () => {
      const cookies = createMockCookies();
      const headers = new Headers({
        'Remote-Email': 'admin@test.com',
      });

      const result = await isAdminFromRequest(cookies as any, headers);
      expect(result).toBe(true);
    });

    it('should return true for admin via cookies', async () => {
      const token = await signJwt({
        sub: 'admin123',
        nickname: 'admin',
        email: 'admin@test.com',
      });

      const cookies = createMockCookies({ token });
      const headers = new Headers();

      const result = await isAdminFromRequest(cookies as any, headers);
      expect(result).toBe(true);
    });

    it('should return false for non-admin user', async () => {
      const token = await signJwt({
        sub: 'user123',
        nickname: 'user',
        email: 'user@test.com',
      });

      const cookies = createMockCookies({ token });
      const headers = new Headers();

      const result = await isAdminFromRequest(cookies as any, headers);
      expect(result).toBe(false);
    });

    it('should return false for unauthenticated request', async () => {
      const cookies = createMockCookies();
      const headers = new Headers();

      const result = await isAdminFromRequest(cookies as any, headers);
      expect(result).toBe(false);
    });
  });

  describe('response helpers', () => {
    it('should create admin login redirect response', () => {
      const response = redirectToAdminLogin();

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/admin/login');
    });

    it('should create login redirect response', () => {
      const response = redirectToLogin();

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/?login=required');
    });

    it('should create forbidden response', () => {
      const response = forbiddenResponse();

      expect(response.status).toBe(403);
    });
  });
});
