import { getPlaybookPolicies, playbookHref, rewritePlaybookUrl } from "@/lib/playbook/navigation";
import type {
  PlaybookDocSection,
  PlaybookEdition,
  PlaybookPolicySkillDetail,
} from "@/lib/playbook/types";
import { toPublicSitePath } from "@/lib/public-runtime-url";
import MarkdownRenderer from "../common/MarkdownRenderer";

const groups = [
  { key: "topics", title: "Topics", description: "技术选型与工程习惯的主题指南。" },
  { key: "projects", title: "项目实践", description: "从实际项目中提炼的结构、取舍与实践。" },
  { key: "policies", title: "Policy Skills", description: "可阅读、复制和手动安装的工程规则。" },
];
const href = (path: string) => toPublicSitePath(path) ?? path;

export function resolvePlaybookTitle(edition: PlaybookEdition | undefined, path: string) {
  if (!path) return "执念";
  const [group, slug, extra] = path.replace(/\/$/u, "").split("/");
  if (extra || !groups.some((item) => item.key === group)) return undefined;
  if (!slug) return groups.find((item) => item.key === group)?.title;
  if (!edition) return undefined;
  if (group === "topics")
    return edition.catalog.topic_details.find((item) => item.item.slug === slug)?.item.token;
  if (group === "projects")
    return edition.catalog.project_details.find((item) => item.item.slug === slug)?.title;
  return getPlaybookPolicies(edition.catalog).find((item) => item.summary.slug === slug)?.summary
    .name;
}

function Sections({ sections }: { sections: PlaybookDocSection[] }) {
  return (
    <div className="grid min-w-0 gap-8">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-28">
          <h2 className="mb-4 font-heading text-2xl font-semibold text-[color:var(--nature-text)]">
            {section.title}
          </h2>
          <MarkdownRenderer
            content={section.markdown}
            mapContentUrl={rewritePlaybookUrl}
            rewritePublicSitePaths
            enableCodeFolding={false}
            enableMermaid={false}
          />
        </section>
      ))}
    </div>
  );
}

function PolicyContent({
  policy,
  edition,
}: {
  policy: PlaybookPolicySkillDetail;
  edition: PlaybookEdition;
}) {
  const base = `/_content/playbook/${encodeURIComponent(edition.edition.source.tag)}/${edition.edition.editionDigest}/policies/${policy.summary.slug}/`;
  const consoleRuntime = typeof process !== "undefined" && process.env?.CONSOLE_RUNTIME === "true";
  const resourceHref = (path: string) =>
    consoleRuntime
      ? `/api/public/playbook/resource?edition=${edition.edition.editionDigest}&sourceReleaseId=${encodeURIComponent(edition.edition.source.releaseId)}&sourceTag=${encodeURIComponent(edition.edition.source.tag)}&policy=${policy.summary.slug}&path=${encodeURIComponent(path)}`
      : href(`${base}${path.split("/").map(encodeURIComponent).join("/")}`);
  return (
    <div className="grid gap-8">
      <MarkdownRenderer
        content={policy.instruction_markdown}
        mapContentUrl={(url) => rewritePlaybookUrl(url, base, resourceHref)}
        rewritePublicSitePaths
        enableCodeFolding={false}
        enableMermaid={false}
      />
      <section id="installation">
        <h2 className="font-heading text-2xl font-semibold">手动安装</h2>
        <p className="nature-muted mt-3 leading-7">
          将指令保存为技能目录中的 SKILL.md，并保持下列资源的相对路径。阅读与下载不会执行安装。
        </p>
        <a className="nature-button mt-4 inline-flex" href={resourceHref("SKILL.md")} download>
          下载 SKILL.md
        </a>
      </section>
      {policy.resources.length > 0 && (
        <section id="resources">
          <h2 className="font-heading text-2xl font-semibold">公开资源</h2>
          <ul className="mt-4 grid gap-3">
            {policy.resources.map((resource) => (
              <li key={resource.path}>
                <a
                  className="text-[color:var(--nature-accent-strong)] break-all"
                  href={resourceHref(resource.path)}
                  download
                >
                  {resource.path}
                </a>
                <span className="nature-muted ml-2 text-sm">{resource.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {policy.summary.policy_dependencies.length > 0 && (
        <section>
          <h2 className="font-heading text-xl font-semibold">依赖规则</h2>
          <ul className="mt-3 grid gap-2">
            {policy.summary.policy_dependencies.map((slug) => (
              <li key={slug}>
                <a
                  className="text-[color:var(--nature-accent-strong)]"
                  href={href(playbookHref(`/policies/${slug}`))}
                >
                  {slug}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function PlaybookPage({
  edition,
  path,
}: {
  edition?: PlaybookEdition;
  path: string;
}) {
  const [group, slug] = path.replace(/\/$/u, "").split("/");
  const title = resolvePlaybookTitle(edition, path);
  const topic = edition?.catalog.topic_details.find(
    (item) => group === "topics" && item.item.slug === slug
  );
  const project = edition?.catalog.project_details.find(
    (item) => group === "projects" && item.item.slug === slug
  );
  const policy =
    edition &&
    getPlaybookPolicies(edition.catalog).find(
      (item) => group === "policies" && item.summary.slug === slug
    );
  const sections = topic?.sections ?? project?.sections ?? [];
  const metadata = topic?.doc_metadata ?? project?.doc_metadata ?? [];
  const description =
    topic?.item.description ??
    project?.item.description ??
    policy?.summary.description ??
    "把技术选型、实际项目实践与可复用规则放在一起阅读。";
  const items = edition
    ? group === "topics"
      ? edition.catalog.snapshot.topics.map((item) => ({
          slug: item.slug,
          title: item.token,
          description: item.description,
          labels: item.categories,
        }))
      : group === "projects"
        ? edition.catalog.snapshot.projects.map((item) => ({
            slug: item.slug,
            title: item.name,
            description: item.description,
            labels: item.tags,
          }))
        : getPlaybookPolicies(edition.catalog).map((item) => ({
            slug: item.summary.slug,
            title: item.summary.name,
            description: item.summary.description,
            labels: [item.summary.primary_topic],
          }))
    : [];
  return (
    <div className="[container-type:inline-size] [--nature-reading-viewport-width:100cqw] [--nature-reading-viewport-half-width:50cqw]">
      <section
        className="nature-container min-w-0 px-1 py-10 sm:px-6 sm:py-16"
        data-playbook-page
        data-playbook-edition={edition?.edition.editionDigest}
      >
        <header className="mb-8">
          <a className="nature-kicker" href={href("/playbook/")}>
            Style Playbook
          </a>
          <h1 className="nature-title mt-4 break-words text-4xl leading-tight sm:text-5xl">
            {title ?? "内容未找到"}
          </h1>
          <p className="nature-muted mt-4 max-w-3xl leading-8">{description}</p>
          {edition && (
            <p className="nature-muted mt-3 text-sm">
              内容版本{" "}
              <strong className="text-[color:var(--nature-text)]">
                {edition.edition.source.tag}
              </strong>
              <span className="ml-3">{edition.edition.source.publishedAt.slice(0, 10)}</span>
            </p>
          )}
        </header>
        <nav className="mb-8 flex flex-wrap gap-2" aria-label="执念导航">
          {groups.map((item) => (
            <a
              key={item.key}
              href={href(`/playbook/${item.key}/`)}
              aria-current={group === item.key ? "page" : undefined}
              className={`nature-chip ${group === item.key ? "font-semibold text-[color:var(--nature-accent-strong)]" : ""}`}
            >
              {item.title}
            </a>
          ))}
        </nav>
        {!edition ? (
          <div className="nature-panel p-6" role="status">
            <h2 className="font-heading text-xl font-semibold">执念暂不可用</h2>
            <p className="nature-muted mt-3">公开内容版本就绪后会在这里提供完整目录。</p>
          </div>
        ) : !title ? (
          <p role="status">未找到这篇公开内容。</p>
        ) : !group ? (
          <div className="grid gap-5 md:grid-cols-3">
            {groups.map((item) => (
              <a
                key={item.key}
                href={href(`/playbook/${item.key}/`)}
                className="nature-panel nature-hover-surface p-6"
              >
                <h2 className="font-heading text-2xl font-semibold">{item.title}</h2>
                <p className="nature-muted mt-3 leading-7">{item.description}</p>
                <p className="mt-5 text-[color:var(--nature-accent-strong)]">
                  {item.key === "topics"
                    ? edition.catalog.snapshot.topics.length
                    : item.key === "projects"
                      ? edition.catalog.snapshot.projects.length
                      : getPlaybookPolicies(edition.catalog).length}{" "}
                  项 →
                </p>
              </a>
            ))}
          </div>
        ) : !slug ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <a
                key={item.slug}
                href={href(`/playbook/${group}/${item.slug}/`)}
                className="nature-panel nature-hover-surface min-w-0 p-5 sm:p-6"
              >
                <h2 className="font-heading break-words text-2xl font-semibold">{item.title}</h2>
                <p className="nature-muted mt-3 leading-7">{item.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.labels.map((label) => (
                    <span key={label} className="nature-chip text-xs">
                      {label}
                    </span>
                  ))}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <article className="nature-surface nature-mobile-reading-surface min-w-0 p-5 sm:p-8">
              {metadata.length > 0 && (
                <dl className="nature-muted mb-8 grid gap-3 text-sm">
                  {metadata.map((field) => (
                    <div key={field.key} className="flex flex-wrap gap-2">
                      <dt className="font-semibold">{field.key}</dt>
                      <dd className="break-all">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {project && project.stack != null && (
                <details className="mb-8">
                  <summary className="cursor-pointer font-semibold">技术栈</summary>
                  <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-all text-sm">
                    {typeof project.stack === "string"
                      ? project.stack
                      : JSON.stringify(project.stack, null, 2)}
                  </pre>
                </details>
              )}
              {policy ? (
                <PolicyContent policy={policy} edition={edition} />
              ) : (
                <Sections sections={sections} />
              )}
            </article>
            <aside className="grid gap-6 lg:sticky lg:top-28">
              <nav className="nature-panel p-5" aria-label="本页内容">
                <h2 className="font-heading text-lg font-semibold">本页内容</h2>
                <ul className="mt-4 grid gap-3">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        className="nature-muted text-sm leading-6 hover:text-[color:var(--nature-accent-strong)]"
                        href={`#${encodeURIComponent(section.id)}`}
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                  {policy && (
                    <>
                      <li>
                        <a href="#installation">手动安装</a>
                      </li>
                      {policy.resources.length > 0 && (
                        <li>
                          <a href="#resources">公开资源</a>
                        </li>
                      )}
                    </>
                  )}
                </ul>
              </nav>
              {topic && (
                <section className="nature-panel p-5">
                  <h2 className="font-heading text-lg font-semibold">相关项目实践</h2>
                  <ul className="mt-4 grid gap-3">
                    {topic.item.related_projects.map((item) => (
                      <li key={item.slug}>
                        <a
                          className="text-sm text-[color:var(--nature-accent-strong)]"
                          href={href(`/playbook/projects/${item.slug}/`)}
                        >
                          {item.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {topic.policy_skills.length > 0 && (
                    <>
                      <h3 className="mt-6 font-semibold">Policy Skills</h3>
                      <ul className="mt-3 grid gap-3">
                        {topic.policy_skills.map((item) => (
                          <li key={item.summary.slug}>
                            <a
                              className="text-sm text-[color:var(--nature-accent-strong)]"
                              href={href(`/playbook/policies/${item.summary.slug}/`)}
                            >
                              {item.summary.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )}
              {project && (
                <section className="nature-panel p-5">
                  <h2 className="font-heading text-lg font-semibold">相关 Topics</h2>
                  <ul className="mt-4 grid gap-3">
                    {edition.catalog.snapshot.topics
                      .filter((item) =>
                        item.related_projects.some((ref) => ref.slug === project.item.slug)
                      )
                      .map((item) => (
                        <li key={item.slug}>
                          <a
                            className="text-sm text-[color:var(--nature-accent-strong)]"
                            href={href(`/playbook/topics/${item.slug}/`)}
                          >
                            {item.token}
                          </a>
                        </li>
                      ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
