import ThemeToggle from "@/components/common/ThemeToggle";
import Icon from "@/components/ui/Icon";
import { headerData } from "@/config/navigation";
import { SITE } from "@/config/site";
import { cssStyle } from "../lib/react-template";
import { toPublicSitePath } from "../lib/runtime-urls";

interface Props {
  pathname?: string;
}
export default function SiteHeader(props: Props) {
  const { pathname = "/" } = props;
  const isSearchPage = pathname === "/search";
  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return (
    <header
      className="nature-site-header sticky z-40 w-full flex-none pt-3"
      data-public-header=""
      data-public-header-state="expanded"
    >
      <div className="nature-container nature-site-header-frame">
        <div className="nature-surface grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-3 py-3 sm:flex sm:flex-wrap sm:gap-3 sm:px-5">
          <a
            href={toPublicSitePath("/")}
            className="nature-brand-link min-w-0 pl-1 text-[color:var(--nature-text)] transition-colors hover:text-[color:var(--nature-accent-strong)] sm:min-w-fit"
          >
            <span
              className="nature-brand-mark"
              aria-hidden="true"
              style={cssStyle(
                `--nature-brand-mark-url: url("${toPublicSitePath("/site-assets/ivan-blog-mark.svg")}")`
              )}
            ></span>
            <span className="nature-brand-name">{SITE.name}</span>
          </a>

          <nav
            className="order-3 col-span-2 w-full sm:col-auto md:order-2 md:ml-2 md:w-auto"
            aria-label="Main navigation"
          >
            <ul className="flex w-full items-center justify-between gap-0 text-sm font-medium sm:w-auto sm:justify-start sm:gap-1">
              {headerData.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={toPublicSitePath(link.href)}
                    aria-label={link.text}
                    className={`nature-nav-link min-w-[2.75rem] justify-center whitespace-nowrap gap-1.5 rounded-full px-1.5 transition sm:gap-2 sm:px-4 ${
                      isActive(link.href)
                        ? "aw-link-active"
                        : "text-[color:var(--nature-text-soft)] hover:bg-[rgba(var(--nature-accent-rgb),0.1)] hover:text-[color:var(--nature-accent-strong)]"
                    }`}
                  >
                    <Icon name={link.icon} className="hidden h-4 w-4 sm:block" />
                    <span className="nature-nav-link-label">{link.text}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="nature-header-tools order-2 ml-0 flex items-center gap-1 sm:ml-auto sm:gap-3 md:order-3">
            {!isSearchPage && (
              <>
                <form
                  action={toPublicSitePath("/search")}
                  method="get"
                  className="hidden xl:flex items-center w-auto"
                >
                  <label className="nature-input-shell nature-header-search min-w-[18rem] 2xl:min-w-[20rem]">
                    <Icon
                      name="tabler:search"
                      className="w-5 h-5 text-[color:var(--nature-text-faint)]"
                    />
                    <input
                      type="text"
                      name="q"
                      placeholder="搜索文章..."
                      className="nature-input"
                    />
                  </label>
                </form>
                <a
                  href={toPublicSitePath("/search")}
                  className="nature-icon-button inline-flex xl:hidden"
                  aria-label="搜索"
                >
                  <Icon name="tabler:search" className="nature-header-tool-icon h-5 w-5" />
                </a>
              </>
            )}
            <ThemeToggle compactOnMobile iconClass="h-4 w-4" />
            <a
              className="nature-header-rss-button nature-icon-button inline-flex"
              aria-label="RSS Feed"
              title="RSS Feed"
              href={toPublicSitePath("/feed.xml")}
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
          aria-hidden="true"
        >
          <span className="nature-route-loading-track" aria-hidden="true">
            <span className="nature-route-loading-bar"></span>
          </span>
          <span className="nature-route-loading-label">正在打开页面</span>
        </div>
      </div>
    </header>
  );
}
