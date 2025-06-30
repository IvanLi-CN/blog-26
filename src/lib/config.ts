import { z } from 'zod';

// 环境变量 schema 定义
const envSchema = z.object({
  // 数据库配置
  DB_PATH: z.string().default('./sqlite.db'),

  // OpenAI 配置
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  OPENAI_API_BASE_URL: z.string().url().default('https://api.openai.com/v1'),

  // Redis 配置
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  // WebDAV 配置
  WEBdav_URL: z.string().url().optional(),
  WEBdav_USERNAME: z.string().optional(),
  WEBdav_PASSWORD: z.string().optional(),

  // 模型配置
  EMBEDDING_MODEL_NAME: z.string().default('BAAI/bge-m3'),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(1024),
  CHAT_MODEL_NAME: z.string().default('deepseek-v3'),

  // 站点配置
  SITE_URL: z.string().url(),

  // JWT 配置
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),

  // SMTP 配置
  SMTP_HOST: z.string().min(1, 'SMTP host is required'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_NAME: z.string().default('Blog'),
  SMTP_FROM_EMAIL: z.string().email(),

  // 管理员配置
  ADMIN_EMAIL: z.string().email(),

  // 螺丝帽验证码配置
  PUBLIC_LUOSIMAO_SITE_KEY: z.string().min(1, 'Luosimao site key is required'),
  LUOSIMAO_SECRET_KEY: z.string().min(1, 'Luosimao secret key is required'),

  // 环境标识
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
});

// 环境变量类型
export type EnvConfig = z.infer<typeof envSchema>;

// 获取环境变量的函数
function getEnvVars(): Record<string, string | undefined> {
  // 优先使用 process.env（运行时），回退到 import.meta.env（构建时）
  const env: Record<string, string | undefined> = {};

  // 获取所有可能的环境变量键
  const allKeys = Object.keys(envSchema.shape);

  for (const key of allKeys) {
    env[key] = process.env[key] || (import.meta.env as any)[key];
  }

  return env;
}

// 解析和验证环境变量
let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (_config) {
    return _config;
  }

  try {
    const rawEnv = getEnvVars();
    _config = envSchema.parse(rawEnv);
    return _config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('\n');

      throw new Error(`Environment variable validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}

// 重置配置缓存（主要用于测试）
export function resetConfig(): void {
  _config = null;
}

// 便捷的配置访问器
export const config = {
  get database() {
    return {
      path: getConfig().DB_PATH,
    };
  },

  get openai() {
    return {
      apiKey: getConfig().OPENAI_API_KEY,
      baseURL: getConfig().OPENAI_API_BASE_URL,
    };
  },

  get redis() {
    return {
      host: getConfig().REDIS_HOST,
      port: getConfig().REDIS_PORT,
    };
  },

  get webdav() {
    const cfg = getConfig();
    return {
      url: cfg.WEBdav_URL,
      username: cfg.WEBdav_USERNAME,
      password: cfg.WEBdav_PASSWORD,
    };
  },

  get embedding() {
    return {
      modelName: getConfig().EMBEDDING_MODEL_NAME,
      dimension: getConfig().EMBEDDING_DIMENSION,
    };
  },

  get chat() {
    return {
      modelName: getConfig().CHAT_MODEL_NAME,
    };
  },

  get site() {
    return {
      url: getConfig().SITE_URL,
    };
  },

  get jwt() {
    return {
      secret: getConfig().JWT_SECRET,
    };
  },

  get smtp() {
    const cfg = getConfig();
    return {
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      user: cfg.SMTP_USER,
      password: cfg.SMTP_PASSWORD,
      fromName: cfg.SMTP_FROM_NAME,
      fromEmail: cfg.SMTP_FROM_EMAIL,
    };
  },

  get admin() {
    return {
      email: getConfig().ADMIN_EMAIL,
    };
  },

  get captcha() {
    return {
      siteKey: getConfig().PUBLIC_LUOSIMAO_SITE_KEY,
      secretKey: getConfig().LUOSIMAO_SECRET_KEY,
    };
  },

  get env() {
    const cfg = getConfig();
    return {
      nodeEnv: cfg.NODE_ENV,
      host: cfg.HOST,
      isDevelopment: cfg.NODE_ENV === 'development',
      isProduction: cfg.NODE_ENV === 'production',
      isTest: cfg.NODE_ENV === 'test',
    };
  },
};
