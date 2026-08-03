import { MoreHorizontal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui";

export type EditorTabStripItem = {
  id: string;
  label: string;
  dirty: boolean;
  temporary?: boolean;
};

export type EditorTabStripProps = {
  tabs: EditorTabStripItem[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
};

const TAB_MIN_WIDTH = 132;
const TAB_MAX_WIDTH = 200;
const TAB_GAP = 6;
const OVERFLOW_BUTTON_WIDTH = 40;
const STRIP_INLINE_PADDING = 24;
const closeButtonClassName =
  "admin-editor-tab-icon-control inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-colors hover:border-border/58 hover:bg-background hover:text-foreground focus-visible:border-ring/60 focus-visible:bg-background focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35";
const overflowButtonClassName =
  "admin-editor-tab-icon-control inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-transparent bg-transparent text-muted-foreground transition-colors hover:border-border/58 hover:bg-background hover:text-foreground focus-visible:border-ring/60 focus-visible:bg-background focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35";

function estimateTabWidth(tab: EditorTabStripItem) {
  const labelLength = (tab.label || "未命名文章").length;
  return Math.min(TAB_MAX_WIDTH, Math.max(TAB_MIN_WIDTH, 48 + labelLength * 8));
}

function tabStatusText(tab: EditorTabStripItem) {
  return tab.dirty ? "未保存" : "已保存";
}

function tabDescription(tab: EditorTabStripItem) {
  return `${tab.label || "未命名文章"}，${tabStatusText(tab)}`;
}

function DirtyDot({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return (
    <span
      data-testid="editor-tab-dirty-dot"
      aria-hidden="true"
      className="size-1.5 shrink-0 rounded-full bg-warning shadow-[0_0_0_3px_color-mix(in_oklch,var(--warning)_18%,transparent)]"
    />
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return mobile;
}

function useElementWidth<TElement extends HTMLElement>() {
  const ref = useRef<TElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => setWidth(element.getBoundingClientRect().width);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function computeVisibleTabIds(
  tabs: EditorTabStripItem[],
  activeTabId: string | null,
  width: number
) {
  if (tabs.length === 0 || width <= 0) return new Set(tabs.map((tab) => tab.id));

  let usedWidth = STRIP_INLINE_PADDING;
  const visibleIds: string[] = [];

  for (let index = 0; index < tabs.length; index += 1) {
    const remainingTabs = tabs.length - index - 1;
    const reserveOverflow = remainingTabs > 0 ? OVERFLOW_BUTTON_WIDTH + TAB_GAP : 0;
    const nextWidth = estimateTabWidth(tabs[index]) + (visibleIds.length > 0 ? TAB_GAP : 0);

    if (usedWidth + nextWidth + reserveOverflow <= width || visibleIds.length === 0) {
      visibleIds.push(tabs[index].id);
      usedWidth += nextWidth;
      continue;
    }

    break;
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  if (activeTab && !visibleIds.includes(activeTab.id) && visibleIds.length > 0) {
    visibleIds[visibleIds.length - 1] = activeTab.id;
  }

  return new Set(visibleIds);
}

export function EditorTabStrip({ tabs, activeTabId, onActivate, onClose }: EditorTabStripProps) {
  const [stripRef, stripWidth] = useElementWidth<HTMLDivElement>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const visibleTabIds = useMemo(
    () => computeVisibleTabIds(tabs, activeTabId, stripWidth),
    [activeTabId, stripWidth, tabs]
  );
  const visibleTabs = tabs.filter((tab) => visibleTabIds.has(tab.id));
  const hasOverflow = visibleTabs.length < tabs.length;

  const activateTab = (tabId: string) => {
    onActivate(tabId);
    setDrawerOpen(false);
    setDesktopMenuOpen(false);
  };

  const closeTab = (tabId: string) => {
    onClose(tabId);
    setDrawerOpen(false);
    setDesktopMenuOpen(false);
  };

  const renderTab = (tab: EditorTabStripItem) => {
    const active = tab.id === activeTabId;

    return (
      <div
        key={tab.id}
        data-testid="editor-tab"
        data-temporary={tab.temporary ? "true" : "false"}
        className={cn(
          "admin-editor-tab inline-flex h-11 min-w-[8.25rem] max-w-[12.5rem] shrink-0 items-center gap-0.5 rounded-xl border px-2 text-sm leading-none",
          active
            ? "border-border bg-muted text-foreground shadow-inner shadow-shadow-inset"
            : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          tab.temporary && !active && "border-border/34 bg-muted/20"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={tabDescription(tab)}
              className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left leading-none"
              onClick={() => onActivate(tab.id)}
            >
              <DirtyDot dirty={tab.dirty} />
              <span className={cn("min-w-0 flex-1 truncate", tab.temporary && "italic")}>
                {tab.label || "未命名文章"}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            {tabDescription(tab)}
          </TooltipContent>
        </Tooltip>
        <button
          type="button"
          className={closeButtonClassName}
          onClick={() => onClose(tab.id)}
          aria-label={`关闭 ${tab.label || "未命名文章"}`}
        >
          <X className="size-3" />
        </button>
      </div>
    );
  };
  const renderTabList = () => (
    <div
      className="admin-scrollbar max-h-[min(28rem,70vh)] overflow-y-auto p-1"
      data-testid="editor-tab-overflow-list"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            data-testid="editor-tab-overflow-item"
            className={cn(
              "flex h-9 min-w-0 items-center gap-2 rounded-xl px-2",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => activateTab(tab.id)}
                  aria-label={tabDescription(tab)}
                >
                  <DirtyDot dirty={tab.dirty} />
                  <span className={cn("truncate text-sm font-medium", tab.temporary && "italic")}>
                    {tab.label || "未命名文章"}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" align="center">
                {tabDescription(tab)}
              </TooltipContent>
            </Tooltip>
            <button
              type="button"
              className={closeButtonClassName}
              onClick={() => closeTab(tab.id)}
              aria-label={`关闭 ${tab.label || "未命名文章"}`}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <TooltipProvider delayDuration={240}>
      <div
        ref={stripRef}
        role="tablist"
        data-testid="editor-tab-strip"
        className="admin-editor-tab-strip flex h-12 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap border-b border-border/58 px-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {visibleTabs.map(renderTab)}
        </div>
        {hasOverflow ? (
          isMobile ? (
            <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
              <DrawerTrigger asChild>
                <button
                  type="button"
                  className={overflowButtonClassName}
                  data-testid="editor-tabs-overflow"
                  aria-label="展开已打开文件列表"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DrawerTrigger>
              <DrawerContent className="p-0">
                <div className="px-4 pt-2">
                  <DrawerHandle />
                </div>
                <DrawerTitle className="border-b border-border/58 px-4 pb-2.5 pt-2 text-sm font-semibold">
                  已打开文件
                </DrawerTitle>
                {renderTabList()}
              </DrawerContent>
            </Drawer>
          ) : (
            <DropdownMenu open={desktopMenuOpen} onOpenChange={setDesktopMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={overflowButtonClassName}
                  data-testid="editor-tabs-overflow"
                  aria-label="展开已打开文件列表"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-1">
                {renderTabList()}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        ) : null}
      </div>
    </TooltipProvider>
  );
}
