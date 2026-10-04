import { useEffect, useRef } from "react";
import {
  createPlaybookFileTree,
  highlightPlaybookFile,
  type PlaybookFileNode,
  parsePlaybookMarkdownFile,
  playbookFileLanguage,
  resolvePlaybookFileLink,
} from "@/lib/playbook/resources";
import type { PlaybookPolicySkillResource } from "@/lib/playbook/types";
import { attachPlaybookResourceBrowser } from "@/lib/public-playbook-resources";
import MarkdownRenderer from "../common/MarkdownRenderer";
import Icon from "../ui/Icon";
import "@/styles/playbook-resources.css";

type Props = {
  files: PlaybookPolicySkillResource[];
  id: string;
  resourceHref: (path: string) => string;
};

function FileTree({
  nodes,
  id,
  selected,
}: {
  nodes: PlaybookFileNode[];
  id: string;
  selected: number;
}) {
  return (
    <ul className="playbook-file-tree-list">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.children ? (
            <details open>
              <summary className="playbook-file-directory" title={node.path}>
                <Icon name="tabler:chevron-right" className="playbook-file-chevron h-3.5 w-3.5" />
                <Icon name="tabler:folder" className="h-4 w-4" />
                <span>{node.name}</span>
              </summary>
              <FileTree nodes={node.children} id={id} selected={selected} />
            </details>
          ) : (
            <a
              href={`#${id}-file-${node.index}`}
              data-playbook-file={node.index}
              aria-current={node.index === selected ? "true" : undefined}
              title={node.path}
              className="playbook-file-link"
            >
              <Icon
                name={
                  playbookFileLanguage(node.path) === "markdown"
                    ? "tabler:file-text"
                    : "tabler:file-code"
                }
                className="h-4 w-4"
              />
              <span>{node.name}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function PlaybookResourceBrowser({ files, id, resourceHref }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? attachPlaybookResourceBrowser(ref.current) : undefined), []);
  if (!files.length) return <p className="nature-muted">此规则没有附带文件。</p>;
  const initial = Math.max(
    0,
    files.findIndex((file) => file.path !== "SKILL.md")
  );
  return (
    <div
      ref={ref}
      className="playbook-resource-browser"
      data-playbook-resource-browser
      data-initial-file={initial}
    >
      <div className="playbook-resource-workspace" data-playbook-resource-workspace>
        <div className="playbook-resource-heading">
          <h2 id={`${id}-title`} className="font-heading text-2xl font-semibold">
            公开资源
          </h2>
          <button
            type="button"
            data-playbook-resource-expand
            className="playbook-file-icon-button playbook-file-js"
            aria-label="放大公开资源"
            title="放大公开资源"
            aria-controls={`${id}-fullscreen`}
            aria-haspopup="dialog"
            aria-expanded="false"
          >
            <Icon name="tabler:arrows-maximize" className="playbook-resource-maximize h-5 w-5" />
            <Icon name="tabler:arrows-minimize" className="playbook-resource-minimize h-5 w-5" />
          </button>
        </div>
        <div className="playbook-resource-layout">
          <aside className="playbook-file-sidebar" id={`${id}-tree`} aria-label="文件树">
            <div className="playbook-file-sidebar-heading">
              <span>文件</span>
              <button
                type="button"
                data-playbook-tree-close
                className="playbook-file-icon-button playbook-file-js"
                aria-label="关闭文件树"
              >
                <Icon name="tabler:x" className="h-4 w-4" />
              </button>
            </div>
            <nav aria-label="Skill 文件">
              <FileTree nodes={createPlaybookFileTree(files)} id={id} selected={initial} />
            </nav>
          </aside>
          <div className="playbook-file-window">
            {files.map((file, index) => {
              const language = playbookFileLanguage(file.path);
              const markdown = language === "markdown";
              const reading = markdown ? parsePlaybookMarkdownFile(file.content) : undefined;
              const highlighted = highlightPlaybookFile(file.content, language);
              return (
                <details
                  key={file.path}
                  id={`${id}-file-${index}`}
                  data-playbook-file-panel={index}
                  className="playbook-file-panel"
                  open={index === initial}
                >
                  <summary className="playbook-file-fallback-summary">{file.path}</summary>
                  <div className="playbook-file-preview">
                    <div className="playbook-file-toolbar">
                      <button
                        type="button"
                        data-playbook-tree-open
                        className="playbook-file-icon-button playbook-file-js"
                        aria-label="展开文件树"
                        aria-controls={`${id}-tree`}
                        aria-expanded="true"
                      >
                        <Icon name="tabler:list-tree" className="h-4 w-4" />
                      </button>
                      <span className="playbook-file-path" title={file.path} tabIndex={-1}>
                        {file.path}
                      </span>
                      <a
                        href={resourceHref(file.path)}
                        download
                        className="playbook-file-icon-button"
                        aria-label={`下载 ${file.path}`}
                        title="下载文件"
                      >
                        <Icon name="tabler:download" className="h-4 w-4" />
                      </a>
                    </div>
                    <div className="playbook-file-meta">
                      <span>
                        {language === "text" ? "纯文本" : language} ·{" "}
                        {file.content.split("\n").length} 行
                      </span>
                      {markdown && (
                        <fieldset className="playbook-file-view-controls playbook-file-js">
                          <legend className="sr-only">预览方式</legend>
                          <button type="button" data-playbook-file-view="read" aria-pressed="true">
                            阅读
                          </button>
                          <button
                            type="button"
                            data-playbook-file-view="source"
                            aria-pressed="false"
                          >
                            源码
                          </button>
                        </fieldset>
                      )}
                    </div>
                    {reading && (
                      <section
                        className="playbook-file-reading"
                        aria-label={`${file.path} 阅读`}
                        data-playbook-file-reading
                        // biome-ignore lint/a11y/noNoninteractiveTabindex: The reading region scrolls independently and needs keyboard access.
                        tabIndex={0}
                      >
                        {reading.metadata.length > 0 && (
                          <dl className="playbook-file-frontmatter" aria-label="文件元数据">
                            {reading.metadata.map(([key, value]) => (
                              <div key={key}>
                                <dt>{key}</dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {reading.unparsedFrontmatter !== undefined && (
                          <div className="playbook-file-frontmatter">
                            <p className="nature-muted mb-2 text-sm">
                              文件元数据无法解析，已保留原文。
                            </p>
                            <code className="playbook-file-frontmatter-raw">
                              {reading.unparsedFrontmatter}
                            </code>
                          </div>
                        )}
                        <MarkdownRenderer
                          content={reading.body}
                          variant="article"
                          enableMermaid={false}
                          enableCodeFolding={false}
                          enableImageLightbox={false}
                          rewritePublicSitePaths
                          mapContentUrl={(url) => {
                            const target = resolvePlaybookFileLink(file.path, url, files);
                            return target === undefined ? url : `#${id}-file-${target}`;
                          }}
                        />
                      </section>
                    )}
                    <section
                      className="playbook-file-source"
                      aria-label={`${file.path} 源码`}
                      data-markdown-surface="public"
                      data-playbook-file-source
                      hidden={markdown}
                    >
                      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll long source files. */}
                      <pre tabIndex={0}>
                        <code
                          className={`hljs language-${language}`}
                          {...(highlighted !== undefined
                            ? { dangerouslySetInnerHTML: { __html: highlighted } }
                            : { children: file.content })}
                        />
                      </pre>
                    </section>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </div>
      <dialog
        id={`${id}-fullscreen`}
        className="playbook-resource-fullscreen"
        data-playbook-resource-fullscreen
        aria-labelledby={`${id}-title`}
      />
    </div>
  );
}
