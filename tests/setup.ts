/**
 * 测试环境设置
 */

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only-32-chars';
process.env.DB_PATH = ':memory:';

// Mock console.warn to avoid noise in tests
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
  // Only show warnings that are not from our auth logic
  if (!args[0]?.includes?.('Invalid JWT token')) {
    originalWarn(...args);
  }
};
