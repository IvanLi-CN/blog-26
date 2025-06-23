import path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';
import node from '@astrojs/node'; // Import the Node.js adapter
import partytown from '@astrojs/partytown';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';
import type { AstroIntegration } from 'astro';
import compress from 'astro-compress';
import icon from 'astro-icon';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

import astrowind from './vendor/integration';

import { lazyImagesRehypePlugin, readingTimeRemarkPlugin, responsiveTablesRehypePlugin } from './src/utils/frontmatter';

import react from '@astrojs/react';

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
    remarkPlugins: [readingTimeRemarkPlugin, remarkMath],
    rehypePlugins: [responsiveTablesRehypePlugin, lazyImagesRehypePlugin, rehypeKatex],
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
