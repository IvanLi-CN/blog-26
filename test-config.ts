#!/usr/bin/env bun

// 测试配置模块的脚本
import { config, getConfig } from './src/lib/config';

console.log('🔍 Testing configuration module...\n');

try {
  // 测试配置加载
  getConfig();

  console.log('✅ Configuration validation passed!');
  console.log('\n📋 Configuration summary:');
  console.log(`   Database: ${config.database.path}`);
  console.log(`   Site URL: ${config.site.url}`);
  console.log(`   SMTP Host: ${config.smtp.host}`);
  console.log(`   Admin Email: ${config.admin.email}`);
  console.log(`   Environment: ${config.env.nodeEnv}`);
  console.log(`   Captcha configured: ${config.captcha.secretKey ? 'Yes' : 'No'}`);
  console.log(`   JWT Secret length: ${config.jwt.secret.length} characters`);

  console.log('\n🔧 All configuration sections:');
  console.log('   ✅ Database configuration');
  console.log('   ✅ OpenAI configuration');
  console.log('   ✅ Redis configuration');
  console.log('   ✅ SMTP configuration');
  console.log('   ✅ Admin configuration');
  console.log('   ✅ Captcha configuration');
  console.log('   ✅ JWT configuration');
  console.log('   ✅ Site configuration');

  process.exit(0);
} catch (error) {
  console.error('❌ Configuration validation failed:');
  console.error(error.message);

  console.log('\n🔧 Common solutions:');
  console.log('   1. Check your .env file exists and contains all required variables');
  console.log('   2. Ensure Docker Compose environment section is properly configured');
  console.log('   3. Verify all required environment variables are set');
  console.log('   4. Check environment variable formats (URLs, emails, numbers)');

  process.exit(1);
}
