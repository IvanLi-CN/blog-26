import Icon from "@/components/ui/Icon";
import { footerData } from "@/config/navigation";
import { SITE } from "@/config/site";
import { toPublicSitePath } from "../lib/runtime-urls";

export default function SiteFooter(_props: Record<string, unknown>) {
  return (
    <footer className="relative z-10 pb-5 pt-8 sm:pb-6 sm:pt-10">
      <div className="nature-container">
        <div className="nature-surface px-4 py-5 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="nature-avatar-ring flex h-12 w-12 items-center justify-center bg-[radial-gradient(circle_at_30%_30%,rgba(var(--nature-accent-rgb),0.45),rgba(var(--nature-secondary-rgb),0.7))] text-lg font-semibold text-white">
                  I
                </div>
                <div>
                  <div className="font-heading text-xl font-semibold tracking-[-0.04em]">
                    {SITE.name}
                  </div>
                  <div className="text-sm text-[color:var(--nature-text-soft)]">
                    Digital greenhouse for notes, memos, and making.
                  </div>
                </div>
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
                  className="nature-chip nature-chip-link"
                >
                  Content: CC BY-NC-ND 4.0
                </a>
              </div>
            </div>

            <div className="flex min-w-[16rem] flex-col gap-4">
              <h6 className="text-sm font-medium uppercase tracking-[0.22em] text-[color:var(--nature-text-faint)]">
                Social
              </h6>
              <div className="flex flex-wrap gap-2">
                {footerData.socialLinks.map((social) => (
                  <a
                    key={social.href}
                    className="nature-icon-button inline-flex"
                    aria-label={social.ariaLabel}
                    href={social.href.startsWith("/") ? toPublicSitePath(social.href) : social.href}
                    target={social.href.startsWith("/") ? undefined : "_blank"}
                    rel={social.href.startsWith("/") ? undefined : "noopener noreferrer"}
                  >
                    <Icon name={social.icon} className="text-lg" />
                  </a>
                ))}
              </div>

              <a
                target="_blank"
                rel="noopener nofollow"
                href="https://beian.miit.gov.cn"
                className="nature-footer-link text-sm text-[color:var(--nature-text-soft)] transition-colors hover:text-[color:var(--nature-accent-strong)]"
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
