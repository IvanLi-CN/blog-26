import { getPlaybookPolicies, playbookHref, rewritePlaybookUrl } from "@/lib/playbook/navigation";
import { createPlaybookContents } from "@/lib/playbook/outline";
import type {
  PlaybookDocSection,
  PlaybookEdition,
  PlaybookPolicySkillDetail,
  PlaybookPublicProjectDetail,
  PlaybookPublicTopicDetail,
} from "@/lib/playbook/types";
import { getPlaybookStatusNotice } from "@/lib/playbook/visitor-reading";
import { toPublicSitePath } from "@/lib/public-runtime-url";
import MarkdownRenderer from "../common/MarkdownRenderer";
import Icon from "../ui/Icon";
import { PlaybookContents, PlaybookMobileNavigation } from "./PlaybookNavigation";
import PlaybookResourceBrowser from "./PlaybookResourceBrowser";

const groups = [
  {
    key: "topics",
    title: "主题",
    eyebrow: "Topics",
    description: "技术选型与工程习惯的主题指南。",
    icon: "tabler:book-2",
  },
  {
    key: "projects",
    title: "项目实践",
    eyebrow: "Projects",
    description: "从实际项目中提炼的结构、取舍与实践。",
    icon: "tabler:briefcase-2",
  },
  {
    key: "policies",
    title: "规则",
    eyebrow: "Policy Skills",
    description: "可阅读、复制和手动安装的工程规则。",
    icon: "tabler:shield-check",
  },
] as const;

type PlaybookGroupKey = (typeof groups)[number]["key"];
type PlaybookListItem = {
  slug: string;
  title: string;
  description?: string | null;
  labels: string[];
};

const href = (path: string) => toPublicSitePath(path) ?? path;

function getGroupItems(edition: PlaybookEdition, key: PlaybookGroupKey): PlaybookListItem[] {
  if (key === "topics") {
    return edition.catalog.snapshot.topics.map((item) => ({
      slug: item.slug,
      title: item.token,
      description: item.description,
      labels: item.categories,
    }));
  }
  if (key === "projects") {
    return edition.catalog.snapshot.projects.map((item) => ({
      slug: item.slug,
      title: item.name,
      description: item.description,
      labels: item.tags,
    }));
  }
  return getPlaybookPolicies(edition.catalog).map((item) => ({
    slug: item.summary.slug,
    title: item.summary.name,
    description: item.summary.description,
    labels: [item.summary.primary_topic],
  }));
}

function groupFor(key: string | undefined) {
  return groups.find((item) => item.key === key);
}

export function resolvePlaybookTitle(edition: PlaybookEdition | undefined, path: string) {
  if (!path) return "执念";
  const [group, slug, extra] = path.replace(/\/$/u, "").split("/");
  if (extra || !groups.some((item) => item.key === group)) return undefined;
  if (!slug) return groupFor(group)?.title;
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
    <div className="grid min-w-0 grid-cols-1 gap-10 sm:gap-12">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-28">
          <h2 className="mb-4 font-heading text-2xl font-semibold tracking-normal text-[color:var(--nature-text)]">
            {section.title}
          </h2>
          <MarkdownRenderer
            content={section.markdown}
            headingAnchorPrefix={section.id}
            variant="article"
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

function policyResourceLinks(policy: PlaybookPolicySkillDetail, edition: PlaybookEdition) {
  const base = `/_content/playbook/${encodeURIComponent(edition.edition.source.tag)}/${edition.edition.editionDigest}/policies/${policy.summary.slug}/`;
  const consoleRuntime = typeof process !== "undefined" && process.env?.CONSOLE_RUNTIME === "true";
  const resourceHref = (path: string) =>
    consoleRuntime
      ? `/api/public/playbook/resource?edition=${edition.edition.editionDigest}&sourceReleaseId=${encodeURIComponent(edition.edition.source.releaseId)}&sourceTag=${encodeURIComponent(edition.edition.source.tag)}&policy=${policy.summary.slug}&path=${encodeURIComponent(path)}`
      : href(`${base}${path.split("/").map(encodeURIComponent).join("/")}`);
  return { base, resourceHref };
}

function PolicyContent({
  policy,
  edition,
}: {
  policy: PlaybookPolicySkillDetail;
  edition: PlaybookEdition;
}) {
  const { base, resourceHref } = policyResourceLinks(policy, edition);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-10 sm:gap-12">
      <section id="instructions" className="min-w-0 scroll-mt-28">
        <MarkdownRenderer
          content={policy.instruction_markdown}
          headingAnchorPrefix="instructions"
          variant="article"
          mapContentUrl={(url) => rewritePlaybookUrl(url, base, resourceHref)}
          rewritePublicSitePaths
          enableCodeFolding={false}
          enableMermaid={false}
        />
      </section>
      <section id="installation" className="scroll-mt-28">
        <h2 className="font-heading text-2xl font-semibold">手动安装</h2>
        <p className="nature-muted mt-4 leading-7">
          将指令保存为技能目录中的 SKILL.md，并保持下列资源的相对路径。阅读与下载不会执行安装。
        </p>
        <a
          className="nature-button nature-button-primary mt-5 inline-flex"
          href={resourceHref("SKILL.md")}
          download
        >
          下载 SKILL.md
        </a>
      </section>
      {policy.summary.policy_dependencies.length > 0 && (
        <section id="dependencies" className="scroll-mt-28">
          <h2 className="font-heading text-xl font-semibold">依赖规则</h2>
          <ul className="mt-4 grid gap-2">
            {policy.summary.policy_dependencies.map((slug) => (
              <li key={slug}>
                <a
                  className="text-sm text-[color:var(--nature-accent-strong)] transition-colors hover:text-[color:var(--nature-text)]"
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

function PolicyResources({
  policy,
  edition,
}: {
  policy: PlaybookPolicySkillDetail;
  edition: PlaybookEdition;
}) {
  const { resourceHref } = policyResourceLinks(policy, edition);
  return (
    <section
      id="resources"
      aria-labelledby={`policy-${policy.summary.slug}-resources-title`}
      className="nature-panel nature-mobile-reading-surface min-w-0 px-4 py-5 sm:px-8 sm:py-7 lg:col-span-2"
    >
      <PlaybookResourceBrowser
        id={`policy-${policy.summary.slug}-resources`}
        files={[
          {
            path: "SKILL.md",
            kind: "markdown",
            content: `---\n${JSON.stringify(policy.frontmatter, null, 2)}\n---\n\n${policy.instruction_markdown}\n`,
          },
          ...policy.resources,
        ]}
        resourceHref={resourceHref}
      />
    </section>
  );
}

function ContentEntry({
  icon,
  category,
  title,
  description,
  labels = [],
  url,
}: {
  icon: string;
  category?: string;
  title: string;
  description?: string | null;
  labels?: string[];
  url: string;
}) {
  return (
    <li className="nature-hover-hitbox group nature-mobile-reading-row min-w-0" data-playbook-entry>
      <a
        href={url}
        aria-label={title}
        className="nature-panel nature-panel-soft nature-hover-lift nature-hover-surface nature-mobile-reading-surface block px-5 py-6 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--nature-accent-strong)] [--nature-hover-border-color:rgba(var(--nature-accent-rgb),0.3)] [--nature-hover-lift-offset:0rem] [--nature-hover-shadow:0_22px_42px_rgba(8,21,16,0.14)] sm:px-6 sm:[--nature-hover-lift-offset:-0.125rem]"
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h2 className="nature-title flex min-w-0 flex-1 items-start gap-2 text-xl font-semibold transition-colors group-hover:text-[color:var(--nature-accent-strong)]">
            <span
              className="inline-flex h-7 w-5 shrink-0 items-center text-[color:var(--nature-accent-strong)]"
              aria-hidden="true"
            >
              <Icon name={icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 break-words">{title}</span>
          </h2>
          {category && (
            <span className="shrink-0 text-sm text-[color:var(--nature-text-soft)]">
              {category}
            </span>
          )}
        </div>
        {description && (
          <p className="nature-muted mt-3 w-full max-w-none break-words text-base leading-7">
            {description}
          </p>
        )}
        {labels.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {labels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.24)] px-2.5 py-1 text-sm font-medium text-[color:var(--nature-text-soft)]"
              >
                <Icon
                  name="tabler:hash"
                  className="hidden h-3 w-3 text-[color:var(--nature-accent-strong)] sm:block"
                />
                {label}
              </span>
            ))}
          </div>
        )}
      </a>
    </li>
  );
}

function PlaybookDetail({
  edition,
  group,
  title,
  description,
  topic,
  project,
  policy,
}: {
  edition: PlaybookEdition;
  group: (typeof groups)[number];
  title: string;
  description: string;
  topic?: PlaybookPublicTopicDetail;
  project?: PlaybookPublicProjectDetail;
  policy?: PlaybookPolicySkillDetail;
}) {
  const sections = topic?.sections ?? project?.sections ?? [];
  const statusNotice = getPlaybookStatusNotice(topic?.doc_metadata ?? project?.doc_metadata);
  const labels = topic?.item.categories ?? project?.item.tags ?? [];
  const contents = policy
    ? [
        ...createPlaybookContents([
          { id: "instructions", title: "规则正文", markdown: policy.instruction_markdown },
        ]),
        { id: "installation", title: "手动安装" },
        ...(policy.summary.policy_dependencies.length > 0
          ? [{ id: "dependencies", title: "依赖规则" }]
          : []),
        ...(policy.resources.length > 0 ? [{ id: "resources", title: "公开资源" }] : []),
      ]
    : createPlaybookContents(sections);
  const related: (PlaybookListItem & { group: PlaybookGroupKey })[] = topic
    ? [
        ...getGroupItems(edition, "projects")
          .filter((item) => topic.item.related_projects.some((ref) => ref.slug === item.slug))
          .map((item) => ({ ...item, group: "projects" as const })),
        ...topic.policy_skills.map(({ summary }) => ({
          slug: summary.slug,
          title: summary.name,
          description: summary.description,
          labels: [],
          group: "policies" as const,
        })),
      ]
    : edition.catalog.snapshot.topics
        .filter((item) =>
          project
            ? item.related_projects.some((ref) => ref.slug === project.item.slug)
            : item.slug === policy?.summary.primary_topic
        )
        .map((item) => ({
          slug: item.slug,
          title: item.token,
          description: item.description,
          labels: [],
          group: "topics" as const,
        }));

  return (
    <article
      className="mx-auto min-w-0 max-w-6xl [--playbook-outline-top:9rem] [&_h2]:tracking-normal [&_h3]:tracking-normal [&_section[id]]:scroll-mt-[var(--playbook-outline-top)]"
      data-playbook-detail
    >
      <nav
        className="mb-5 flex min-h-11 items-center gap-2 px-2 text-sm text-[color:var(--nature-text-soft)] sm:mb-6 sm:px-0"
        aria-label="当前位置"
      >
        <a
          className="inline-flex min-h-11 items-center gap-2 transition-colors hover:text-[color:var(--nature-accent-strong)]"
          href={href("/playbook/")}
        >
          <Icon name="tabler:arrow-left" className="h-4 w-4" />
          执念
        </a>
        <span aria-hidden="true" className="px-1 text-[color:var(--nature-text-faint)]">
          /
        </span>
        <a
          className="inline-flex min-h-11 items-center transition-colors hover:text-[color:var(--nature-accent-strong)]"
          href={href(`/playbook/${group.key}/`)}
        >
          {group.title}
        </a>
      </nav>

      <div className="grid min-w-0 items-start gap-y-6 sm:gap-y-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-x-10">
        <header className="nature-surface nature-mobile-reading-surface px-4 py-5 sm:px-8 sm:py-7 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
            <span className="nature-chip nature-chip-accent gap-1.5">
              <Icon name={group.icon} className="h-3.5 w-3.5" />
              {group.title}
            </span>
          </div>
          <h1 className="mt-5 break-words font-heading text-3xl font-semibold leading-tight tracking-[-0.02em] text-[color:var(--nature-text)] sm:text-4xl md:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="nature-muted mt-5 max-w-3xl text-base leading-8 sm:text-lg">
              {description}
            </p>
          )}
          {labels.length > 0 && (
            <ul className="mt-5 flex list-none flex-wrap gap-2 p-0" aria-label="内容标签">
              {labels.map((label) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.24)] px-2.5 py-1 text-sm font-medium text-[color:var(--nature-text-soft)]"
                >
                  <Icon
                    name="tabler:hash"
                    className="h-3 w-3 text-[color:var(--nature-accent-strong)]"
                  />
                  {label}
                </li>
              ))}
            </ul>
          )}
          {statusNotice && (
            <p className="nature-muted mt-4 text-sm leading-6" role="status">
              {statusNotice}
            </p>
          )}
        </header>
        {contents.length > 0 && <PlaybookMobileNavigation contents={contents} />}
        <div
          className="nature-panel nature-hover-lift nature-mobile-reading-surface min-w-0 px-4 py-5 sm:px-8 sm:py-7 lg:col-start-1 lg:row-start-2"
          data-playbook-body
        >
          {project && project.stack != null && (
            <details className="mb-8 border-b border-[color:var(--nature-line)] pb-6">
              <summary className="min-h-11 cursor-pointer py-2.5 font-medium text-[color:var(--nature-text-soft)]">
                技术栈
              </summary>
              <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-all text-sm leading-7">
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
        </div>

        {contents.length > 0 && (
          <aside
            className="hidden min-w-0 lg:col-start-2 lg:row-start-2 lg:block lg:self-stretch"
            data-playbook-desktop-contents
          >
            <div
              className="lg:sticky lg:top-[var(--playbook-outline-top)]"
              data-playbook-contents-sticky
            >
              <div
                className="nature-panel nature-hover-lift max-h-[calc(100dvh-var(--playbook-outline-top)-1.5rem)] overflow-y-auto overscroll-contain px-5 py-5"
                data-playbook-contents-panel
              >
                <h2 className="mb-3 border-b border-[color:var(--nature-line)] pb-3 text-sm font-medium text-[color:var(--nature-text-soft)]">
                  目录
                </h2>
                <div className="-mx-3">
                  <PlaybookContents contents={contents} />
                </div>
              </div>
            </div>
          </aside>
        )}
        {policy && policy.resources.length > 0 && (
          <PolicyResources policy={policy} edition={edition} />
        )}
        {related.length > 0 && (
          <section
            className="mt-2 border-t border-[color:var(--nature-line)] pt-8 sm:mt-4 lg:col-start-1"
            aria-labelledby="playbook-related-title"
          >
            <h2
              id="playbook-related-title"
              className="mb-5 px-2 font-heading text-2xl font-semibold text-[color:var(--nature-text)] sm:px-0"
            >
              相关内容
            </h2>
            <ul className="nature-mobile-reading-stream m-0 grid list-none gap-4 p-0">
              {related.map((item) => {
                const itemGroup = groupFor(item.group);
                return (
                  <li
                    key={`${item.group}/${item.slug}`}
                    className="nature-hover-hitbox group nature-mobile-reading-row min-w-0"
                  >
                    <a
                      href={href(`/playbook/${item.group}/${item.slug}/`)}
                      aria-label={item.title}
                      className="nature-panel nature-panel-soft nature-hover-lift nature-hover-surface nature-mobile-reading-surface block px-5 py-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--nature-accent-strong)] [--nature-hover-lift-offset:0rem] sm:px-6 sm:[--nature-hover-lift-offset:-0.125rem]"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                        <h3 className="nature-title flex min-w-0 flex-1 items-start gap-2 text-lg font-semibold transition-colors group-hover:text-[color:var(--nature-accent-strong)]">
                          <span
                            className="inline-flex h-7 w-5 shrink-0 items-center text-[color:var(--nature-accent-strong)]"
                            aria-hidden="true"
                          >
                            <Icon name={itemGroup?.icon ?? "tabler:book-2"} className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 break-words">{item.title}</span>
                        </h3>
                        <span className="text-sm text-[color:var(--nature-text-soft)]">
                          {itemGroup?.title}
                        </span>
                      </div>
                      {item.description && (
                        <p className="nature-muted mt-2 break-words text-sm leading-7">
                          {item.description}
                        </p>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </article>
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
  const groupMeta = groupFor(group);
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
  const description =
    topic?.item.description ??
    project?.item.description ??
    policy?.summary.description ??
    "把技术选型、实际项目实践与可复用规则放在一起阅读。";
  const isDetail = Boolean(group && slug);
  const groupItems = edition && groupMeta ? getGroupItems(edition, groupMeta.key) : [];
  const directoryItems = edition
    ? groupMeta
      ? groupItems.map((item) => ({ ...item, group: groupMeta.key }))
      : groups.flatMap((item) =>
          getGroupItems(edition, item.key).map((entry) => ({ ...entry, group: item.key }))
        )
    : [];
  const introDescription = !isDetail && groupMeta ? groupMeta.description : description;
  const pageClassName = isDetail
    ? "nature-detail-container min-w-0 px-2 py-8 sm:px-6 sm:py-10 lg:py-12"
    : "nature-container min-w-0 px-1 py-10 sm:px-6 sm:py-16 lg:py-20";

  return (
    <div className="[container-type:inline-size] [--nature-reading-viewport-width:100cqw] [--nature-reading-viewport-half-width:50cqw]">
      <section
        className={pageClassName}
        data-playbook-page
        data-playbook-edition={edition?.edition.editionDigest}
      >
        {isDetail ? (
          edition && title && groupMeta ? (
            <PlaybookDetail
              edition={edition}
              group={groupMeta}
              title={title}
              description={description}
              topic={topic}
              project={project}
              policy={policy || undefined}
            />
          ) : null
        ) : (
          <header className="mb-8 text-center sm:mb-12">
            <a className="nature-kicker justify-center" href={href("/playbook/")}>
              Style Playbook
            </a>
            <h1 className="nature-title mt-4 break-words text-4xl sm:text-5xl lg:text-6xl">
              {title ?? "内容未找到"}
            </h1>
            <p className="nature-muted mx-auto mt-4 max-w-2xl text-base leading-8 sm:text-lg">
              {introDescription}
            </p>
          </header>
        )}

        {!isDetail && (
          <div
            className="@container mb-10 flex min-w-0 justify-center overflow-x-auto px-0 py-1"
            aria-label="执念分类"
            role="tablist"
          >
            <div className="flex min-w-max items-center justify-center gap-1 sm:gap-2">
              <a
                href={href("/playbook/")}
                role="tab"
                aria-selected={!group}
                aria-current={!group ? "page" : undefined}
                className="nature-hover-hitbox nature-hover-hitbox-inline group rounded-[var(--nature-radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent-strong)]"
              >
                <span
                  data-playbook-tab-surface
                  className={`nature-hover-lift nature-hover-surface inline-flex min-h-11 items-center gap-2 rounded-[var(--nature-radius-sm)] px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-200 [--nature-hover-lift-offset:-0.125rem] group-hover:bg-[rgba(var(--nature-highlight-rgb),0.2)] group-hover:text-[color:var(--nature-accent-strong)] sm:px-3.5 ${!group ? "bg-[rgba(var(--nature-accent-rgb),0.16)] text-[color:var(--nature-accent-strong)] shadow-[inset_0_1px_0_rgba(var(--nature-highlight-rgb),0.28)]" : "text-[color:var(--nature-text-soft)]"}`}
                >
                  <span
                    className="hidden h-4 w-4 shrink-0 @min-[344px]:inline-flex"
                    aria-hidden="true"
                  >
                    <Icon name="tabler:layout-grid" className="h-4 w-4" />
                  </span>
                  全部
                </span>
              </a>
              {groups.map((item) => (
                <a
                  key={item.key}
                  href={href(`/playbook/${item.key}/`)}
                  role="tab"
                  aria-selected={group === item.key}
                  aria-current={group === item.key ? "page" : undefined}
                  className="nature-hover-hitbox nature-hover-hitbox-inline group rounded-[var(--nature-radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--nature-accent-strong)]"
                >
                  <span
                    data-playbook-tab-surface
                    className={`nature-hover-lift nature-hover-surface inline-flex min-h-11 items-center gap-2 rounded-[var(--nature-radius-sm)] px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-200 [--nature-hover-lift-offset:-0.125rem] group-hover:bg-[rgba(var(--nature-highlight-rgb),0.2)] group-hover:text-[color:var(--nature-accent-strong)] sm:px-3.5 ${group === item.key ? "bg-[rgba(var(--nature-accent-rgb),0.16)] text-[color:var(--nature-accent-strong)] shadow-[inset_0_1px_0_rgba(var(--nature-highlight-rgb),0.28)]" : "text-[color:var(--nature-text-soft)]"}`}
                  >
                    <span
                      className="hidden h-4 w-4 shrink-0 @min-[344px]:inline-flex"
                      aria-hidden="true"
                    >
                      <Icon name={item.icon} className="h-4 w-4" />
                    </span>
                    {item.title}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {!edition ? (
          <div className="nature-empty" role="status">
            <h2 className="font-heading text-xl font-semibold">执念暂不可用</h2>
            <p className="nature-muted">内容就绪后会在这里提供完整目录。</p>
          </div>
        ) : !title ? (
          <div className="nature-empty" role="status">
            <p>未找到这篇公开内容。</p>
          </div>
        ) : !slug ? (
          <ul
            className="nature-mobile-reading-stream m-0 grid list-none gap-6 p-0"
            aria-label="执念内容"
          >
            {directoryItems.map((item) => {
              const itemGroup = groupFor(item.group);
              return (
                <ContentEntry
                  key={`${item.group}/${item.slug}`}
                  icon={itemGroup?.icon ?? "tabler:book-2"}
                  category={groupMeta ? undefined : itemGroup?.title}
                  title={item.title}
                  description={item.description}
                  labels={item.labels}
                  url={href(`/playbook/${item.group}/${item.slug}/`)}
                />
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
