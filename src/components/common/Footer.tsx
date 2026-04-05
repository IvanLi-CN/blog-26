import { footerData } from "../../config/navigation";
import { SITE } from "../../config/site";
import Icon from "../ui/Icon";

export default function Footer() {
  return (
    <footer className="relative z-10 px-3 pb-4 pt-8 sm:px-4 sm:pb-6 sm:pt-10">
      <div className="nature-container">
        <div className="nature-surface px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  role="img"
                  aria-label="Site logo"
                  fillRule="evenodd"
                  clipRule="evenodd"
                  className="fill-current opacity-80"
                >
                  <title>Site logo</title>
                  <path d="M22.672 15.226l-2.432.811.841 2.515c.33 1.019-.209 2.127-1.23 2.456-1.15.325-2.148-.321-2.463-1.226l-.84-2.518-5.013 1.677.84 2.517c.391 1.203-.434 2.542-1.831 2.542-.88 0-1.601-.564-1.86-1.314l-.842-2.516-2.431.809c-1.135.328-2.145-.317-2.463-1.229-.329-1.018.211-2.127 1.231-2.456l2.432-.809-1.621-4.823-2.432.808c-1.355.384-2.558-.59-2.558-1.839 0-.817.509-1.582 1.327-1.846l2.433-.809-.842-2.515c-.33-1.02.211-2.129 1.232-2.458 1.02-.329 2.13.209 2.461 1.229l.842 2.515 5.011-1.677-.839-2.517c-.403-1.238.484-2.553 1.843-2.553.819 0 1.585.509 1.85 1.326l.841 2.517 2.431-.81c1.02-.33 2.131.211 2.461 1.229.332 1.018-.21 2.126-1.23 2.456l-2.433.809 1.622 4.823 2.433-.809c1.242-.401 2.557.484 2.557 1.838 0 .819-.51 1.583-1.328 1.847m-8.992-6.428l-5.01 1.675 1.619 4.828 5.011-1.674-1.62-4.829z"></path>
                </svg>
                <div>
                  <div className="font-heading text-xl font-semibold tracking-[-0.04em]">
                    {SITE.name}
                  </div>
                  <div className="text-sm text-[color:var(--nature-text-soft)]">
                    Digital greenhouse for notes, memos, and making.
                  </div>
                </div>
              </div>

              <div className="max-w-xl text-sm leading-7 text-[color:var(--nature-text-soft)]">
                以更柔和的界面去承载技术记录、生活片段与项目痕迹，让内容像水一样自然流过页面。
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
                <span>
                  Copyright © {new Date().getFullYear()} {SITE.owner}
                </span>
                <span className="nature-chip">Code: MIT</span>
                <a
                  href="https://creativecommons.org/licenses/by-nc-nd/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nature-chip"
                >
                  Content: CC BY-NC-ND 4.0
                </a>
              </div>
            </div>

            <div className="flex min-w-[16rem] flex-col gap-4">
              <h6 className="text-sm font-medium uppercase tracking-[0.22em] text-[color:var(--nature-text-faint)]">
                Social
              </h6>
              {footerData.socialLinks?.length ? (
                <div className="flex flex-wrap gap-2">
                  {footerData.socialLinks.map((social) => (
                    <a
                      key={social.href}
                      className="nature-icon-button h-10 w-10"
                      aria-label={social.ariaLabel}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Icon name={social.icon} className="text-lg" />
                    </a>
                  ))}
                </div>
              ) : null}

              <a
                target="_blank"
                rel="noopener nofollow"
                href="https://beian.miit.gov.cn"
                className="text-sm text-[color:var(--nature-text-soft)] transition-colors hover:text-[color:var(--nature-accent-strong)]"
              >
                闽ICP备2023000043号
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
