import Redis from 'ioredis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD, // 如果有密码
});

redisClient.on('error', (error) => {
  console.error('Redis error:', error);
});

export default redisClient;
