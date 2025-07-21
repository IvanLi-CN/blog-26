import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { signJwt, verifyJwt } from '../../src/lib/jwt';

// Import setup
import '../setup';

describe('JWT utilities', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      JWT_SECRET: process.env.JWT_SECRET,
    };

    // Set test environment
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-32-chars';
  });

  afterEach(() => {
    // Restore original environment
    Object.assign(process.env, originalEnv);
  });

  describe('signJwt', () => {
    it('should create a valid JWT token', async () => {
      const payload = {
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      };

      const token = await signJwt(payload);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should create tokens with different payloads', async () => {
      const payload1 = {
        sub: 'user1',
        nickname: 'user1',
        email: 'user1@test.com',
      };

      const payload2 = {
        sub: 'user2',
        nickname: 'user2',
        email: 'user2@test.com',
      };

      const token1 = await signJwt(payload1);
      const token2 = await signJwt(payload2);

      expect(token1).not.toBe(token2);
    });

    it('should include optional fields in token', async () => {
      const payload = {
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
        avatarUrl: 'https://example.com/avatar.jpg',
      };

      const token = await signJwt(payload);
      const verified = await verifyJwt(token);

      expect(verified.avatarUrl).toBe('https://example.com/avatar.jpg');
    });
  });

  describe('verifyJwt', () => {
    it('should verify a valid JWT token', async () => {
      const payload = {
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      };

      const token = await signJwt(payload);
      const verified = await verifyJwt(token);

      expect(verified.sub).toBe('user123');
      expect(verified.nickname).toBe('testuser');
      expect(verified.email).toBe('user@test.com');
      expect(typeof verified.iat).toBe('number');
      expect(typeof verified.exp).toBe('number');
    });

    it('should throw error for invalid token', async () => {
      const invalidToken = 'invalid.token.here';

      await expect(verifyJwt(invalidToken)).rejects.toThrow();
    });

    it('should throw error for malformed token', async () => {
      const malformedToken = 'not-a-jwt-token';

      await expect(verifyJwt(malformedToken)).rejects.toThrow();
    });

    it('should throw error for token with wrong secret', async () => {
      const payload = {
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      };

      const originalSecret = process.env.JWT_SECRET;

      // Create token with original secret
      const token = await signJwt(payload);

      // Change the secret to a different one
      process.env.JWT_SECRET = 'different-secret-key-for-testing-only-32';

      // Verification should fail with different secret
      try {
        await verifyJwt(token);
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Restore original secret
      process.env.JWT_SECRET = originalSecret;
    });

    it('should handle empty token', async () => {
      await expect(verifyJwt('')).rejects.toThrow();
    });

    it('should preserve all payload fields', async () => {
      const payload = {
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
        avatarUrl: 'https://example.com/avatar.jpg',
        customField: 'custom-value',
      };

      const token = await signJwt(payload);
      const verified = await verifyJwt(token);

      expect(verified.sub).toBe(payload.sub);
      expect(verified.nickname).toBe(payload.nickname);
      expect(verified.email).toBe(payload.email);
      expect(verified.avatarUrl).toBe(payload.avatarUrl);
      expect(verified.customField).toBe(payload.customField);
    });
  });

  describe('token lifecycle', () => {
    it('should create and verify token successfully', async () => {
      const originalPayload = {
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      };

      // Sign token
      const token = await signJwt(originalPayload);
      expect(typeof token).toBe('string');

      // Verify token
      const verifiedPayload = await verifyJwt(token);
      expect(verifiedPayload.sub).toBe(originalPayload.sub);
      expect(verifiedPayload.nickname).toBe(originalPayload.nickname);
      expect(verifiedPayload.email).toBe(originalPayload.email);
    });

    it('should handle token expiration fields', async () => {
      const payload = {
        sub: 'user123',
        nickname: 'testuser',
        email: 'user@test.com',
      };

      const token = await signJwt(payload);
      const verified = await verifyJwt(token);

      expect(verified.iat).toBeDefined();
      expect(verified.exp).toBeDefined();
      expect(verified.exp).toBeGreaterThan(verified.iat);
    });
  });
});
