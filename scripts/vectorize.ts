import { createTRPCProxyClient, httpBatchLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import { EventSourcePolyfill } from 'event-source-polyfill';
import type { AppRouter } from '~/server/router';

// Polyfill fetch for Node.js environment
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}
// Polyfill EventSource for Node.js environment
if (typeof EventSource === 'undefined') {
  global.EventSource = EventSourcePolyfill;
}

function getAbsoluteUrl() {
  if (typeof window !== 'undefined') {
    return '';
  }
  // 根据你的开发服务器地址进行修改
  return 'http://localhost:4321';
}

const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: `${getAbsoluteUrl()}/api/trpc`,
      }),
      false: httpBatchLink({
        url: `${getAbsoluteUrl()}/api/trpc`,
      }),
    }),
  ],
});

async function main() {
  console.log('🚀 开始订阅向量化日志...');

  const subscription = trpc.vectorization.startVectorization.subscribe(undefined, {
    onStarted: () => {
      console.log('✅ 连接已建立，等待日志...');
    },
    onData: (log) => {
      const percentage = log.percentage ? `${log.percentage.toFixed(2)}%` : '';
      console.log(`[${new Date().toLocaleTimeString()}] [${log.stage}] ${log.message} ${percentage}`);
    },
    onError: (err) => {
      console.error('🔴 订阅出错:', err);
    },
    onComplete: () => {
      console.log('🏁 订阅完成，连接已关闭。');
    },
  });

  // Keep the script running until the subscription is closed.
  // This is a simple way to prevent the script from exiting immediately.
  process.stdin.resume();

  const cleanup = () => {
    console.log('手动断开连接...');
    subscription.unsubscribe();
    process.exit();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main();
