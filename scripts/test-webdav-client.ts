#!/usr/bin/env bun

/**
 * 测试 WebDAV 客户端脚本
 * 验证修复后的 WebDAV 客户端是否能正常工作
 */

// 设置环境变量
process.env.WEBDAV_URL = 'http://localhost:8080';
process.env.WEBDAV_USERNAME = '';
process.env.WEBDAV_PASSWORD = '';
process.env.WEBDAV_PROJECTS_PATH = '/projects';
process.env.WEBDAV_MEMOS_PATH = '/Memos';
process.env.WEBDAV_EXCLUDE_PATHS = '';

// 其他必需的环境变量
process.env.DB_PATH = './sqlite.db';
process.env.OPENAI_API_KEY = 'test-key';
process.env.SITE_URL = 'http://localhost:4321';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.SMTP_HOST = 'smtp.example.com';
process.env.SMTP_FROM_EMAIL = 'test@example.com';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.PUBLIC_LUOSIMAO_SITE_KEY = 'test-key';
process.env.LUOSIMAO_SECRET_KEY = 'test-key';
process.env.NODE_ENV = 'development';

async function testWebDAVClient() {
  console.log('🔍 测试 WebDAV 客户端...\n');

  try {
    // 动态导入 WebDAV 模块
    const { getWebDAVClient, isWebDAVEnabled } = await import('../src/lib/webdav');

    // 检查 WebDAV 是否启用
    console.log('1. 检查 WebDAV 是否启用...');
    const enabled = isWebDAVEnabled();
    console.log(`   WebDAV 启用状态: ${enabled ? '✅ 已启用' : '❌ 未启用'}`);

    if (!enabled) {
      console.log('❌ WebDAV 未启用，请检查配置');
      return false;
    }

    // 创建 WebDAV 客户端
    console.log('\n2. 创建 WebDAV 客户端...');
    const client = getWebDAVClient();
    console.log('✅ WebDAV 客户端创建成功');

    // 测试获取文件索引
    console.log('\n3. 测试获取文件索引...');
    const fileIndex = await client.getFileIndex(2);
    console.log(`✅ 获取到 ${fileIndex.length} 个文件`);

    // 显示文件列表
    if (fileIndex.length > 0) {
      console.log('\n📋 文件列表:');
      fileIndex.slice(0, 10).forEach((file) => {
        const icon = file.contentType === 'memo' ? '📝' : file.contentType === 'project' ? '🚀' : '📄';
        console.log(`   ${icon} ${file.path} (${file.contentType})`);
      });

      if (fileIndex.length > 10) {
        console.log(`   ... 还有 ${fileIndex.length - 10} 个文件`);
      }
    }

    // 测试获取文章索引
    console.log('\n4. 测试获取文章索引...');
    const postsIndex = await client.getPostsIndex();
    console.log(`✅ 获取到 ${postsIndex.length} 篇文章`);

    // 测试获取项目索引
    console.log('\n5. 测试获取项目索引...');
    const projectsIndex = fileIndex.filter((f) => f.contentType === 'project');
    console.log(`✅ 获取到 ${projectsIndex.length} 个项目`);

    // 测试获取备忘录索引
    console.log('\n6. 测试获取备忘录索引...');
    const memosIndex = fileIndex.filter((f) => f.contentType === 'memo');
    console.log(`✅ 获取到 ${memosIndex.length} 篇备忘录`);

    // 测试获取文件内容
    if (fileIndex.length > 0) {
      const firstFile = fileIndex.find((f) => f.contentType === 'post');
      if (firstFile) {
        console.log('\n7. 测试获取文件内容...');
        const content = await client.getFileContent(firstFile.path);
        console.log(`✅ 获取文件内容成功，长度: ${content.length} 字符`);
        console.log(`📄 内容预览: ${content.slice(0, 100)}...`);
      }
    }

    console.log('\n✅ 所有测试通过！WebDAV 客户端工作正常。');
    return true;
  } catch (error) {
    console.log(`❌ 测试失败: ${error.message}`);
    console.log('\n💡 请确保:');
    console.log('   1. WebDAV 服务器正在运行 (bun run webdav:start)');
    console.log('   2. 测试数据已生成 (bun run test-data:generate)');
    console.log('   3. 环境变量配置正确');
    return false;
  }
}

async function main() {
  const success = await testWebDAVClient();

  if (!success) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
