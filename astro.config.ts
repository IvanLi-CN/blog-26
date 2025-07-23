import mdx from '@astrojs/mdx';
import partytown from '@astrojs/partytown';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import bun from '@nurodev/astro-bun';
import tailwindcss from '@tailwindcss/vite';
import type { AstroIntegration } from 'astro';
import { defineConfig } from 'astro/config';
import compress from 'astro-compress';
import icon from 'astro-icon';
import path from 'path';
import rehypeKatex from 'rehype-katex';
import rehypeMermaid from 'rehype-mermaid';
import remarkMath from 'remark-math';
import { fileURLToPath } from 'url';
import {
  lazyImagesRehypePlugin,
  readingTimeRemarkPlugin,
  responsiveTablesRehypePlugin,
  webdavImagesRehypePlugin,
} from './src/utils/frontmatter';
import astrowind from './vendor/integration';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const hasExternalScripts = false;
const whenExternalScripts = (items: (() => AstroIntegration) | (() => AstroIntegration)[] = []) =>
  hasExternalScripts ? (Array.isArray(items) ? items.map((item) => item()) : [items()]) : [];

export default defineConfig({
  output: 'server',
  adapter: bun({
    assets: 'dist/client',
  }),
  session: {
    driver: 'lru-cache',
  },

  integrations: [
    sitemap(),
    mdx(),
    icon({
      include: {
        tabler: ['*'],
        mingcute: ['ai-line', 'warning-line'],
        'flat-color-icons': [
          'template',
          'gallery',
          'approval',
          'document',
          'advertising',
          'currency-exchange',
          'voice-presentation',
          'business-contact',
          'database',
        ],
      },
    }),
    ...whenExternalScripts(() =>
      partytown({
        config: { forward: ['dataLayer.push'] },
      })
    ),
    compress({
      CSS: true,
      HTML: {
        'html-minifier-terser': {
          removeAttributeQuotes: false,
        },
      },
      Image: false,
      JavaScript: true,
      SVG: false,
      Logger: 1,
    }),
    astrowind({
      config: './src/config.yaml',
    }),
    react({
      experimentalReactChildren: true,
    }),
  ],

  image: {
    domains: ['cdn.pixabay.com'],
    service: {
      entrypoint: 'astro/assets/services/noop',
    },
  },

  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'dracula',
      },
    },
    syntaxHighlight: {
      type: 'shiki',
      excludeLangs: ['mermaid'],
    },
    remarkPlugins: [readingTimeRemarkPlugin, remarkMath],
    rehypePlugins: [
      responsiveTablesRehypePlugin,
      lazyImagesRehypePlugin,
      webdavImagesRehypePlugin,
      [
        rehypeKatex,
        {
          strict: 'ignore', // 忽略严格模式警告
          throwOnError: false, // 遇到错误时不抛出异常
        } as any,
      ],
      [
        rehypeMermaid as any,
        {
          strategy: 'img-svg',
          dark: true,
          // 添加错误处理和超时配置
          launchOptions: {
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
              '--disable-web-security',
              '--disable-features=VizDisplayCompositor',
              '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding',
            ],
            timeout: 60000,
            headless: true,
            env: {
              ...process.env,
              PLAYWRIGHT_BROWSERS_PATH:
                process.env.PLAYWRIGHT_BROWSERS_PATH || '/Users/example/Library/Caches/ms-playwright',
              PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '0',
            },
          },
          // 添加错误处理回调
          errorFallback: (_element: any, diagram: string, error: Error) => {
            console.warn('Mermaid rendering error:', error.message);
            console.warn('Diagram content:', diagram);
            // 返回一个简单的代码块而不是 null
            return {
              type: 'element',
              tagName: 'pre',
              properties: { className: ['mermaid-error'] },
              children: [
                {
                  type: 'element',
                  tagName: 'code',
                  properties: {},
                  children: [{ type: 'text', value: diagram }],
                },
              ],
            };
          },
        },
      ],
    ],
  },

  vite: {
    // @ts-ignore
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
    },
  },
});
