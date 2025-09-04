"use client";

import { useEffect } from "react";

/**
 * 顶部进度条组件
 *
 * 这个组件在页面顶部显示一个进度条，用于指示页面加载或路由切换的进度。
 * 使用纯CSS和JavaScript实现，无需外部依赖。
 */
export function ProgressBar() {
  useEffect(() => {
    // 创建进度条元素
    const progressBar = document.createElement("div");
    progressBar.id = "top-progress-bar";
    progressBar.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0%;
      height: 3px;
      background: hsl(var(--p));
      z-index: 1600;
      box-shadow: 0 0 10px hsl(var(--p)), 0 0 5px hsl(var(--p));
      transition: width 0.3s ease, opacity 0.3s ease;
      opacity: 0;
    `;

    document.body.appendChild(progressBar);

    let isLoading = false;
    let progress = 0;
    let timer: NodeJS.Timeout;

    const startProgress = () => {
      if (isLoading) return;
      isLoading = true;
      progress = 0;
      progressBar.style.opacity = "1";
      progressBar.style.width = "0%";

      // 模拟进度增长
      timer = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 90) progress = 90;
        progressBar.style.width = `${progress}%`;
      }, 200);
    };

    const finishProgress = () => {
      if (!isLoading) return;
      isLoading = false;
      clearInterval(timer);

      progressBar.style.width = "100%";
      setTimeout(() => {
        progressBar.style.opacity = "0";
        setTimeout(() => {
          progressBar.style.width = "0%";
        }, 300);
      }, 200);
    };

    // 监听路由变化
    // const handleRouteChangeStart = () => startProgress();
    // const handleRouteChangeComplete = () => finishProgress();

    // 监听浏览器导航事件
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      startProgress();
      originalPushState.apply(history, args);
      setTimeout(finishProgress, 500);
    };

    history.replaceState = (...args) => {
      startProgress();
      originalReplaceState.apply(history, args);
      setTimeout(finishProgress, 500);
    };

    window.addEventListener("popstate", () => {
      startProgress();
      setTimeout(finishProgress, 500);
    });

    // 监听链接点击
    const handleLinkClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");

      if (link?.href && !link.href.startsWith("mailto:") && !link.href.startsWith("tel:")) {
        const url = new URL(link.href);
        const currentUrl = new URL(window.location.href);

        // 只在内部链接且URL不同时显示进度条
        if (url.origin === currentUrl.origin && url.pathname !== currentUrl.pathname) {
          startProgress();
        }
      }
    };

    document.addEventListener("click", handleLinkClick);

    // 清理函数
    return () => {
      clearInterval(timer);
      document.removeEventListener("click", handleLinkClick);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;

      const existingBar = document.getElementById("top-progress-bar");
      if (existingBar) {
        existingBar.remove();
      }
    };
  }, []);

  return null; // 这个组件不渲染任何React元素
}
