# 📝 Ivan's Blog

A modern personal blog system built with **[Astro 5.0](https://astro.build/)**, featuring complete content management, comment system, AI enhancements, and vector search capabilities.

## ✨ Key Features

- 🚀 **High Performance**: Static site generation with Astro 5.0, excellent PageSpeed Insights scores
- 🎨 **Modern Design**: Built with Tailwind CSS and daisyUI, supports dark mode
- 💬 **Complete Comment System**: Nested replies, email notifications, admin moderation
- 🔐 **Admin Features**: JWT authentication, content management, comment moderation
- 🤖 **AI Enhanced**: OpenAI integration for intelligent content processing
- 🔍 **Vector Search**: Semantic search with SQLite-stored embeddings
- 📧 **Email System**: SMTP notifications, verification code login
- 🛡️ **Security**: Luosimao CAPTCHA, rate limiting, XSS protection
- 🐳 **Containerized**: One-click deployment with Docker Compose
- 📱 **Responsive**: Perfect adaptation to all devices

## 📋 Table of Contents

- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [Development Commands](#-development-commands)
- [Features](#-features)
- [Environment Variables](#-environment-variables)
- [Troubleshooting](#-troubleshooting)

## 🛠 Tech Stack

- **Frontend**: [Astro 5.0](https://astro.build/) + [React](https://reactjs.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [daisyUI](https://daisyui.com/)
- **Database**: [SQLite](https://sqlite.org/) + [Drizzle ORM](https://orm.drizzle.team/)
- **Cache**: [Redis](https://redis.io/)
- **Vector Storage**: SQLite with embedding vectors for semantic search
- **AI Service**: [OpenAI API](https://openai.com/api/) + [LlamaIndex](https://www.llamaindex.ai/)
- **Authentication**: [JWT](https://jwt.io/) + Email verification
- **Email**: [Nodemailer](https://nodemailer.com/)
- **CAPTCHA**: [Luosimao](https://captcha.luosimao.com/)
- **Package Manager**: [Bun](https://bun.sh/)
- **Deployment**: [Docker](https://docker.com/) + [Docker Compose](https://docs.docker.com/compose/)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun 1.0+
- Docker and Docker Compose (for deployment)

### Local Development

```bash
# Clone the repository
git clone ssh://gitea@git.ivanli.cc:7018/Ivan/blog-astrowind.git
cd blog-astrowind

# Install dependencies
bun install

# Configure environment variables
cp .env.example .env
# Edit .env file with your configuration

# Run database migrations
bun run migrate

# Start development server
bun run dev
```

### Docker Deployment

```bash
# Build the application
bun run build

# Deploy with Docker Compose
docker-compose up -d --build

# Or use the deployment script
./deploy.sh
```

## 📁 Project Structure

```
├── src/
│   ├── components/          # React/Astro components
│   │   ├── comments/        # Comment system components
│   │   ├── admin/           # Admin interface components
│   │   └── ui/              # Common UI components
│   ├── content/             # Content files
│   │   ├── post/            # Blog posts (MDX)
│   │   └── notes/           # Note files
│   ├── layouts/             # Page layouts
│   ├── lib/                 # Core libraries
│   │   ├── config.ts        # Unified configuration management
│   │   ├── db.ts            # Database connection
│   │   ├── auth.ts          # Authentication logic
│   │   ├── email.ts         # Email service
│   │   └── captcha.ts       # CAPTCHA service
│   ├── pages/               # Page routes
│   │   ├── api/             # API routes
│   │   ├── admin/           # Admin pages
│   │   └── blog/            # Blog pages
│   └── utils/               # Utility functions
├── docker-compose.yml       # Docker deployment config
├── Dockerfile              # Docker image config
├── drizzle/                # Database migration files
└── scripts/                # Script files
```

## ⚙️ Configuration

The project uses a unified configuration management system with Zod validation for type safety and data validation.

### Configuration System

- **File**: `src/lib/config.ts`
- **Features**:
  - Zod schema validation for all environment variables
  - Type-safe configuration access
  - Dual fallback mechanism (process.env → import.meta.env)
  - Configuration caching

### Usage Example

```typescript
import { config } from '~/lib/config';

// Type-safe, automatically validated
const { secretKey } = config.captcha;
const { email } = config.admin;
const { host, port } = config.smtp;
```

### Test Configuration

```bash
# Test configuration validation
bun test-config.ts

# In Docker environment
docker-compose exec blog bun test-config.ts
```

## 🚀 Deployment

### Production Deployment

1. **Configure Environment Variables**

   ```bash
   cp .env.example .env
   # Edit .env with your production values
   ```

2. **Build and Deploy**

   ```bash
   bun run build
   docker-compose up -d --build
   ```

3. **Use Deployment Script**

   ```bash
   ./deploy.sh
   ```

### Services Included

- **Blog Application**: Main Astro application with SQLite database
- **Redis**: Caching and session storage

## 💻 Development Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run preview` | Preview production build |
| `bun run migrate` | Run database migrations |
| `bun run check` | Type checking |
| `bun test-config.ts` | Test configuration |

## 🎯 Features

### Comment System

- Nested replies with unlimited depth
- Email notifications for new comments
- Admin moderation and approval
- CAPTCHA protection against spam
- Real-time updates

### Admin Panel

- JWT-based authentication
- Email verification code login
- Content management interface
- Comment moderation tools
- Vectorization status monitoring

### AI Integration

- OpenAI API integration with LlamaIndex
- Intelligent content processing and RAG queries
- Vector embeddings stored in SQLite
- Semantic similarity search with cosine similarity

### Security

- Luosimao CAPTCHA integration
- Rate limiting on API endpoints
- XSS protection
- CSRF protection
- Input validation with Zod

## 🔧 Environment Variables

### Required Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `LUOSIMAO_SECRET_KEY` | string | Luosimao CAPTCHA secret key | `"abc123..."` |
| `JWT_SECRET` | string (≥32 chars) | JWT signing secret | `"your-32-char-secret..."` |
| `ADMIN_EMAIL` | email | Administrator email | `"admin@example.com"` |
| `OPENAI_API_KEY` | string | OpenAI API key | `"sk-..."` |
| `SMTP_HOST` | string | SMTP server host | `"smtp.gmail.com"` |
| `SMTP_FROM_EMAIL` | email | Sender email address | `"noreply@example.com"` |
| `SITE_URL` | URL | Site base URL | `"https://example.com"` |
| `PUBLIC_LUOSIMAO_SITE_KEY` | string | Luosimao site key | `"def456..."` |

### Optional Variables (with defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `"./sqlite.db"` | Database file path |
| `REDIS_HOST` | `"localhost"` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_FROM_NAME` | `"Blog"` | Sender name |
| `NODE_ENV` | `"development"` | Environment type |

### Configuration Example

```bash
# Database
DB_PATH=./sqlite.db

# OpenAI
OPENAI_API_KEY=sk-your-openai-key
OPENAI_API_BASE_URL=https://api.openai.com/v1

# Site
SITE_URL=https://yourdomain.com
JWT_SECRET=your-very-long-jwt-secret-key-here

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_NAME=Your Blog Name
SMTP_FROM_EMAIL=noreply@yourdomain.com

# Admin
ADMIN_EMAIL=admin@yourdomain.com

# CAPTCHA
PUBLIC_LUOSIMAO_SITE_KEY=your-site-key
LUOSIMAO_SECRET_KEY=your-secret-key
```

## 🔍 Troubleshooting

### Configuration Issues

**Problem**: `LUOSIMAO_SECRET_KEY is not set in environment variables`

**Solution**:

1. Check your `.env` file exists and contains the variable
2. Verify Docker Compose environment configuration
3. Run configuration test: `bun test-config.ts`
4. Rebuild containers: `docker-compose build --no-cache`

### Common Issues

1. **Configuration Validation Failed**
   - Check environment variable formats (URL, email, numbers)
   - Ensure all required variables are set
   - Verify variable types match schema requirements

2. **Container Startup Failed**
   - Check logs: `docker-compose logs blog`
   - Verify port availability: `lsof -i :4321`
   - Check configuration validation in logs

3. **Database Issues**
   - Run migrations: `bun run migrate`
   - Check SQLite file permissions
   - Verify database path in configuration

### Useful Commands

```bash
# Check configuration
bun test-config.ts

# View container logs
docker-compose logs -f blog

# Check container status
docker-compose ps

# Restart services
docker-compose restart

# Rebuild and restart
docker-compose down && docker-compose up -d --build

# Run troubleshooting script
./troubleshoot.sh
```

## 👨‍💻 Author

**Ivan Li**

- Email: <ivanli2048@gmail.com>
- Repository: [git.ivanli.cc/Ivan/blog-astrowind](https://git.ivanli.cc/Ivan/blog-astrowind)

## 📄 License

This project uses dual licensing:

- **Code**: MIT License - see the [LICENSE.md](LICENSE.md) file for details
- **Content**: All blog articles and written content are licensed under [CC BY-NC-ND 4.0](http://creativecommons.org/licenses/by-nc-nd/4.0/)
