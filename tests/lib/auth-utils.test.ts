import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  createForbiddenResponse,
  createUnauthorizedResponse,
  extractAuthFromRequest,
  isAdminRequest,
  isAuthenticatedRequest,
} from '../../src/lib/auth-utils';
import { signJwt } from '../../src/lib/jwt';

// Import setup
import '../setup';

describe('auth-utils', () => {
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

  describe('extractAuthFromRequest', () => {
    it('should return no user and not admin for empty request', async () => {
      const request = new Request('http://localhost');
      const result = await extractAuthFromRequest(request);

      expect(result.user).toBeUndefined();
      expect(result.isAdmin).toBe(false);
    });

    it('should extract user from valid JWT token', async () => {
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

      const result = await extractAuthFromRequest(request);

      expect(result.user).toEqual({
        id: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
        avatarUrl: undefined,
      });
      expect(result.isAdmin).toBe(false);
    });

    it('should handle invalid JWT token gracefully', async () => {
      const request = new Request('http://localhost', {
        headers: {
          cookie: 'token=invalid-token',
        },
      });

      const result = await extractAuthFromRequest(request);

      expect(result.user).toBeUndefined();
      expect(result.isAdmin).toBe(false);
    });

    it('should identify admin from Remote-Email header', async () => {
      const request = new Request('http://localhost', {
        headers: {
          'Remote-Email': 'admin@test.com',
        },
      });

      const result = await extractAuthFromRequest(request);

      expect(result.user).toEqual({
        id: 'admin-header-user',
        nickname: 'Admin',
        email: 'admin@test.com',
      });
      expect(result.isAdmin).toBe(true);
    });

    it('should not identify admin from wrong Remote-Email header', async () => {
      const request = new Request('http://localhost', {
        headers: {
          'Remote-Email': 'wrong@test.com',
        },
      });

      const result = await extractAuthFromRequest(request);

      expect(result.user).toBeUndefined();
      expect(result.isAdmin).toBe(false);
    });

    it('should prioritize JWT user over Remote-Email admin user', async () => {
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

      const result = await extractAuthFromRequest(request);

      expect(result.user).toEqual({
        id: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
        avatarUrl: undefined,
      });
      expect(result.isAdmin).toBe(true);
    });

    it('should handle ADMIN_MODE in development', async () => {
      process.env.ADMIN_MODE = 'true';

      const request = new Request('http://localhost');
      const result = await extractAuthFromRequest(request);

      expect(result.user).toEqual({
        id: 'admin-header-user',
        nickname: 'Admin',
        email: 'admin@test.com',
      });
      expect(result.isAdmin).toBe(true);
    });

    it('should parse complex cookie strings correctly', async () => {
      const token = await signJwt({
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      });

      const request = new Request('http://localhost', {
        headers: {
          cookie: `session=abc123; token=${token}; theme=dark`,
        },
      });

      const result = await extractAuthFromRequest(request);

      expect(result.user).toEqual({
        id: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
        avatarUrl: undefined,
      });
    });

    it('should identify admin from JWT user email', async () => {
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

      const result = await extractAuthFromRequest(request);

      expect(result.user).toEqual({
        id: 'admin123',
        nickname: 'admin',
        email: 'admin@test.com',
        avatarUrl: undefined,
      });
      expect(result.isAdmin).toBe(true);
    });
  });

  describe('isAdminRequest', () => {
    it('should return true for admin request', async () => {
      const request = new Request('http://localhost', {
        headers: {
          'Remote-Email': 'admin@test.com',
        },
      });

      const result = await isAdminRequest(request);
      expect(result).toBe(true);
    });

    it('should return false for non-admin request', async () => {
      const request = new Request('http://localhost');
      const result = await isAdminRequest(request);
      expect(result).toBe(false);
    });
  });

  describe('isAuthenticatedRequest', () => {
    it('should return true for authenticated request', async () => {
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

      const result = await isAuthenticatedRequest(request);
      expect(result).toBe(true);
    });

    it('should return false for unauthenticated request', async () => {
      const request = new Request('http://localhost');
      const result = await isAuthenticatedRequest(request);
      expect(result).toBe(false);
    });
  });

  describe('response helpers', () => {
    it('should create unauthorized response', () => {
      const response = createUnauthorizedResponse();

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should create unauthorized response with custom message', () => {
      const response = createUnauthorizedResponse('Custom message');

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should create forbidden response', () => {
      const response = createForbiddenResponse();

      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should create forbidden response with custom message', () => {
      const response = createForbiddenResponse('Custom forbidden message');

      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });
});
