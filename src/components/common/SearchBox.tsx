"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import AiSearchOverlay from "../search/AiSearchOverlay";
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

  // 保留：中屏提交逻辑由 AiSearchOverlay 承担

  // 打开移动端搜索模态框
  // const openModal = () => {
  //   setIsModalOpen(true);
  //   document.body.style.overflow = "hidden";
  //   setTimeout(() => modalInputRef.current?.focus(), 100);
  // };

  // 关闭移动端搜索模态框
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    document.body.style.overflow = "";
  }, []);

  // 打开中屏搜索悬浮框
  const openMediumOverlay = useCallback(() => {
    setIsMediumOverlayOpen(true);
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
        openMediumOverlay();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, isMediumOverlayOpen, closeMediumOverlay, closeModal, openMediumOverlay]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        className="nature-icon-button md:hidden"
        aria-label={buttonLabel}
        onClick={() => router.push("/search")}
      >
        <Icon name="tabler:search" className="w-5 h-5" />
      </button>

      <form onSubmit={handleDesktopSubmit} className="hidden xl:flex items-center w-auto">
        <label className="nature-input-shell min-w-[18rem]">
          <Icon name="tabler:search" className="w-5 h-5 text-[color:var(--nature-text-faint)]" />
          <input
            ref={desktopInputRef}
            type="text"
            name="q"
            placeholder={placeholder}
            className="nature-input"
          />
          <span className={`flex items-center gap-1 ${isLoading ? "hidden" : ""}`}>
            <kbd className="nature-kbd">⌘</kbd>
            <kbd className="nature-kbd">K</kbd>
          </span>
          {isLoading && <span className="nature-spinner ml-2"></span>}
        </label>
      </form>

      <button
        type="button"
        className="nature-icon-button hidden md:flex xl:hidden search-trigger-medium"
        aria-label={buttonLabel}
        onClick={openMediumOverlay}
      >
        <Icon name="tabler:search" className="w-5 h-5" />
      </button>

      <AiSearchOverlay open={isMediumOverlayOpen} onClose={closeMediumOverlay} />

      {/* 全屏搜索模态框 */}
      {isModalOpen && (
        <div className="nature-modal">
          <div className="nature-modal-backdrop" />
          <div className="container mx-auto px-4 h-full flex items-center justify-center">
            <form onSubmit={handleMobileSubmit} className="w-full max-w-lg">
              <div className="relative">
                <input
                  ref={modalInputRef}
                  type="text"
                  name="q"
                  placeholder={placeholder}
                  className="nature-input-shell w-full pr-10 text-lg"
                />
                <button
                  type="submit"
                  className="nature-icon-button absolute right-2 top-2"
                  aria-label={buttonLabel}
                >
                  <Icon name="tabler:search" className="w-6 h-6" />
                </button>
                {isLoading && <span className="nature-spinner absolute right-14 top-4"></span>}
              </div>
            </form>
            <button
              type="button"
              className="nature-icon-button absolute right-4 top-4"
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
