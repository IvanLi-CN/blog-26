# Development Guide

This document serves as the development guide for Ivan's Blog project, covering project architecture, development environment setup, coding standards, and best practices.

## 📋 Table of Contents

- [Tech Stack](#tech-stack)
- [Project Architecture](#project-architecture)
- [Development Environment Setup](#development-environment-setup)
- [Code Structure](#code-structure)
- [Development Workflow](#development-workflow)
- [API Development](#api-development)
- [Database Operations](#database-operations)
- [Testing](#testing)
- [Deployment](#deployment)
- [Code Standards](#code-standards)
- [FAQ](#faq)

## 🛠 Tech Stack

### Core Technologies
- **Frontend Framework**: [Astro 5.0](https://astro.build/) + [React](https://reactjs.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [daisyUI](https://daisyui.com/)
- **Runtime**: [Bun](https://bun.sh/) (Bun only, not compatible with Node.js)
- **Type Checking**: [TypeScript](https://www.typescriptlang.org/)

### Backend Technologies
- **API**: [tRPC](https://trpc.io/) (completely replaces REST API)
- **Database**: [SQLite](https://sqlite.org/) + [Drizzle ORM](https://orm.drizzle.team/)
- **Cache**: [Redis](https://redis.io/)
- **Vector Storage**: SQLite with embedding vectors
- **Authentication**: [JWT](https://jwt.io/) + Email verification

### AI and Search
- **AI Service**: [OpenAI API](https://openai.com/api/)
- **Vectorization**: [LlamaIndex](https://www.llamaindex.ai/)
- **Semantic Search**: Based on embedding vectors

### Other Services
- **Email**: [Nodemailer](https://nodemailer.com/)
- **CAPTCHA**: [Luosimao](https://captcha.luosimao.com/)
- **Content Management**: WebDAV + Content Collections
- **Deployment**: [Docker](https://docker.com/) + [Docker Compose](https://docs.docker.com/compose/)

## 🏗 Project Architecture

### Overall Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Astro Pages   │    │  React Components│    │   tRPC API      │
│   (SSG/SSR)     │◄──►│   (Interactive)  │◄──►│   (Backend)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Content Mgmt   │    │   UI Components  │    │   Database      │
│  (WebDAV+Local) │    │   (daisyUI)      │    │   (SQLite)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Rendering Strategy
- **SSG**: Static pages remain SSG (homepage, about page, etc.)
- **SSR**: Blog pages use SSR + Node.js adapter
- **Hybrid**: Choose appropriate rendering method based on page characteristics

### Data Flow
1. **Content Management**: WebDAV (primary) + Local Content Collections (auxiliary)
2. **API Queries**: Only fetch data for currently displayed items, optimizing performance
3. **Caching Strategy**: Redis caches hot data
4. **Vectorization**: Automatically rebuild indexes when articles are saved

## 🚀 Development Environment Setup

### Prerequisites
- **Bun**: 1.0+ (required, not compatible with Node.js)
- **Docker**: For deployment and Redis
- **Git**: Version control

### Project Initialization
```bash
# Clone the project
git clone ssh://gitea@git.ivanli.cc:7018/Ivan/blog-astrowind.git
cd blog-astrowind

# Install dependencies (use bun, not npm)
bun install

# Configure environment variables
cp .env.example .env
# Edit .env file to configure necessary environment variables

# Run database migrations
bun run migrate

# Start development server
bun run dev
```

### Environment Variable Configuration
The project uses a unified configuration management system located at `src/lib/config.ts`:

#### Required Configuration
```bash
# Database
DB_PATH=./sqlite.db

# OpenAI (AI features)
OPENAI_API_KEY=your-openai-api-key
OPENAI_API_BASE_URL=https://api.openai.com/v1

# Site configuration
SITE_URL=https://yourdomain.com
JWT_SECRET=your-very-long-jwt-secret-key

# Admin email
ADMIN_EMAIL=admin@yourdomain.com
```

#### Optional Configuration
```bash
# Redis (cache)
REDIS_HOST=localhost
REDIS_PORT=6379

# WebDAV (content management)
WEBDAV_URL=https://your-webdav-url/
WEBDAV_USERNAME=username
WEBDAV_PASSWORD=password
WEBDAV_MEMOS_PATH=/Memos

# SMTP (email)
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password

# Luosimao CAPTCHA
PUBLIC_LUOSIMAO_SITE_KEY=your-site-key
LUOSIMAO_SECRET_KEY=your-secret-key
```

### Development Server
```bash
# Development mode (hot reload)
bun run dev

# Build production version
bun run build

# Preview production version
bun run preview

# Type checking
bun run check

# Code formatting
bun run format

# Code linting
bun run lint
```

## 📁 Code Structure

### Directory Structure
```
src/
├── components/          # React components
│   ├── blog/           # Blog-related components
│   ├── comments/       # Comment system
│   ├── editor/         # Article editor
│   ├── memos/          # Memos feature
│   ├── ui/             # Common UI components
│   └── widgets/        # Page widgets
├── layouts/            # Astro layouts
├── lib/                # Core library files
│   ├── config.ts       # Configuration management
│   ├── db.ts           # Database connection
│   ├── schema.ts       # Database schema
│   ├── trpc.ts         # tRPC client
│   └── webdav.ts       # WebDAV client
├── pages/              # Page routes
│   ├── api/            # API routes
│   ├── admin/          # Admin pages
│   └── blog/           # Blog pages
├── server/             # Server-side code
│   ├── router.ts       # tRPC router
│   └── routers/        # Modular routes
└── utils/              # Utility functions
```

### Key Files Description
- `src/lib/config.ts`: Unified configuration management with Zod validation
- `src/lib/schema.ts`: Database table structure definitions
- `src/server/router.ts`: tRPC API route aggregation
- `src/middleware.ts`: Astro middleware
- `astro.config.ts`: Astro configuration file
- `drizzle.config.ts`: Database migration configuration

## 🔄 Development Workflow

### Feature Development Process
1. **Requirements Analysis**: Clarify feature requirements and technical solutions
2. **Database Design**: Update `src/lib/schema.ts` if needed
3. **API Development**: Add tRPC routes in `src/server/routers/`
4. **Frontend Components**: Develop React components or Astro pages
5. **Testing**: Write and run tests
6. **Documentation**: Update relevant documentation

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/new-feature

# Commit code (using conventional commits format)
git commit -m "feat: add new feature"

# Push branch
git push origin feature/new-feature

# Create Pull Request
```

### Commit Message Standards
Use [Conventional Commits](https://www.conventionalcommits.org/) format:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation updates
- `style:` Code formatting
- `refactor:` Code refactoring
- `test:` Test-related
- `chore:` Build tools, dependency updates, etc.

## 🔌 API Development

### tRPC Route Development
The project completely uses tRPC to replace REST API. All APIs are defined in `src/server/routers/`.

#### Creating New Routes
```typescript
// src/server/routers/example.ts
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const exampleRouter = router({
  getExample: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      // Query logic
      return { id: input.id, data: 'example' };
    }),

  createExample: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      // Creation logic
      return { success: true };
    }),
});
```

#### Registering Routes
```typescript
// src/server/router.ts
import { exampleRouter } from './routers/example';

export const appRouter = router({
  example: exampleRouter,
  // Other routes...
});
```

### Client-side Usage
```typescript
// In React components
import { trpc } from '~/lib/trpc';

function ExampleComponent() {
  const { data } = trpc.example.getExample.useQuery({ id: '123' });
  const createMutation = trpc.example.createExample.useMutation();

  return <div>{data?.data}</div>;
}

// In Astro pages
import { trpcVanilla } from '~/lib/trpc';

const data = await trpcVanilla.example.getExample.query({ id: '123' });
```

## 🗄 Database Operations

### Database Migrations
```bash
# Generate migration files
bun run db:generate

# Run migrations
bun run migrate

# Reset database
bun run db:reset
```

### Schema Definition
```typescript
// src/lib/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const examples = sqliteTable('examples', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
```

### Database Queries
```typescript
import { db } from '~/lib/db';
import { examples } from '~/lib/schema';

// Query
const allExamples = await db.select().from(examples);

// Insert
await db.insert(examples).values({
  name: 'Example',
  createdAt: new Date(),
});
```

## 🧪 Testing

### Current Testing Status

The project **does not have an automated testing suite configured**. The Playwright dependency exists to support Mermaid chart rendering, not for testing.

### Using Existing Testing Tools

#### 1. Configuration Testing Script

```bash
# Test if configuration module works properly
bun run test-config.ts
```

#### 2. tRPC API Manual Testing

Access test component pages for manual testing:

- Access pages containing `CommentsTest` component in development environment
- Test tRPC health checks, user information, and comment functionality

#### 3. Authentication Feature Testing

```bash
# Access login test page
http://localhost:4321/admin/test-login
```

### Mermaid Chart Rendering Explanation

Playwright in the project is specifically used for server-side rendering of Mermaid charts:

```typescript
// Configuration in astro.config.ts
rehypeMermaid, {
  strategy: 'img-svg',  // Use Playwright to render SVG
  dark: true,           // Generate dark theme version
}
```

**Rendering Process**:

1. During build, `rehype-mermaid` uses Playwright to launch a headless browser
2. Renders Mermaid code into SVG charts
3. Generates both light and dark versions
4. Outputs as `<picture>` elements, supporting theme switching

### Adding Automated Testing

If you need to add automated testing, here are recommended approaches:

#### 1. Choose Testing Framework

**Recommended Options**:

- **Vitest**: Suitable for unit tests and API tests
- **Playwright**: Suitable for end-to-end tests (requires separate configuration to avoid conflicts with Mermaid rendering)

```bash
# Install Vitest for unit testing
bun add -d vitest @vitest/ui

# For end-to-end testing, configure Playwright separately
# Note: Need to separate from existing Mermaid rendering configuration
```

#### 2. Recommended Testing Strategy

```text
Testing Priority:
1. Unit Tests (Vitest) - Core business logic
2. API Tests (Vitest) - tRPC route testing
3. Component Tests (Vitest + Testing Library) - React components
4. End-to-End Tests (Playwright) - Critical user flows
```

#### 3. Example Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

### Testing Best Practices

- Utilize existing testing tools for manual testing
- Prioritize adding end-to-end tests for critical features
- Use tRPC's type-safe features for API testing
- Maintain consistency between testing and production environments
- Regularly run configuration test scripts to ensure environment health

## 🚀 Deployment

### Docker Deployment

```bash
# Build application
bun run build

# Deploy with Docker Compose
docker-compose up -d --build

# Or use deployment script
./deploy.sh
```

### Environment Check

Ensure the following environment variables are properly configured before deployment:

- `OPENAI_API_KEY`: OpenAI API key
- `SITE_URL`: Site URL
- `JWT_SECRET`: JWT secret
- `ADMIN_EMAIL`: Admin email

### Production Environment Configuration

```bash
# Production environment variables
NODE_ENV=production
HOST=0.0.0.0

# Database persistence
DB_PATH=./sqlite.db

# Redis configuration
REDIS_HOST=redis
REDIS_PORT=6379
```

### Health Check

```bash
# Check application status
curl -f http://localhost:4321

# View container logs
docker-compose logs blog

# View Redis status
docker-compose logs redis
```

## 📝 Code Standards

### TypeScript Standards

- Use strict TypeScript configuration
- Provide type annotations for all functions and variables
- Use Zod for runtime type validation
- Avoid using `any` type

### Code Formatting

The project uses [Biome](https://biomejs.dev/) for code formatting and checking:

```bash
# Format code
bun run format

# Check code quality
bun run lint

# Auto-fix issues
bun run lint:fix
```

### Component Standards

```typescript
// React component example
interface ExampleProps {
  title: string;
  optional?: boolean;
}

export function Example({ title, optional = false }: ExampleProps) {
  return (
    <div className="example-component">
      <h2>{title}</h2>
      {optional && <p>Optional content</p>}
    </div>
  );
}
```

### Styling Standards

- Use Tailwind CSS class names
- Prefer daisyUI components
- Maintain responsive design
- Use semantic CSS class names

```html
<!-- Good example -->
<button class="btn btn-primary btn-sm">
  Submit
</button>

<!-- Avoid inline styles -->
<button style="background: blue;">
  Submit
</button>
```

### File Naming Standards

- **Components**: PascalCase (`ExampleComponent.tsx`)
- **Pages**: kebab-case (`example-page.astro`)
- **Utility functions**: camelCase (`exampleUtils.ts`)
- **Constants**: UPPER_SNAKE_CASE (`EXAMPLE_CONSTANT`)

## ❓ FAQ

### Q: Why only support Bun and not Node.js?

A: The project is specifically optimized for Bun runtime, utilizing Bun's features and performance advantages. Supporting Node.js would require major architectural adjustments.

### Q: How to add new environment variables?

A:

1. Add Zod validation in `envSchema` in `src/lib/config.ts`
2. Add example values in `.env.example`
3. Update environment variable list in `docker-compose.yml`

### Q: What to do if database migration fails?

A:

```bash
# Check database file permissions
ls -la sqlite.db

# Reset database
rm sqlite.db
bun run migrate

# Check migration status
bun run db:status
```

### Q: How to debug tRPC call failures?

A:

1. Check network requests (Developer Tools Network tab)
2. View server-side logs
3. Verify input parameter types
4. Confirm routes are properly registered

### Q: WebDAV connection failed?

A:

1. Check WebDAV URL, username, password
2. Confirm network connection
3. View error messages in server logs
4. Test if WebDAV service is working properly

### Q: How to debug AI features?

A:

1. Check if OpenAI API key is valid
2. Confirm API quota is sufficient
3. Check vectorization task status
4. Verify embedding model configuration

### Q: 404 pages after deployment?

A:

1. Check `output` and `adapter` settings in Astro configuration
2. Confirm route files are correct
3. Check build logs for errors
4. Verify Docker containers are starting properly

## 📚 Related Resources

- [Astro Documentation](https://docs.astro.build/)
- [tRPC Documentation](https://trpc.io/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [daisyUI Documentation](https://daisyui.com/docs/)
- [Bun Documentation](https://bun.sh/docs)

## 🤝 Contributing Guide

1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

---

If you have any questions or suggestions, please create an Issue or contact the project maintainer.
