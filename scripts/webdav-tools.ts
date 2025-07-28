#!/usr/bin/env bun

/**
 * WebDAV 工具脚本
 * 合并了原来的 list-webdav-files.ts、get-webdav-file.ts
 * 提供统一的 WebDAV 文件管理和调试功能
 */

import { getWebDAVClient, isWebDAVEnabled } from '../src/lib/webdav';

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 列出 WebDAV 文件
async function listWebDAVFiles(path: string = '', showDetails: boolean = false): Promise<void> {
  if (!isWebDAVEnabled()) {
    console.error('❌ WebDAV 未启用，请检查配置');
    process.exit(1);
  }

  try {
    const webdavClient = getWebDAVClient();

    console.log(`📁 列出 WebDAV 目录: ${path || '/'}`);
    console.log('=' * 50);

    // 使用 propfind 方法获取文件列表
    // 确保路径以 / 开头
    const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : '/';
    const files = await (webdavClient as any).propfind(normalizedPath, 1);

    if (files.length === 0) {
      console.log('📭 目录为空');
      return;
    }

    // 按类型和名称排序
    files.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.filename.localeCompare(b.filename);
    });

    for (const file of files) {
      const icon = file.type === 'directory' ? '📁' : '📄';
      const size = file.type === 'file' ? ` (${formatFileSize(file.size)})` : '';

      if (showDetails) {
        console.log(`${icon} ${file.filename}${size}`);
        if (file.type === 'file') {
          console.log(`   📅 修改时间: ${file.lastmod || 'N/A'}`);
          console.log(`   📏 大小: ${file.size || 0} 字节`);
          console.log(`   🔗 路径: ${file.filename}`);
        }
        console.log('');
      } else {
        console.log(`${icon} ${file.filename}${size}`);
      }
    }

    console.log(`\n📊 总计: ${files.length} 个项目`);
  } catch (error) {
    console.error('❌ 列出文件失败:', error);
    process.exit(1);
  }
}

// 获取 WebDAV 文件内容
async function getFileContent(filePath: string, showMetadata: boolean = false): Promise<void> {
  if (!isWebDAVEnabled()) {
    console.error('❌ WebDAV 未启用，请检查配置');
    process.exit(1);
  }

  try {
    const webdavClient = getWebDAVClient();

    console.log(`📄 获取文件内容: ${filePath}`);
    console.log('=' * 50);

    if (showMetadata) {
      // 获取文件元数据
      try {
        const stat = await webdavClient.stat(filePath);
        console.log('📋 文件信息:');
        console.log(`   📁 文件名: ${stat.basename}`);
        console.log(`   📏 大小: ${formatFileSize(stat.size)}`);
        console.log(`   📅 修改时间: ${stat.lastmod}`);
        console.log(`   📂 类型: ${stat.type}`);
        console.log('');
      } catch (metaError) {
        console.warn('⚠️ 无法获取文件元数据:', metaError.message);
      }
    }

    const content = await webdavClient.getFileContent(filePath);
    console.log('📄 文件内容:');
    console.log('-' * 50);
    console.log(content);
  } catch (error) {
    console.error('❌ 获取文件失败:', error);
    process.exit(1);
  }
}

// 搜索 WebDAV 文件
async function searchFiles(searchTerm: string, basePath: string = '', caseSensitive: boolean = false): Promise<void> {
  if (!isWebDAVEnabled()) {
    console.error('❌ WebDAV 未启用，请检查配置');
    process.exit(1);
  }

  try {
    const webdavClient = getWebDAVClient();

    console.log(`🔍 搜索文件: "${searchTerm}" (路径: ${basePath || '/'})`);
    console.log('=' * 50);

    const normalizedPath = basePath ? (basePath.startsWith('/') ? basePath : `/${basePath}`) : '/';
    const files = await (webdavClient as any).propfind(normalizedPath, Infinity); // 递归搜索

    const searchPattern = caseSensitive ? searchTerm : searchTerm.toLowerCase();
    const matchedFiles = files.filter((file: any) => {
      const fileName = caseSensitive ? file.filename : file.filename.toLowerCase();
      return fileName.includes(searchPattern);
    });

    if (matchedFiles.length === 0) {
      console.log('🚫 没有找到匹配的文件');
      return;
    }

    console.log(`✅ 找到 ${matchedFiles.length} 个匹配的文件:`);
    console.log('');

    for (const file of matchedFiles) {
      const icon = file.type === 'directory' ? '📁' : '📄';
      const size = file.type === 'file' ? ` (${formatFileSize(file.size)})` : '';
      console.log(`${icon} ${file.filename}${size}`);
    }
  } catch (error) {
    console.error('❌ 搜索失败:', error);
    process.exit(1);
  }
}

// 检查 WebDAV 连接
async function checkConnection(): Promise<void> {
  console.log('🔍 检查 WebDAV 连接...');
  console.log('=' * 50);

  if (!isWebDAVEnabled()) {
    console.error('❌ WebDAV 未启用，请检查配置');
    console.log('');
    console.log('💡 请确保设置了以下环境变量:');
    console.log('   - WEBDAV_URL');
    console.log('   - WEBDAV_USERNAME (可选，用于需要认证的服务器)');
    console.log('   - WEBDAV_PASSWORD (可选，用于需要认证的服务器)');
    return;
  }

  try {
    const webdavClient = getWebDAVClient();

    // 测试连接
    console.log('🔗 测试连接...');
    const rootFiles = await (webdavClient as any).propfind('/', 1);

    console.log('✅ WebDAV 连接成功！');
    console.log(`📁 根目录包含 ${rootFiles.length} 个项目`);

    // 显示根目录的前几个项目
    if (rootFiles.length > 0) {
      console.log('\n📋 根目录内容 (前 5 个):');
      const preview = rootFiles.slice(0, 5);
      for (const file of preview) {
        const icon = file.type === 'directory' ? '📁' : '📄';
        console.log(`   ${icon} ${file.filename}`);
      }

      if (rootFiles.length > 5) {
        console.log(`   ... 还有 ${rootFiles.length - 5} 个项目`);
      }
    }
  } catch (error) {
    console.error('❌ WebDAV 连接失败:', error);
    console.log('');
    console.log('💡 可能的原因:');
    console.log('   - URL 不正确');
    console.log('   - 用户名或密码错误');
    console.log('   - 网络连接问题');
    console.log('   - WebDAV 服务器不可用');
  }
}

// 打印帮助信息
function printHelp(): void {
  console.log(`
WebDAV 工具脚本

用法:
  bun run scripts/webdav-tools.ts [命令] [参数] [选项]

命令:
  list [路径]                    列出指定路径的文件和目录（默认）
  get <文件路径>                 获取文件内容
  search <搜索词> [基础路径]      搜索文件名
  check                         检查 WebDAV 连接

选项:
  --details, -d                 显示详细信息（用于 list 命令）
  --metadata, -m                显示文件元数据（用于 get 命令）
  --case-sensitive, -c          区分大小写搜索（用于 search 命令）
  --help, -h                    显示此帮助信息

示例:
  bun run scripts/webdav-tools.ts                              # 列出根目录
  bun run scripts/webdav-tools.ts list Project                 # 列出 Project 目录
  bun run scripts/webdav-tools.ts list Project --details       # 列出 Project 目录（详细信息）
  bun run scripts/webdav-tools.ts get "Project/文件.md"         # 获取文件内容
  bun run scripts/webdav-tools.ts get "Project/文件.md" -m      # 获取文件内容和元数据
  bun run scripts/webdav-tools.ts search "ATX" Project         # 在 Project 目录搜索包含 ATX 的文件
  bun run scripts/webdav-tools.ts search "ATX" Project -c      # 区分大小写搜索
  bun run scripts/webdav-tools.ts check                        # 检查连接

环境变量:
  WEBDAV_URL                    WebDAV 服务器地址
  WEBDAV_USERNAME               WebDAV 用户名
  WEBDAV_PASSWORD               WebDAV 密码
`);
}

// 主函数
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const command = args[0] || 'list';
  const hasDetails = args.includes('--details') || args.includes('-d');
  const hasMetadata = args.includes('--metadata') || args.includes('-m');
  const caseSensitive = args.includes('--case-sensitive') || args.includes('-c');

  // 过滤掉选项参数
  const cleanArgs = args.filter((arg) => !arg.startsWith('--') && !arg.startsWith('-'));

  switch (command) {
    case 'list':
      const listPath = cleanArgs[1] || '';
      await listWebDAVFiles(listPath, hasDetails);
      break;

    case 'get':
      if (cleanArgs.length < 2) {
        console.error('❌ 请指定文件路径');
        console.log('用法: bun run scripts/webdav-tools.ts get <文件路径>');
        process.exit(1);
      }
      await getFileContent(cleanArgs[1], hasMetadata);
      break;

    case 'search':
      if (cleanArgs.length < 2) {
        console.error('❌ 请指定搜索词');
        console.log('用法: bun run scripts/webdav-tools.ts search <搜索词> [基础路径]');
        process.exit(1);
      }
      const searchTerm = cleanArgs[1];
      const searchPath = cleanArgs[2] || '';
      await searchFiles(searchTerm, searchPath, caseSensitive);
      break;

    case 'check':
      await checkConnection();
      break;

    default:
      console.error(`❌ 未知命令: ${command}`);
      console.log('使用 --help 查看可用命令');
      process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  });
}
