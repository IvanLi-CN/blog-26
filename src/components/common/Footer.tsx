import { footerData } from "../../config/navigation";
import { SITE } from "../../config/site";
import Icon from "../ui/Icon";

export default function Footer() {
  return (
    <footer className="bg-neutral text-neutral-content">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* 主要内容区域 */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-8">
          {/* 左侧：Logo 和版权信息 */}
          <div className="flex flex-col gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                fillRule="evenodd"
                clipRule="evenodd"
                className="fill-current opacity-80"
              >
                <path d="M22.672 15.226l-2.432.811.841 2.515c.33 1.019-.209 2.127-1.23 2.456-1.15.325-2.148-.321-2.463-1.226l-.84-2.518-5.013 1.677.84 2.517c.391 1.203-.434 2.542-1.831 2.542-.88 0-1.601-.564-1.86-1.314l-.842-2.516-2.431.809c-1.135.328-2.145-.317-2.463-1.229-.329-1.018.211-2.127 1.231-2.456l2.432-.809-1.621-4.823-2.432.808c-1.355.384-2.558-.59-2.558-1.839 0-.817.509-1.582 1.327-1.846l2.433-.809-.842-2.515c-.33-1.02.211-2.129 1.232-2.458 1.02-.329 2.13.209 2.461 1.229l.842 2.515 5.011-1.677-.839-2.517c-.403-1.238.484-2.553 1.843-2.553.819 0 1.585.509 1.85 1.326l.841 2.517 2.431-.81c1.02-.33 2.131.211 2.461 1.229.332 1.018-.21 2.126-1.23 2.456l-2.433.809 1.622 4.823 2.433-.809c1.242-.401 2.557.484 2.557 1.838 0 .819-.51 1.583-1.328 1.847m-8.992-6.428l-5.01 1.675 1.619 4.828 5.011-1.674-1.62-4.829z"></path>
              </svg>
              <span className="text-lg font-medium">{SITE.name}</span>
            </div>

            {/* 版权信息 */}
            <div className="text-sm opacity-75 space-y-1">
              <div>
                Copyright © {new Date().getFullYear()} {SITE.owner}
              </div>
            </div>
          </div>

          {/* 右侧：社交链接 */}
          <div className="flex flex-col gap-4">
            <h6 className="text-sm font-medium opacity-75">Social</h6>
            {footerData.socialLinks?.length ? (
              <div className="flex gap-2">
                {footerData.socialLinks.map((social) => (
                  <a
                    key={social.href}
                    className="btn btn-circle btn-ghost btn-sm"
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
          </div>
        </div>

        {/* 底部分隔线和次要信息 */}
        <div className="mt-8 pt-6 border-t border-neutral-content/10">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 text-xs opacity-60">
            {/* 许可证信息 */}
            <div className="flex flex-wrap items-center gap-4">
              <span>Code: MIT</span>
              <span className="hidden sm:inline">|</span>
              <a
                href="https://creativecommons.org/licenses/by-nc-nd/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <svg className="w-3 h-3" viewBox="0 0 64 64" fill="currentColor">
                  <circle
                    cx="32"
                    cy="32"
                    r="30"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  ></circle>
                  <path
                    d="M25.5 26.5c-1.5-1.5-3.5-2.5-5.5-2.5-4.5 0-8 3.5-8 8s3.5 8 8 8c2 0 4-1 5.5-2.5M42.5 26.5c-1.5-1.5-3.5-2.5-5.5-2.5-4.5 0-8 3.5-8 8s3.5 8 8 8c2 0 4-1 5.5-2.5"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                  ></path>
                </svg>
                <span>Content: CC BY-NC-ND 4.0</span>
              </a>
            </div>

            {/* 备案信息 */}
            <a
              target="_blank"
              rel="noopener nofollow"
              href="https://beian.miit.gov.cn"
              className="hover:opacity-80 transition-opacity"
            >
              闽ICP备2023000043号
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
