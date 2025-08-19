"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";

interface SearchBoxProps {
  placeholder?: string;
  buttonLabel?: string;
}

export default function SearchBox({
  placeholder = "搜索文章...",
  buttonLabel = "搜索",
}: SearchBoxProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMediumOverlayOpen, setIsMediumOverlayOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const modalInputRef = useRef<HTMLInputElement>(null);
  const mediumInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);

  // 处理搜索提交
  const handleSearch = (query: string) => {
    if (!query.trim()) return;

    setIsLoading(true);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);

    // 关闭所有搜索界面
    setIsModalOpen(false);
    setIsMediumOverlayOpen(false);

    // 重置加载状态
    setTimeout(() => setIsLoading(false), 1000);
  };

  // 桌面版搜索表单提交
  const handleDesktopSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get("q") as string;
    handleSearch(query);
  };

  // 移动版搜索表单提交
  const handleMobileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get("q") as string;
    handleSearch(query);
  };

  // 中屏版搜索表单提交
  const handleMediumSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get("q") as string;
    handleSearch(query);
  };

  // 打开移动端搜索模态框
  const _openModal = () => {
    setIsModalOpen(true);
    document.body.style.overflow = "hidden";
    setTimeout(() => modalInputRef.current?.focus(), 100);
  };

  // 关闭移动端搜索模态框
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    document.body.style.overflow = "";
  }, []);

  // 打开中屏搜索悬浮框
  const openMediumOverlay = useCallback(() => {
    setIsMediumOverlayOpen(true);
    document.body.style.overflow = "hidden";
    setTimeout(() => mediumInputRef.current?.focus(), 100);
  }, []);

  // 关闭中屏搜索悬浮框
  const closeMediumOverlay = useCallback(() => {
    setIsMediumOverlayOpen(false);
    document.body.style.overflow = "";
  }, []);

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 键关闭搜索
      if (e.key === "Escape") {
        if (isModalOpen) closeModal();
        if (isMediumOverlayOpen) closeMediumOverlay();
      }

      // ⌘+K 或 Ctrl+K 快捷键
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();

        const isLargeScreen = window.matchMedia("(min-width: 1280px)").matches;
        const isMediumScreen = window.matchMedia(
          "(min-width: 768px) and (max-width: 1279px)"
        ).matches;

        if (isLargeScreen) {
          desktopInputRef.current?.focus();
        } else if (isMediumScreen) {
          openMediumOverlay();
        }
        // 小屏不处理快捷键
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, isMediumOverlayOpen, closeMediumOverlay, closeModal, openMediumOverlay]);

  // 点击外部关闭中屏搜索框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isMediumOverlayOpen) {
        const overlay = document.querySelector(".search-overlay-medium");
        const trigger = document.querySelector(".search-trigger-medium");

        if (
          overlay &&
          !overlay.contains(e.target as Node) &&
          trigger &&
          !trigger.contains(e.target as Node)
        ) {
          closeMediumOverlay();
        }
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isMediumOverlayOpen, closeMediumOverlay]);

  return (
    <div className="relative">
      {/* 大屏搜索框 */}
      <form onSubmit={handleDesktopSubmit} className="hidden xl:flex items-center w-auto">
        <label className="input input-bordered flex items-center gap-2">
          <Icon name="tabler:search" className="w-5 h-5 opacity-50" />
          <input
            ref={desktopInputRef}
            type="text"
            name="q"
            placeholder={placeholder}
            className="grow"
          />
          <span className={`flex items-center gap-1 ${isLoading ? "hidden" : ""}`}>
            <kbd className="kbd kbd-sm">⌘</kbd>
            <kbd className="kbd kbd-sm">K</kbd>
          </span>
          {isLoading && <span className="loading loading-spinner loading-xs ml-2"></span>}
        </label>
      </form>

      {/* 中屏搜索按钮 */}
      <button
        type="button"
        className="btn btn-ghost btn-circle hidden md:flex xl:hidden search-trigger-medium"
        aria-label={buttonLabel}
        onClick={openMediumOverlay}
      >
        <Icon name="tabler:search" className="w-5 h-5" />
      </button>

      {/* 中屏搜索悬浮框 */}
      {isMediumOverlayOpen && (
        <div className="search-overlay-medium fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2">
            <form
              onSubmit={handleMediumSubmit}
              className="flex items-center bg-base-100 rounded-lg shadow-lg border border-base-300 px-3 py-2"
            >
              <Icon name="tabler:search" className="w-4 h-4 text-base-content/60 mr-2" />
              <input
                ref={mediumInputRef}
                type="text"
                name="q"
                placeholder={placeholder}
                className="input input-ghost w-64 h-8 text-sm bg-transparent border-0 focus:outline-none"
                autoComplete="off"
              />
              <div className="hidden sm:flex items-center ml-2 text-xs text-base-content/60">
                <kbd className="kbd kbd-xs">⌘</kbd>
                <kbd className="kbd kbd-xs">K</kbd>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 全屏搜索模态框 */}
      {isModalOpen && (
        <div className="search-modal fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 h-full flex items-center justify-center">
            <form onSubmit={handleMobileSubmit} className="w-full max-w-lg">
              <div className="relative">
                <input
                  ref={modalInputRef}
                  type="text"
                  name="q"
                  placeholder={placeholder}
                  className="input input-bordered w-full pr-10 text-lg"
                />
                <button
                  type="submit"
                  className="btn btn-ghost btn-circle absolute right-0 top-0"
                  aria-label={buttonLabel}
                >
                  <Icon name="tabler:search" className="w-6 h-6" />
                </button>
                {isLoading && (
                  <span className="loading loading-spinner loading-sm absolute right-12 top-2.5"></span>
                )}
              </div>
            </form>
            <button
              type="button"
              className="btn btn-ghost btn-circle absolute right-4 top-4"
              aria-label="关闭搜索"
              onClick={closeModal}
            >
              <Icon name="tabler:x" className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
