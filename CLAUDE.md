# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
```bash
# Start development server with WebDAV + Next.js
bun run dev

# Start only Next.js (without WebDAV)
bun run dev:next

# Build for production
bun run build

# Start production server
bun run start
```

### Code Quality
```bash
# Run linter and formatter (Biome)
bun run check

# Fix linting and formatting issues
bun run fix

# Legacy Next.js linting
bun run lint
```

### Database Management
```bash
# Run database migrations
bun run migrate

# Seed database with initial data
bun run seed

# Reset development database (drop + migrate + seed)
bun run dev-db:reset

# Check database status
bun run dev-db:check

# Show current database path
bun run db:which
```

### Testing
```bash
# Run unit and integration tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run pre-commit tests (subset)
bun run test:precommit

# Run E2E tests (auto-setup)
bun run test:e2e

# E2E test variants
bun run test:e2e:headed     # Visible browser
bun run test:e2e:ui         # Interactive mode
bun run test:e2e:debug      # Debug mode
bun run test:e2e:report     # View test report
```

### Test Environment Management
```bash
# Reset complete test environment
bun run test-env:reset

# Generate test data
bun run test-data:generate

# Clean test data
bun run test-data:clean

# Verify test data integrity
bun run test-data:verify

# Start test server with WebDAV + Next.js
bun run test-server:start
```

### WebDAV Development
```bash
# Start WebDAV server for development
bun run webdav:dev

# Check WebDAV connection
bun run webdav:check

# List WebDAV directory contents
bun run webdav:list
```

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 15 with App Router + React 19
- **Language**: TypeScript with Bun runtime
- **Database**: SQLite with Drizzle ORM
- **API**: tRPC for type-safe APIs
- **Styling**: Tailwind CSS 4.x + daisyUI
- **Testing**: Bun (unit) + Playwright (E2E)
- **Code Quality**: Biome 2.0.4 (formatting + linting)
- **AI/Search**: OpenAI + LlamaIndex for RAG functionality

### Project Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── api/trpc/          # tRPC API endpoints
│   ├── admin/             # Admin interface pages
│   ├── memos/             # Memo system pages
│   └── posts/             # Blog post pages
├── components/            # React components (UI + business logic)
├── server/                # tRPC server configuration
│   ├── routers/           # API route handlers (auth, admin, posts, memos, comments)
│   └── trpc.ts           # tRPC setup and middleware
├── lib/                   # Core libraries
│   ├── schema.ts         # Drizzle database schema
│   └── db.ts             # Database connection
├── hooks/                 # Custom React hooks
├── store/                 # Jotai state management
└── utils/                 # Utility functions
```

### Database Schema
The application uses SQLite with the following main tables:
- **users**: User accounts with email-based authentication
- **posts**: Content items (blog posts, memos) with multi-source support
- **comments**: Threaded comments system
- **ContentItem**: Unified content model supporting local + WebDAV sources

Key features:
- Multi-source content management (local files + WebDAV)
- SHA-256 hash-based incremental synchronization
- Draft/published state management
- Hierarchical comments with approval workflow

### tRPC API Architecture
The API is organized into domain-specific routers:
- **authRouter**: Authentication and session management
- **adminRouter**: Admin-only operations and content sync
- **postsRouter**: Public blog post operations
- **memosRouter**: Memo system (CRUD + attachments)
- **commentsRouter**: Comment management with moderation
- **reactionsRouter**: Like/reaction system

All routers use middleware for:
- Authentication validation
- Admin permission checks
- Rate limiting
- Input validation with Zod schemas

### Content Management System
The application supports multiple content sources:

1. **Local Files** (`src/content/`)
   - Markdown files with frontmatter
   - Direct filesystem access
   - Development-friendly

2. **WebDAV Remote Storage**
   - Supports remote file synchronization
   - Uses dufs server in development
   - Production WebDAV integration

3. **Database Content**
   - Admin-created content
   - Rich editor integration
   - Immediate publishing

Content synchronization uses:
- SHA-256 hashing for change detection
- Incremental sync to avoid full scans
- Conflict resolution with source priority
- Background processing for large datasets

### State Management
- **Jotai**: Atomic state management for React components
- **tRPC React Query**: Server state with automatic caching
- **React Hook Form**: Form state and validation

### Testing Strategy
1. **Unit Tests** (Bun): Components, utilities, business logic (198 tests)
2. **Integration Tests**: API endpoints, database operations
3. **E2E Tests** (Playwright): Complete user workflows (74 tests)

E2E tests run against:
- Next.js server on port 25090 (test mode)
- dufs WebDAV server on port 25091
- SQLite test database
- Automated test data generation

## Development Guidelines

### Code Style
- Use Biome for formatting and linting (not ESLint/Prettier)
- 2-space indentation, 100-character line width
- Double quotes, semicolons required
- TypeScript strict mode enabled

### Database Operations
- Always use transactions for multi-table operations
- Use `DB_PATH` environment variable for database location
- Run migrations before seeding: `migrate` → `seed`
- Test database: `./test.db`, Development: `./sqlite.db`

### Testing Requirements
- E2E tests require `dufs` WebDAV server: `cargo install dufs`
- Tests use port 25090 (app) and 25091 (WebDAV)
- Run `test-env:reset` for clean test environment
- Use `test:precommit` for fast CI checks

### Content Sync
- Content sources are prioritized: WebDAV → Local → Database
- Hash-based change detection prevents unnecessary updates
- Sync triggers: manual admin action, startup, scheduled intervals
- File paths become unique identifiers in the database

### Environment Variables
Key variables for development:
- `DB_PATH`: Database file location (default: `./sqlite.db`)
- `NODE_ENV`: Environment mode (`development`/`test`/`production`)
- `ADMIN_EMAIL`: Admin user identifier
- `WEBDAV_URL`: WebDAV server endpoint
- `LOCAL_CONTENT_BASE_PATH`: Local content directory

### Git Workflow
Pre-commit hooks (lefthook) automatically run:
- Biome formatting and linting on staged files
- Unit tests via `test:precommit`
- Conventional commit message validation

### Performance Considerations
- Database indexes on frequently queried columns
- tRPC query caching with React Query
- SQLite WAL mode for better concurrency
- Image optimization through Next.js Image component
- Incremental content synchronization