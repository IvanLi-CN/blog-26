import mdx from '@astrojs/mdx';
import node from '@astrojs/node'; // Import the Node.js adapter
import partytown from '@astrojs/partytown';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
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
  adapter: node({
    // Add the Node.js adapter
    mode: 'standalone',
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
        mingcute: ['ai-line'],
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
    react(),
  ],

  image: {
    domains: ['cdn.pixabay.com'],
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
      rehypeKatex,
      [
        rehypeMermaid,
        {
          strategy: 'img-svg',
          dark: true,
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
