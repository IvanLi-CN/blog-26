#!/usr/bin/env bun

/**
 * 测试 WebDAV 连接脚本
 * 验证 WebDAV 服务器是否正常工作且无需认证
 */

const WEBDAV_URL = 'http://localhost:8080';

async function testWebDAVConnection() {
  console.log('🔍 测试 WebDAV 连接...\n');

  try {
    // 测试根目录 PROPFIND
    console.log('1. 测试根目录访问...');
    const propfindResponse = await fetch(WEBDAV_URL + '/', {
      method: 'PROPFIND',
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml',
      },
    });

    if (propfindResponse.ok) {
      console.log('✅ 根目录访问成功');
    } else {
      console.log(`❌ 根目录访问失败: ${propfindResponse.status} ${propfindResponse.statusText}`);
      return false;
    }

    // 测试获取文件列表
    console.log('\n2. 测试文件列表获取...');
    const listResponse = await fetch(WEBDAV_URL + '/', {
      method: 'PROPFIND',
      headers: {
        Depth: '1',
      },
    });

    if (listResponse.ok) {
      const xmlContent = await listResponse.text();
      console.log('✅ 文件列表获取成功');

      // 解析XML响应中的文件列表
      const hrefMatches = xmlContent.match(/<D:href>([^<]+)<\/D:href>/g);
      if (hrefMatches) {
        console.log(`📋 发现 ${hrefMatches.length} 个项目:`);
        hrefMatches.slice(0, 10).forEach((match) => {
          const href = match.replace(/<\/?D:href>/g, '');
          console.log(`   📄 ${href}`);
        });
        if (hrefMatches.length > 10) {
          console.log(`   ... 还有 ${hrefMatches.length - 10} 个项目`);
        }
      } else {
        console.log('⚠️ 未找到文件列表');
      }
    } else {
      console.log(`❌ 文件列表获取失败: ${listResponse.status} ${listResponse.statusText}`);
      return false;
    }

    // 测试获取具体文件
    console.log('\n3. 测试文件内容获取...');
    const fileResponse = await fetch(WEBDAV_URL + '/01-typescript-best-practices.md', {
      method: 'GET',
    });

    if (fileResponse.ok) {
      const content = await fileResponse.text();
      console.log('✅ 文件内容获取成功');
      console.log('📄 文件内容预览:', content.slice(0, 100) + '...');
    } else {
      console.log(`❌ 文件内容获取失败: ${fileResponse.status} ${fileResponse.statusText}`);
      return false;
    }

    // 测试 OPTIONS 请求
    console.log('\n4. 测试 OPTIONS 请求...');
    const optionsResponse = await fetch(WEBDAV_URL + '/', {
      method: 'OPTIONS',
    });

    if (optionsResponse.ok) {
      console.log('✅ OPTIONS 请求成功');
      const allowHeader = optionsResponse.headers.get('Allow');
      const davHeader = optionsResponse.headers.get('DAV');
      console.log('🔧 支持的方法:', allowHeader);
      console.log('🔧 DAV 版本:', davHeader);
    } else {
      console.log(`❌ OPTIONS 请求失败: ${optionsResponse.status} ${optionsResponse.statusText}`);
      return false;
    }

    console.log('\n✅ 所有测试通过！WebDAV 服务器工作正常且无需认证。');
    return true;
  } catch (error) {
    console.log(`❌ 连接错误: ${error}`);
    console.log('\n💡 请确保 WebDAV 服务器正在运行:');
    console.log('   bun run webdav:start');
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
WebDAV 连接测试工具

用法:
  bun run test-webdav-connection        测试 WebDAV 连接
  bun run test-webdav-connection --help 显示帮助信息

功能:
  - 测试根目录访问
  - 测试文件列表获取
  - 测试文件内容获取
  - 测试 OPTIONS 请求
  - 验证无认证访问

注意:
  请确保 WebDAV 服务器正在运行 (bun run webdav:start)
`);
    return;
  }

  const success = await testWebDAVConnection();

  if (!success) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
