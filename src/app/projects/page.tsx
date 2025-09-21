import PageLayout from "@/components/common/PageLayout";
import ProjectCard from "@/components/home/ProjectCard";
import Icon from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

const featuredProjects = [
  { title: "智能聊天机器人平台", href: "/projects/chatbot-platform", category: "AI" },
  { title: "微服务架构实践", href: "/projects/microservices", category: "架构" },
  { title: "个人博客系统", href: "/projects/blog-system", category: "前端" },
  { title: "数据可视化大屏", href: "/projects/data-viz", category: "可视化" },
  { title: "AI代码审查工具", href: "/projects/code-review", category: "工具" },
  { title: "性能监控系统", href: "/projects/performance", category: "监控" },
];

export default function ProjectsPage() {
  return (
    <PageLayout>
      <section className="px-3 sm:px-4 md:px-6 py-6 md:py-8 mx-auto max-w-6xl">
        <div className="flex items-center gap-2 mb-6">
          <Icon name="tabler:code" className="w-6 h-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold">项目总览</h1>
        </div>
        <p className="text-base-content/70 mb-6">
          这里展示了一些示例项目条目。实际项目内容尚在建设中。
        </p>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {featuredProjects.map((project) => (
            <ProjectCard
              key={project.href}
              title={project.title}
              href={project.href}
              category={project.category}
            />
          ))}
        </div>
      </section>
    </PageLayout>
  );
}
