"use client";

import Link from "next/link";
import { trpc } from "../../lib/trpc";
import PageLayout from "../common/PageLayout";

export default function AboutPage() {
  const { data: stats } = trpc.posts.stats.useQuery();

  return (
    <PageLayout>
      {/* Main Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Hero Section */}
            <div className="text-center mb-12">
              <div className="avatar mb-6">
                <div className="w-32 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                  <div className="bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-content text-4xl font-bold">
                    I
                  </div>
                </div>
              </div>
              <h1 className="text-5xl font-bold mb-4">你好，我是 Ivan</h1>
              <p className="text-xl text-base-content/70 max-w-2xl mx-auto">
                全栈开发者，技术爱好者，开源贡献者。专注于现代 Web 开发技术，热爱分享知识和经验。
              </p>
            </div>

            {/* About Content */}
            <div className="space-y-8">
              {/* Introduction */}
              <section className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-3xl mb-4">
                    <span className="text-primary">👨‍💻</span>
                    关于我
                  </h2>
                  <div className="prose prose-lg max-w-none">
                    <p>
                      我是一名充满热情的全栈开发者，拥有多年的 Web
                      开发经验。我专注于构建高质量、可扩展的现代 Web 应用程序，
                      并且热衷于学习和分享最新的技术趋势。
                    </p>
                    <p>
                      在我的职业生涯中，我参与了从小型创业公司到大型企业的各种项目，积累了丰富的实战经验。
                      我相信技术应该服务于人，通过优雅的代码和用户友好的界面来解决实际问题。
                    </p>
                    <p>
                      除了编程，我还喜欢写作、阅读和探索新技术。这个博客是我分享技术见解、项目经验和生活感悟的地方。
                    </p>
                  </div>
                </div>
              </section>

              {/* Skills */}
              <section className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-3xl mb-6">
                    <span className="text-secondary">🛠️</span>
                    技术栈
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-xl font-bold mb-3 text-primary">前端技术</h3>
                      <div className="flex flex-wrap gap-2">
                        <span className="badge badge-primary">React</span>
                        <span className="badge badge-primary">Next.js</span>
                        <span className="badge badge-primary">TypeScript</span>
                        <span className="badge badge-primary">Tailwind CSS</span>
                        <span className="badge badge-primary">Vue.js</span>
                        <span className="badge badge-primary">Astro</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-3 text-secondary">后端技术</h3>
                      <div className="flex flex-wrap gap-2">
                        <span className="badge badge-secondary">Node.js</span>
                        <span className="badge badge-secondary">Python</span>
                        <span className="badge badge-secondary">tRPC</span>
                        <span className="badge badge-secondary">Prisma</span>
                        <span className="badge badge-secondary">PostgreSQL</span>
                        <span className="badge badge-secondary">Redis</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-3 text-accent">云服务与工具</h3>
                      <div className="flex flex-wrap gap-2">
                        <span className="badge badge-accent">AWS</span>
                        <span className="badge badge-accent">Vercel</span>
                        <span className="badge badge-accent">Docker</span>
                        <span className="badge badge-accent">GitHub Actions</span>
                        <span className="badge badge-accent">Kubernetes</span>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-3 text-info">其他技能</h3>
                      <div className="flex flex-wrap gap-2">
                        <span className="badge badge-info">Git</span>
                        <span className="badge badge-info">Linux</span>
                        <span className="badge badge-info">Figma</span>
                        <span className="badge badge-info">Photoshop</span>
                        <span className="badge badge-info">技术写作</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Experience */}
              <section className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-3xl mb-6">
                    <span className="text-success">💼</span>
                    工作经历
                  </h2>
                  <div className="space-y-6">
                    <div className="border-l-4 border-primary pl-6">
                      <h3 className="text-xl font-bold text-primary">高级全栈开发工程师</h3>
                      <p className="text-base-content/70 mb-2">科技公司 • 2022 - 至今</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>负责核心产品的前后端开发，服务数万用户</li>
                        <li>设计和实现微服务架构，提升系统可扩展性</li>
                        <li>优化应用性能，页面加载速度提升 40%</li>
                        <li>指导初级开发者，建立代码审查流程</li>
                      </ul>
                    </div>
                    <div className="border-l-4 border-secondary pl-6">
                      <h3 className="text-xl font-bold text-secondary">全栈开发工程师</h3>
                      <p className="text-base-content/70 mb-2">创业公司 • 2020 - 2022</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>从零开始构建公司核心产品</li>
                        <li>负责技术选型和架构设计</li>
                        <li>实现 CI/CD 流程，提升开发效率</li>
                        <li>参与产品设计和用户体验优化</li>
                      </ul>
                    </div>
                    <div className="border-l-4 border-accent pl-6">
                      <h3 className="text-xl font-bold text-accent">前端开发工程师</h3>
                      <p className="text-base-content/70 mb-2">互联网公司 • 2018 - 2020</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>开发和维护多个 Web 应用</li>
                        <li>与设计师和后端工程师紧密合作</li>
                        <li>实现响应式设计和移动端适配</li>
                        <li>参与开源项目贡献</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              {/* Projects */}
              <section className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-3xl mb-6">
                    <span className="text-warning">🚀</span>
                    项目展示
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="card bg-base-200 shadow-md">
                      <div className="card-body">
                        <h3 className="card-title text-primary">Ivan&apos;s Blog</h3>
                        <p className="text-sm text-base-content/70">
                          基于 Next.js 15 + tRPC + daisyUI 构建的现代化博客系统，
                          支持文章管理、评论系统、管理员后台等功能。
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <span className="badge badge-outline badge-xs">Next.js</span>
                          <span className="badge badge-outline badge-xs">tRPC</span>
                          <span className="badge badge-outline badge-xs">daisyUI</span>
                        </div>
                      </div>
                    </div>
                    <div className="card bg-base-200 shadow-md">
                      <div className="card-body">
                        <h3 className="card-title text-secondary">开源项目</h3>
                        <p className="text-sm text-base-content/70">
                          参与多个开源项目的开发和维护，包括 React 组件库、 Node.js
                          工具包等，累计获得数百个 GitHub Stars。
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <span className="badge badge-outline badge-xs">React</span>
                          <span className="badge badge-outline badge-xs">Node.js</span>
                          <span className="badge badge-outline badge-xs">TypeScript</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Contact */}
              <section className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title text-3xl mb-6">
                    <span className="text-error">📬</span>
                    联系方式
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-xl font-bold mb-3">找到我</h3>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">📧</span>
                          <span>ivan@example.com</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🐙</span>
                          <a href="https://github.com" className="link link-primary">
                            GitHub
                          </a>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">💼</span>
                          <a href="https://linkedin.com" className="link link-primary">
                            LinkedIn
                          </a>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🐦</span>
                          <a href="https://twitter.com" className="link link-primary">
                            Twitter
                          </a>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-3">合作机会</h3>
                      <p className="text-base-content/70 mb-4">我对以下类型的合作机会感兴趣：</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>技术咨询和架构设计</li>
                        <li>开源项目合作</li>
                        <li>技术分享和演讲</li>
                        <li>产品开发合作</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">📊 博客统计</h3>
                  <div className="stats stats-vertical shadow">
                    <div className="stat">
                      <div className="stat-title">总文章数</div>
                      <div className="stat-value text-primary">{stats?.total || 0}</div>
                    </div>
                    <div className="stat">
                      <div className="stat-title">分类数量</div>
                      <div className="stat-value text-secondary">
                        {stats?.categories.length || 0}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">⏰ 近期动态</h3>
                  <ul className="timeline timeline-vertical">
                    <li>
                      <div className="timeline-start">2024</div>
                      <div className="timeline-middle">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.236 4.53L8.23 10.661a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div className="timeline-end timeline-box">博客系统迁移到 Next.js 15</div>
                    </li>
                    <li>
                      <div className="timeline-start">2023</div>
                      <div className="timeline-middle">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.236 4.53L8.23 10.661a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div className="timeline-end timeline-box">开始技术博客写作</div>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Back to Home */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <Link href="/" className="btn btn-primary w-full">
                    🏠 返回首页
                  </Link>
                  <Link href="/posts" className="btn btn-outline w-full">
                    📚 浏览文章
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
