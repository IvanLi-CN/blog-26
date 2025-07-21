import { describe, expect, it } from 'bun:test';

describe('CI Environment Debug', () => {
  it('should have correct environment variables', () => {
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
    console.log('ADMIN_EMAIL:', process.env.ADMIN_EMAIL);
    console.log('DB_PATH:', process.env.DB_PATH);

    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.ADMIN_EMAIL).toBeDefined();
    expect(process.env.DB_PATH).toBeDefined();
  });

  it('should be able to import JWT functions', async () => {
    const { signJwt, verifyJwt } = await import('../src/lib/jwt');

    expect(typeof signJwt).toBe('function');
    expect(typeof verifyJwt).toBe('function');
  });

  it('should be able to create and verify JWT', async () => {
    const { signJwt, verifyJwt } = await import('../src/lib/jwt');

    const payload = { sub: 'test', email: 'test@example.com' };
    const token = await signJwt(payload);

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = await verifyJwt(token);
    expect(verified.sub).toBe('test');
    expect(verified.email).toBe('test@example.com');
  });
});
