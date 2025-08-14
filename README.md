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
- **Playwright** for E2E testing

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

```
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

## 🧪 Testing

```bash
# Run E2E tests (after migration)
npm run test:e2e
```

---

**Migration Progress**: 🟡 **Phase 1 Complete** - Basic setup and infrastructure ready
**Next Phase**: 🔄 **Component and API Migration**
