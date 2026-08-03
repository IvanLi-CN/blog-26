import Icon from "../ui/Icon";
import ThemeToggle from "./ThemeToggle";

const navLinks = [
  { icon: "tabler:notes", text: "闪念", href: "/memos" },
  { icon: "tabler:article", text: "文章", href: "/posts" },
  { icon: "tabler:code", text: "项目", href: "/projects" },
  { icon: "tabler:hash", text: "标签", href: "/tags" },
];

export function PublicStoryHeader({
  activeHref,
  pending = false,
}: {
  activeHref: string;
  pending?: boolean;
}) {
  return (
    <header className="nature-site-header sticky top-0 z-40 w-full flex-none pt-3">
      <div className="nature-container nature-site-header-frame">
        <div className="nature-surface grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-3 py-3 sm:flex sm:flex-wrap sm:gap-3 sm:px-5">
          <a
            href="/"
            className="nature-brand-link min-w-0 pl-1 font-heading text-xl font-semibold tracking-[-0.04em] text-[color:var(--nature-text)] transition-colors hover:text-[color:var(--nature-accent-strong)] sm:min-w-fit sm:text-2xl"
          >
            Ivan's Blog
          </a>

          <nav
            className="order-3 col-span-2 w-full sm:col-auto md:order-2 md:ml-2 md:w-auto"
            aria-label="Main navigation"
          >
            <ul className="flex w-full items-center justify-between gap-0 text-sm font-medium sm:w-auto sm:justify-start sm:gap-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    aria-label={link.text}
                    className={`nature-nav-link gap-1.5 rounded-full px-2.5 transition sm:gap-2 sm:px-4 ${
                      link.href === activeHref
                        ? "aw-link-active"
                        : "text-[color:var(--nature-text-soft)] hover:bg-[rgba(var(--nature-accent-rgb),0.1)] hover:text-[color:var(--nature-accent-strong)]"
                    }`}
                  >
                    <Icon name={link.icon} className="h-4 w-4" />
                    <span className="nature-nav-link-label">{link.text}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="nature-header-tools order-2 ml-0 flex items-center gap-1 sm:ml-auto sm:gap-3 md:order-3">
            <form action="/search" method="get" className="hidden items-center xl:flex">
              <label className="nature-input-shell nature-header-search min-w-[18rem] 2xl:min-w-[20rem]">
                <Icon
                  name="tabler:search"
                  className="h-5 w-5 text-[color:var(--nature-text-faint)]"
                />
                <input type="text" name="q" placeholder="搜索文章..." className="nature-input" />
              </label>
            </form>
            {activeHref !== "/search" && (
              <a
                href="/search"
                className="nature-icon-button inline-flex xl:hidden"
                aria-label="搜索"
              >
                <Icon name="tabler:search" className="nature-header-tool-icon h-5 w-5" />
              </a>
            )}
            <ThemeToggle compactOnMobile iconClass="h-4 w-4" />
            <a
              className="nature-header-rss-button nature-icon-button inline-flex"
              aria-label="RSS Feed"
              title="RSS Feed"
              href="/feed.xml"
            >
              <Icon name="tabler:rss" className="nature-header-tool-icon h-5 w-5" />
            </a>
          </div>
        </div>

        <div
          id="public-route-loading"
          className="nature-route-loading"
          role="status"
          aria-live="polite"
          aria-label="正在打开页面"
          aria-hidden={pending ? "false" : "true"}
        >
          <span className="nature-route-loading-track" aria-hidden="true">
            <span className="nature-route-loading-bar" />
          </span>
          <span className="nature-route-loading-label">正在打开页面</span>
        </div>
      </div>
    </header>
  );
}
