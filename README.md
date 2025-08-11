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

### 🔄 In Progress
- [ ] **Component Migration**: Migrate React components from `old/src/components/`
- [ ] **API Routes**: Migrate tRPC routers and API endpoints
- [ ] **Page Migration**: Convert Astro pages to Next.js App Router pages
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
