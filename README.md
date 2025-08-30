# Ivan's Blog - Next.js Migration

This is the Next.js version of Ivan's Blog, migrated from Astro 5.0.

## 🚀 Migration Status

### ✅ Completed

- [x] **Project Setup**: Next.js 15 project created with TypeScript and Tailwind CSS
- [x] **Core Dependencies**: Installed essential packages (tRPC, Drizzle ORM, AI libraries)
- [x] **Database Schema**: Migrated database schema from Astro version
- [x] **tRPC Setup**: Basic tRPC configuration with health check endpoint
- [x] **Configuration Files**: Created Biome, environment, and Drizzle configs
- [x] **Basic UI**: Added daisyUI integration and Inter font
- [x] **Memo System**: Complete memo functionality with multi-source content support
  - [x] **Data Layer**: Extended database schema for ContentItem compatibility
  - [x] **API Layer**: Full CRUD operations with tRPC routers
  - [x] **Frontend Components**: MemoEditor, QuickMemoEditor, MemosList, MemoCard
  - [x] **Pages**: List page (/memos) and detail page (/memos/[slug])
  - [x] **Multi-source Support**: Local and WebDAV content sources
  - [x] **Performance**: Database optimization and caching strategies

### 🔄 In Progress

- [ ] **Component Migration**: Migrate remaining React components from `old/src/components/`
- [ ] **API Routes**: Migrate remaining tRPC routers and API endpoints
- [ ] **Page Migration**: Convert remaining Astro pages to Next.js App Router pages
- [ ] **Middleware**: Migrate authentication and other middleware
- [ ] **Static Assets**: Copy and optimize static assets

### 📋 Next Steps

1. **Component Migration**: Start with common components (UI, layout)
2. **API Migration**: Migrate tRPC routers for posts, comments, auth
3. **Page Structure**: Create blog, admin, and memos pages
4. **Database Migration**: Set up database with existing schema
5. **Testing**: Migrate and update E2E tests

## 🛠 Tech Stack

### Core Framework

- **Next.js 15.4.6** with App Router
- **React 19.1.0**
- **TypeScript 5.x**
- **Tailwind CSS 4.x** + daisyUI

### Backend & Database

- **tRPC 11.4.3** for type-safe APIs
- **Drizzle ORM 0.44.2** with SQLite
- **better-sqlite3** for database connection

### AI & Search

- **OpenAI API** for AI features
- **LlamaIndex** for RAG functionality
- **Redis** for caching (ioredis)

### Development Tools

- **Biome 2.0.4** for code formatting and linting
- **Playwright** for E2E testing ([详细指南](docs/e2e-testing.md))

## 🧪 Testing

### Overview

This project uses a comprehensive testing strategy with three types of tests:

- **Unit Tests**: Test individual components and utilities using Bun's built-in test runner
- **Integration Tests**: Test API endpoints and database operations
- **E2E Tests**: Test complete user workflows using Playwright

### Prerequisites for Testing

- All development prerequisites (Node.js/Bun, SQLite)
- Playwright browsers installed: `bunx playwright install`
- `dufs` WebDAV server for E2E tests: `cargo install dufs` or `brew install dufs`

### Running Tests

#### Unit and Integration Tests

```bash
# Run all unit and integration tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run pre-commit tests (subset of unit tests)
bun run test:precommit
```

#### E2E Tests

E2E tests require proper test data setup and run against a live application instance.

**Quick E2E Test Run:**

```bash
# Run E2E tests with automatic setup
bun run test:e2e
```

**Manual E2E Test Setup (for debugging):**

```bash
# 1. Clean and reset test environment
bun run test-env:reset

# 2. Verify test data is properly set up
bun run test-data:verify

# 3. Run E2E tests
bun run test:e2e
```

**E2E Test Variants:**

```bash
# Run tests in headed mode (visible browser)
bun run test:e2e:headed

# Run tests with UI mode (interactive)
bun run test:e2e:ui

# Run tests in debug mode
bun run test:e2e:debug

# View test report
bun run test:e2e:report
```

### Test Data Management

#### Test Environment Commands

```bash
# Generate test content files
bun run test-data:generate

# Clean test content files
bun run test-data:clean

# Verify test data integrity
bun run test-data:verify

# Trigger content source synchronization
bun run test-sync:trigger

# Complete environment reset
bun run test-env:reset

# Clean environment (remove all test data)
bun run test-env:clean
```

#### Development Data Commands

```bash
# Generate development test data
bun run dev-data:generate

# Clean development test data
bun run dev-data:clean
```

### E2E Test Architecture

#### Test Environment Setup

E2E tests automatically start two servers:

1. **Next.js Application Server** (`localhost:3000`)
   - Runs in test mode with `NODE_ENV=test`
   - Uses test admin email: `admin-test@test.local`
   - Connects to SQLite test database

2. **WebDAV Server** (`localhost:8080`)
   - Serves test content files from `test-data/webdav/`
   - Enables content source synchronization testing

#### Test Data Flow

```text
test-data/webdav/     →  Content Source Sync  →  SQLite Database  →  Application UI
├── Memos/           →  API: /api/sync        →  posts table     →  /memos
├── Posts/           →  Background Process    →  Structured Data →  Frontend
└── assets/          →  File References      →  Image URLs      →  Lightbox
```

#### Test Categories

1. **Functional Tests**
   - Image lightbox functionality
   - Admin panel operations
   - User authentication flows

2. **Permission Tests**
   - Admin vs regular user access
   - Content visibility controls
   - API endpoint security

3. **Integration Tests**
   - Content source synchronization
   - Database operations
   - File serving and optimization

4. **UI/UX Tests**
   - Responsive design
   - Mobile compatibility
   - Accessibility features

### Troubleshooting

#### Common Issues

**E2E Tests Failing with "No test data found":**

```bash
# Reset test environment completely
bun run test-env:reset

# Verify data was created
bun run test-data:verify
```

**WebDAV Server Connection Issues:**

```bash
# Check if dufs is installed
dufs --version

# Install dufs if missing
cargo install dufs
# or
brew install dufs
```

**Database Lock Errors:**

```bash
# Stop any running development servers
# Clean and reinitialize database
rm sqlite.db
bun run migrate
bun run test-env:reset
```

**Port Conflicts:**

```bash
# Kill processes on test ports
lsof -ti:3000 | xargs kill -9
lsof -ti:8080 | xargs kill -9
```

#### Test Debugging

**Enable Verbose Logging:**

```bash
# Run with debug output
DEBUG=* bun run test:e2e

# Run specific test file
bun run test:e2e tests/e2e/memos-lightbox.spec.ts
```

**Visual Debugging:**

```bash
# Run in headed mode to see browser
bun run test:e2e:headed

# Use UI mode for interactive debugging
bun run test:e2e:ui
```

**Test Artifacts:**

- Screenshots: `test-results/artifacts/`
- Videos: `test-results/artifacts/`
- HTML Report: `test-results/html-report/`
- Traces: `test-results/artifacts/` (open with `bunx playwright show-trace`)

### CI/CD Testing

#### Simulate CI Environment

```bash
# Run complete CI workflow locally
bun run test:ci
```

This command replicates the GitHub Actions workflow:

1. Clean environment setup
2. Dependency installation
3. Database initialization
4. Test data generation
5. Content synchronization
6. E2E test execution

#### Test Coverage

Current test coverage:

- **Unit Tests**: 198 tests covering utilities, components, and business logic
- **E2E Tests**: 74 tests covering complete user workflows
- **Integration Tests**: Database operations, API endpoints, and content sync

**Target Coverage Areas:**

- Image lightbox functionality ✅
- Admin panel operations ✅
- User authentication ✅
- Content management ✅
- Responsive design ✅
- Accessibility features ✅

## 📝 Memo System

The memo system is a complete content management solution that supports multiple content sources and provides a rich editing experience.

### Features

- **Multi-source Content**: Supports both local files and WebDAV storage
- **Rich Editor**: Based on UniversalEditor with WYSIWYG and source modes
- **Quick Memo**: Lightweight editor for rapid note-taking
- **Search & Filter**: Full-text search and tag-based filtering
- **Responsive Design**: Optimized for desktop and mobile devices
- **SEO Optimized**: Dynamic metadata and structured data
- **Performance**: Database indexing and caching strategies

### API Endpoints

- `GET /api/trpc/memos.list` - Get paginated memo list
- `GET /api/trpc/memos.bySlug` - Get memo by slug
- `POST /api/trpc/memos.create` - Create new memo (admin only)
- `POST /api/trpc/memos.update` - Update memo (admin only)
- `POST /api/trpc/memos.delete` - Delete memo (admin only)
- `POST /api/trpc/memos.uploadAttachment` - Upload attachment (admin only)

### Components

- **MemosApp**: Main container component with state management
- **MemoEditor**: Full-featured editor based on UniversalEditor
- **QuickMemoEditor**: Lightweight editor for quick notes
- **MemosList**: List view with infinite scroll and filtering
- **MemoCard**: Individual memo display component
- **MemoDetailPage**: Full memo detail view

### Usage

```typescript
import { MemosApp } from "@/components/memos/MemosApp";

// Public memo list
<MemosApp publicOnly={true} showManageFeatures={false} />

// Admin interface
<MemosApp publicOnly={false} showManageFeatures={true} />
```

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run linting
npm run check

# Fix code issues
npm run fix
```

## 📁 Project Structure

```text
src/
├── app/                    # Next.js App Router pages
│   ├── api/trpc/          # tRPC API routes
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   └── TRPCProvider.tsx   # tRPC client provider
├── lib/                   # Core libraries
│   ├── db.ts             # Database connection
│   ├── schema.ts         # Database schema
│   └── trpc.ts           # tRPC client
├── server/               # tRPC server
│   ├── router.ts         # Main router
│   └── trpc.ts           # tRPC setup
└── utils/                # Utility functions

old/                      # Original Astro project (reference)
```

## 🔗 Original Project

The original Astro project is preserved in the `old/` directory for reference during migration.

## 📝 Environment Variables

Copy `.env.example` to `.env` and configure:

- Database path
- OpenAI API credentials
- Redis connection
- WebDAV settings (if used)
- SMTP configuration
- Admin settings

## 🔄 Development Environment Data Regeneration

This project uses a multi-source content management system that supports both local file system and WebDAV remote storage. During development, you may need to reset environment data. This section provides a complete operation guide.

### 📋 System Architecture Overview

**Data Storage Layers**:

- **SQLite Database** - Primary data storage (posts, memos, comments, users, etc.)
- **Local File System** - Development content (`src/content/`, `dev-data/local/`)
- **WebDAV Remote Storage** - Remote content sync (`dev-data/webdav/`, `test-data/webdav/`)
- **Cache Layer** - Redis cache, build cache (`.next/`)

**Content Sync Mechanism**:

- SHA-256 hash-based incremental sync
- Multi-source priority management
- Intelligent conflict resolution strategy

### ⚡ Quick Reset Guide

**One-click Complete Reset**:

```bash
# Reset database + Generate development data + Start development environment
bun run dev-db:reset && bun run dev-data:generate && bun run dev
```

**Common Scenarios**:

```bash
# Reset development database only (keep files)
bun run dev-db:reset

# Regenerate test data only
bun run test-data:clean && bun run test-data:generate

# Check development environment status
bun run dev-db:check && bun run webdav:check

# Start complete development environment (WebDAV + Next.js)
bun run dev
```

### 🛠️ Detailed Operation Flow

#### 1. Data Cleanup Strategy

**Cleanup Order** (to avoid foreign key constraint conflicts):

1. Stop all service processes
2. Clear cache data (Redis, build cache)
3. Clear database (by dependency: comments → posts/memos → users)
4. Clear file system data
5. Clear temporary files

**Safe Cleanup Commands**:

```bash
# Force delete database (use with caution)
bun run drop-db --force

# Clean test data files
bun run test-data:clean

# Clear build cache
rm -rf .next/
```

#### 2. Database Rebuild Process

**Standard Rebuild Process**:

```bash
# 1. Delete existing database
bun run drop-db --force

# 2. Run database migrations
bun run migrate

# 3. Populate seed data
bun run seed

# Or use one-click command for development
bun run dev-db:reset
```

**Seed Data Description**:

- Create test users (<test1@example.com>, <test2@example.com>)
- Initialize system configuration
- **Does not include** content data (posts/memos obtained through content sync)

#### 3. Content Source Regeneration

**Generate Test Content**:

```bash
# Generate development environment test data
bun run test-data:generate

# Verify generated data
bun run test-data:verify

# Clean test data
bun run test-data:clean
```

**Content Sync Process**:

1. Start WebDAV server: `bun run webdav:dev`
2. Access admin interface: `http://localhost:3000/admin/content-sync`
3. Trigger content sync or wait for automatic sync
4. Check sync logs and status

### 📜 Script Tools Reference

#### Database Management Scripts

| Script | Function | Usage |
|--------|----------|-------|
| `migrate` | Run database migrations | `bun run migrate` |
| `seed` | Populate seed data | `bun run seed [--clear] [--check]` |
| `drop-db` | Delete database file | `bun run drop-db [--force]` |
| `dev-db:reset` | Reset development database | `bun run dev-db:reset` |
| `dev-db:check` | Check development database | `bun run dev-db:check` |
| `test-db:reset` | Reset test database | `bun run test-db:reset` |
| `test-db:check` | Check test database | `bun run test-db:check` |
| `db:which` | Show current database path | `bun run db:which` |

#### Content Management Scripts

| Script | Function | Usage |
|--------|----------|-------|
| `test-data:generate` | Generate test data | `bun run test-data:generate` |
| `test-data:clean` | Clean test data | `bun run test-data:clean` |
| `test-data:verify` | Verify test data | `bun run test-data:verify` |

#### WebDAV Tools

| Script | Function | Usage |
|--------|----------|-------|
| `webdav:dev` | Start development WebDAV server | `bun run webdav:dev` |
| `webdav:check` | Check WebDAV connection | `bun run webdav:check` |
| `webdav:list` | List WebDAV directory | `bun run webdav:list` |
