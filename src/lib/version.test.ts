import { describe, expect, it } from 'bun:test';
import { formatVersionInfo, getVersionInfo } from './version';

describe('Version Info', () => {
  it('should get version info', () => {
    const versionInfo = getVersionInfo();

    expect(versionInfo).toBeDefined();
    expect(versionInfo.version).toBeDefined();
    expect(versionInfo.buildDate).toBeDefined();
    expect(versionInfo.commitHash).toBeDefined();
    expect(versionInfo.commitShortHash).toBeDefined();
    expect(versionInfo.repositoryUrl).toBeDefined();
    expect(versionInfo.commitUrl).toBeDefined();

    // 版本号格式应该是 YYYYMMDD-shortHash、YYYYMMDD-dev，可能带有 -draft 后缀
    expect(versionInfo.version).toMatch(/^\d{8}-([\da-f]+|dev)(-draft)?$/);
  });

  it('should format version info correctly', () => {
    const mockVersionInfo = {
      version: '20250726-abc123',
      buildDate: '20250726',
      commitHash: 'abc123def456',
      commitShortHash: 'abc123',
      repositoryUrl: 'https://git.ivanli.cc/Ivan/blog-astrowind',
      commitUrl: 'https://git.ivanli.cc/Ivan/blog-astrowind/commit/abc123def456',
    };

    const formatted = formatVersionInfo(mockVersionInfo);

    expect(formatted.displayVersion).toBe('20250726-abc123');
    expect(formatted.displayDate).toBe('2025-07-26');
    expect(formatted.commitLink.text).toBe('abc123');
    expect(formatted.commitLink.url).toBe('https://git.ivanli.cc/Ivan/blog-astrowind/commit/abc123def456');
    expect(formatted.repositoryLink.text).toBe('查看仓库');
    expect(formatted.repositoryLink.url).toBe('https://git.ivanli.cc/Ivan/blog-astrowind');
  });

  it('should format build date correctly', () => {
    const mockVersionInfo = {
      version: '20251231-xyz789',
      buildDate: '20251231',
      commitHash: 'xyz789',
      commitShortHash: 'xyz789',
      repositoryUrl: 'https://example.com',
      commitUrl: 'https://example.com/commit/xyz789',
    };

    const formatted = formatVersionInfo(mockVersionInfo);
    expect(formatted.displayDate).toBe('2025-12-31');
  });

  it('should handle draft versions correctly', () => {
    const mockVersionInfo = {
      version: '20250726-abc123-draft',
      buildDate: '20250726',
      commitHash: 'abc123def456',
      commitShortHash: 'abc123',
      repositoryUrl: 'https://git.ivanli.cc/Ivan/blog-astrowind',
      commitUrl: 'https://git.ivanli.cc/Ivan/blog-astrowind/commit/abc123def456',
    };

    const formatted = formatVersionInfo(mockVersionInfo);

    expect(formatted.displayVersion).toBe('20250726-abc123-draft');
    expect(formatted.commitLink.text).toBe('abc123');
    expect(formatted.commitLink.url).toBe('https://git.ivanli.cc/Ivan/blog-astrowind/commit/abc123def456');
  });
});
