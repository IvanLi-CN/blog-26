import type { CSSProperties } from "react";
import type { PlaybookContentsItem } from "@/lib/playbook/outline";
import Icon from "../ui/Icon";
import "@/lib/iconify-collections";
import "@/styles/playbook-navigation.css";

function ContentsList({
  contents,
  depth = 0,
  parentId,
}: {
  contents: PlaybookContentsItem[];
  depth?: number;
  parentId?: string;
}) {
  return (
    <ul className="playbook-contents-list">
      {contents.map((section) => (
        <li key={section.id}>
          <a
            className="playbook-contents-link"
            style={{ "--playbook-contents-depth": Math.min(depth, 3) } as CSSProperties}
            data-playbook-contents-link
            data-playbook-contents-depth={depth}
            data-playbook-contents-parent={parentId}
            href={`#${encodeURIComponent(section.id)}`}
            target="_self"
          >
            <span className="playbook-contents-label">{section.title}</span>
          </a>
          {!!section.children?.length && (
            <ContentsList contents={section.children} depth={depth + 1} parentId={section.id} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function PlaybookContents({
  contents,
  label = "本页内容",
  className,
}: {
  contents: PlaybookContentsItem[];
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ContentsList contents={contents} />
    </nav>
  );
}

export function PlaybookMobileNavigation({ contents }: { contents: PlaybookContentsItem[] }) {
  return (
    <>
      <section
        className="nature-panel nature-mobile-reading-surface min-w-0 px-4 py-5 sm:px-8 sm:py-6 lg:hidden"
        aria-labelledby="playbook-mobile-contents-title"
        data-playbook-mobile-contents
      >
        <h2
          id="playbook-mobile-contents-title"
          className="playbook-mobile-contents-title font-heading"
          tabIndex={-1}
        >
          <Icon name="tabler:list-tree" className="h-5 w-5" />
          <span>目录</span>
        </h2>
        <div className="-mx-3">
          <PlaybookContents
            contents={contents}
            className="playbook-inline-contents playbook-mobile-outline"
          />
        </div>
      </section>

      {/* The controller clones this hidden source into body to escape reading containment. */}
      <div className="playbook-mobile-floating" data-playbook-floating-source hidden inert>
        <section
          className="playbook-mobile-floating-panel"
          data-playbook-floating-panel
          aria-label="悬浮目录"
          aria-hidden="true"
          inert
        >
          <header className="playbook-mobile-floating-panel-header">
            <h2 className="playbook-mobile-floating-title">
              <Icon name="tabler:list-tree" className="h-4 w-4" />
              <span>目录</span>
            </h2>
            <button
              type="button"
              className="playbook-mobile-floating-close"
              aria-label="关闭目录"
              data-playbook-floating-close
            >
              <Icon name="tabler:x" className="h-4 w-4" />
            </button>
          </header>
          <PlaybookContents
            contents={contents}
            label="悬浮章节导航"
            className="playbook-mobile-floating-list playbook-mobile-outline"
          />
        </section>
        <fieldset
          className="nature-panel nature-hover-lift playbook-mobile-floating-group"
          aria-label="阅读导航"
          data-playbook-floating-group
        >
          <button
            type="button"
            className="playbook-mobile-floating-button"
            aria-label="打开目录"
            aria-expanded="false"
            data-playbook-floating-toggle
          >
            <Icon name="tabler:list-tree" className="h-5 w-5" />
            <span>目录</span>
          </button>
          <span className="playbook-mobile-floating-divider" aria-hidden="true" />
          <button
            type="button"
            className="playbook-mobile-floating-button"
            aria-label="回到顶部"
            data-playbook-floating-top
          >
            <Icon name="tabler:arrow-up" className="h-5 w-5" />
            <span>顶部</span>
          </button>
        </fieldset>
      </div>
    </>
  );
}
