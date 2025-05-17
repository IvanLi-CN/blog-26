import { RateLimiterRedis } from 'rate-limiter-flexible';
import redisClient from './redis';

const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'global_llm_chat_rate_limit',
  points: 10, // 每分钟 10 次
  duration: 60, // 每分钟
  blockDuration: 60, // 阻止 60 秒
});

const rateLimiterHourly = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'global_llm_chat_rate_limit_hourly',
  points: 120, // 每小时 120 次
  duration: 3600, // 每小时
  blockDuration: 3600, // 阻止 3600 秒
});

export { rateLimiter, rateLimiterHourly };
