import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  FilePlus2,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  FolderUp,
  MoreHorizontal,
  RefreshCcw,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FileItem } from "@/lib/admin-api-client";
import { cn } from "@/lib/utils";
import { dismissAdminToast, showAdminToast } from "~/components/admin-toast";
import { useAppShellSidebarFloatingFooter } from "~/components/app-shell";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui";

export type TreeItemType = FileItem["type"];

export type TreeSelection = {
  source: "local";
  path: string;
  type: TreeItemType;
};

export type TreeRenameTarget = TreeSelection & {
  parentPath: string;
  value: string;
};

type TreeClipboard = {
  mode: "copy" | "cut";
  items: TreeSelection[];
};

type ContextMenuState = {
  open: true;
  x: number;
  y: number;
  target: TreeSelection | null;
  currentDirectoryPath: string;
} | null;

type MoveDialogState = {
  entries: TreeSelection[];
  destinationPath: string;
};

type DeleteDialogState = {
  entries: TreeSelection[];
};

type FileBrowserCommand =
  | "rename"
  | "move"
  | "copy"
  | "cut"
  | "paste"
  | "delete"
  | "new-file"
  | "new-directory"
  | "refresh"
  | "clear-selection";

type ContextMenuItem = {
  id: string;
  label: string;
  command: FileBrowserCommand;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
};

const EMPTY_FILE_ITEMS: FileItem[] = [];
const CLIPBOARD_TOAST_ID = "admin-editor-file-browser-clipboard";

function formatDirectoryTargetLabel(path: string | null | undefined) {
  const normalizedPath = normalizeTreePath(path);
  return normalizedPath || "根目录";
}

function isRowOverflowing(container: HTMLElement | null) {
  if (!container) return false;
  return container.scrollWidth - container.clientWidth > 1;
}

export function normalizeTreePath(path: string | null | undefined) {
  return (path ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function getParentTreePath(path: string | null | undefined) {
  const normalized = normalizeTreePath(path);
  if (!normalized) return "";
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

export function joinTreePath(parentPath: string, name: string) {
  const parent = normalizeTreePath(parentPath);
  const child = name.replace(/^\/+|\/+$/g, "");
  return parent ? `${parent}/${child}` : child;
}

export function replaceTreePathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  const normalizedPath = normalizeTreePath(path);
  const normalizedOld = normalizeTreePath(oldPrefix);
  const normalizedNew = normalizeTreePath(newPrefix);
  if (normalizedPath === normalizedOld) return normalizedNew;
  if (normalizedOld && normalizedPath.startsWith(`${normalizedOld}/`)) {
    return `${normalizedNew}${normalizedPath.slice(normalizedOld.length)}`;
  }
  return normalizedPath;
}

export function deriveBaseDirectory(selection: TreeSelection | null, fallbackPath: string) {
  if (!selection) return normalizeTreePath(fallbackPath);
  return selection.type === "directory"
    ? normalizeTreePath(selection.path)
    : getParentTreePath(selection.path);
}

export function deriveUniqueTreeName(items: FileItem[], preferredName: string) {
  const existingNames = new Set(items.map((item) => item.name));
  if (!existingNames.has(preferredName)) return preferredName;

  const dotIndex = preferredName.lastIndexOf(".");
  const stem = dotIndex > 0 ? preferredName.slice(0, dotIndex) : preferredName;
  const extension = dotIndex > 0 ? preferredName.slice(dotIndex) : "";
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem}-${index}${extension}`;
    if (!existingNames.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${extension}`;
}

export function getAncestorTreePaths(path: string | null | undefined) {
  const parentPath = getParentTreePath(path);
  if (!parentPath) return [];

  const segments = parentPath.split("/").filter(Boolean);
  const ancestors: string[] = [];
  let currentPath = "";

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    ancestors.push(currentPath);
  }

  return ancestors;
}

export function toDirectoryRequestPath(path: string | null | undefined) {
  const normalized = normalizeTreePath(path);
  return normalized ? `/${normalized}/` : "";
}

export function isTreePathSelected(
  path: string | null | undefined,
  activePath: string | null | undefined
) {
  return normalizeTreePath(path) === normalizeTreePath(activePath);
}

export function isTreePathAncestor(
  path: string | null | undefined,
  activePath: string | null | undefined
) {
  const normalizedPath = normalizeTreePath(path);
  const normalizedActivePath = normalizeTreePath(activePath);
  if (!normalizedPath || !normalizedActivePath || normalizedPath === normalizedActivePath) {
    return false;
  }

  return normalizedActivePath.startsWith(`${normalizedPath}/`);
}

function getFileTypeLabel(extension?: string) {
  const normalizedExtension = (extension || "file").replace(/^\./, "").trim();
  return (normalizedExtension || "file").slice(0, 3).toUpperCase();
}

function isSelectionModifierEvent(
  event:
    | ReactMouseEvent<HTMLElement>
    | ReactKeyboardEvent<HTMLElement>
    | Pick<ReactMouseEvent<HTMLElement>, "shiftKey" | "metaKey" | "ctrlKey">
) {
  return Boolean(event.shiftKey || event.metaKey || event.ctrlKey);
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
  );
}

function dedupeSelection(entries: TreeSelection[]) {
  const nextEntries: TreeSelection[] = [];
  for (const entry of entries) {
    const normalizedEntryPath = normalizeTreePath(entry.path);
    const ancestorIndex = nextEntries.findIndex((current) =>
      isTreePathAncestor(current.path, normalizedEntryPath)
    );
    if (ancestorIndex >= 0) {
      continue;
    }

    const filtered = nextEntries.filter(
      (current) => !isTreePathAncestor(normalizedEntryPath, current.path)
    );
    filtered.push({ ...entry, path: normalizedEntryPath });
    nextEntries.splice(0, nextEntries.length, ...filtered);
  }

  return nextEntries;
}

function sortSelection(entries: TreeSelection[]) {
  return [...entries].sort((left, right) => left.path.localeCompare(right.path));
}

function TreeFileTypeIcon({ extension, active }: { extension?: string; active: boolean }) {
  const label = getFileTypeLabel(extension);

  return (
    <span
      className={cn(
        "relative inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground",
        active && "text-primary"
      )}
      title={`${label} 文件`}
    >
      <FileText className="size-5" />
      <span className="absolute bottom-[0.1rem] left-1/2 -translate-x-1/2 text-[0.34rem] font-bold uppercase leading-none">
        {label}
      </span>
    </span>
  );
}

function InlineTreeNameInput({
  value,
  type,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  type: TreeItemType;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      aria-label={type === "directory" ? "目录名称" : "文件名称"}
      className="min-w-0 flex-1 rounded-xl border border-primary/35 bg-background px-2 py-1 text-sm text-foreground outline-none ring-2 ring-primary/18"
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

function FileBrowserContextMenu({
  state,
  items,
  onClose,
  onSelect,
}: {
  state: ContextMenuState;
  items: ContextMenuItem[];
  onClose: () => void;
  onSelect: (command: FileBrowserCommand) => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state?.open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, state]);

  if (!state?.open) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        ref={menuRef}
        role="menu"
        aria-label="文件浏览器上下文菜单"
        className="fixed z-50 min-w-52 overflow-hidden rounded-3xl border border-border/60 bg-popover p-1.5 text-popover-foreground shadow-2xl shadow-shadow-strong lg:rounded-[1rem]"
        style={{ left: state.x, top: state.y }}
      >
        {items.map((item) => (
          <div key={item.id}>
            {item.separatorBefore ? <div className="my-1 h-px bg-border/60" /> : null}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cn(
                "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition-colors outline-none",
                item.disabled
                  ? "cursor-not-allowed text-muted-foreground/55"
                  : "hover:bg-muted hover:text-foreground focus-visible:bg-muted",
                item.destructive && !item.disabled && "text-destructive"
              )}
              onClick={() => {
                if (item.disabled) return;
                onSelect(item.command);
              }}
            >
              <span>{item.label}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectoryPickerTree({
  selectedSource,
  rootItems,
  directoryItemsByPath,
  expandedPaths,
  loadingPaths,
  selectedPath,
  disabledReasons,
  className,
  onSelect,
  onDirectoryExpand,
}: {
  selectedSource: "local";
  rootItems: FileItem[];
  directoryItemsByPath: Record<string, FileItem[]>;
  expandedPaths: string[];
  loadingPaths: string[];
  selectedPath: string;
  disabledReasons: Map<string, string>;
  className?: string;
  onSelect: (path: string) => void;
  onDirectoryExpand: (item: FileItem) => void;
}) {
  const expandedPathSet = useMemo(
    () => new Set(expandedPaths.map((path) => normalizeTreePath(path))),
    [expandedPaths]
  );
  const loadingPathSet = useMemo(
    () => new Set(loadingPaths.map((path) => normalizeTreePath(path))),
    [loadingPaths]
  );

  const renderNodes = useCallback(
    (items: FileItem[], depth = 0): ReactNode =>
      items
        .filter((item) => item.type === "directory")
        .map((item) => {
          const normalizedPath = normalizeTreePath(item.path);
          const isExpanded = expandedPathSet.has(normalizedPath);
          const children = directoryItemsByPath[normalizedPath] ?? EMPTY_FILE_ITEMS;
          const disabledReason = disabledReasons.get(normalizedPath);
          const isDisabled = Boolean(disabledReason);
          const isLoadingBranch = loadingPathSet.has(normalizedPath);
          const directoryButton = (
            <button
              type="button"
              aria-disabled={isDisabled || undefined}
              title={disabledReason ? `${item.name}：${disabledReason}` : undefined}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                normalizeTreePath(selectedPath) === normalizedPath &&
                  "bg-primary/10 text-primary ring-1 ring-primary/25",
                !isDisabled && "hover:bg-muted/60",
                isDisabled && "cursor-not-allowed text-muted-foreground/55"
              )}
              onClick={() => {
                if (isDisabled) return;
                onSelect(normalizedPath);
              }}
            >
              <Folder className="size-4 shrink-0 text-primary" />
              <span className="truncate">{item.name}</span>
            </button>
          );

          return (
            <div key={`picker:${selectedSource}:${normalizedPath}`} className="space-y-1">
              <div
                className="flex items-center gap-2 rounded-2xl px-2 py-1.5"
                style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
              >
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => onDirectoryExpand(item)}
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
                {disabledReason ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{directoryButton}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      align="start"
                      className="max-w-64 text-xs leading-5"
                    >
                      {disabledReason}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  directoryButton
                )}
              </div>
              {isExpanded ? (
                <div className="space-y-1">
                  {isLoadingBranch && children.length === 0 ? (
                    <div
                      className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground"
                      style={{ paddingLeft: `${1.5 + depth * 0.75}rem` }}
                    >
                      <Spinner /> 读取目录…
                    </div>
                  ) : null}
                  {children.length > 0 ? renderNodes(children, depth + 1) : null}
                </div>
              ) : null}
            </div>
          );
        }),
    [
      directoryItemsByPath,
      disabledReasons,
      expandedPathSet,
      loadingPathSet,
      onDirectoryExpand,
      onSelect,
      selectedPath,
      selectedSource,
    ]
  );

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className={cn(
          "admin-scrollbar space-y-2 overflow-y-auto rounded-3xl border border-border/56 bg-muted/16 p-3",
          className
        )}
      >
        {disabledReasons.get("") ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-disabled
                title={`根目录：${disabledReasons.get("")}`}
                className={cn(
                  "flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  !selectedPath && "bg-primary/10 text-primary ring-1 ring-primary/25",
                  "cursor-not-allowed text-muted-foreground/55"
                )}
                onClick={() => undefined}
              >
                <Folder className="size-4 shrink-0 text-primary" />
                <span>根目录</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" align="start" className="max-w-64 text-xs leading-5">
              {disabledReasons.get("")}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition",
              !selectedPath && "bg-primary/10 text-primary ring-1 ring-primary/25",
              "hover:bg-muted/60"
            )}
            onClick={() => onSelect("")}
          >
            <Folder className="size-4 shrink-0 text-primary" />
            <span>根目录</span>
          </button>
        )}
        {renderNodes(rootItems)}
      </div>
    </TooltipProvider>
  );
}

function SidebarSelectionFloatingFooter({
  selectedCount,
  clipboardReady,
  onCommand,
}: {
  selectedCount: number;
  clipboardReady: boolean;
  onCommand: (command: FileBrowserCommand) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const fullProbeTopRowRef = useRef<HTMLDivElement | null>(null);
  const fullProbeBottomRowRef = useRef<HTMLDivElement | null>(null);
  const [footerMode, setFooterMode] = useState<"full" | "icons">("full");

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let frame = 0;
    const updateMode = () => {
      frame = 0;
      const fullOverflow =
        isRowOverflowing(fullProbeTopRowRef.current) ||
        isRowOverflowing(fullProbeBottomRowRef.current);
      setFooterMode(fullOverflow ? "icons" : "full");
    };
    const queueUpdate = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateMode);
    };

    queueUpdate();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(queueUpdate);
      observer.observe(host);
      if (fullProbeTopRowRef.current) observer.observe(fullProbeTopRowRef.current);
      if (fullProbeBottomRowRef.current) observer.observe(fullProbeBottomRowRef.current);
      return () => {
        if (frame) cancelAnimationFrame(frame);
        observer.disconnect();
      };
    }

    window.addEventListener("resize", queueUpdate);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", queueUpdate);
    };
  }, []);

  const actions = useMemo(
    () => [
      {
        command: "move" as const,
        label: "移动",
        icon: FolderInput,
        variant: "outline" as const,
        disabled: false,
      },
      {
        command: "copy" as const,
        label: "复制",
        icon: Copy,
        variant: "outline" as const,
        disabled: false,
      },
      {
        command: "cut" as const,
        label: "剪切",
        icon: Scissors,
        variant: "outline" as const,
        disabled: false,
      },
      {
        command: "paste" as const,
        label: "粘贴",
        icon: ClipboardPaste,
        variant: "outline" as const,
        disabled: !clipboardReady,
      },
      {
        command: "delete" as const,
        label: "删除",
        icon: Trash2,
        variant: "destructive" as const,
        disabled: false,
      },
      {
        command: "clear-selection" as const,
        label: "清空选择",
        icon: X,
        variant: "ghost" as const,
        disabled: false,
      },
    ],
    [clipboardReady]
  );

  const topActions = actions.slice(0, 3);
  const bottomActions = actions.slice(3);

  const renderCountPill = useCallback(
    (testId?: string, compact = false) => (
      <span
        data-testid={testId}
        title={`已选中 ${selectedCount} 项`}
        className={cn(
          "inline-flex shrink-0 whitespace-nowrap items-center justify-center border border-secondary/18 bg-secondary/12 font-semibold text-foreground/88 shadow-inner shadow-secondary/8",
          compact
            ? "h-8 min-w-[2.5rem] rounded-xl px-2 text-[10px] leading-none"
            : "h-10 min-w-[3rem] rounded-2xl px-2.5 text-[11px]"
        )}
      >
        {selectedCount}项
      </span>
    ),
    [selectedCount]
  );

  const renderActionButton = useCallback(
    (action: (typeof actions)[number], iconOnly: boolean, stretch = false) => {
      const Icon = action.icon;

      if (iconOnly) {
        return (
          <Tooltip key={action.command}>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={action.variant}
                className={cn("size-9 rounded-[1.1rem]", stretch ? "h-9 w-full" : "")}
                aria-label={action.label}
                disabled={action.disabled}
                onClick={() => onCommand(action.command)}
              >
                <Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{action.label}</TooltipContent>
          </Tooltip>
        );
      }

      return (
        <Button
          key={action.command}
          size="sm"
          variant={action.variant}
          className="w-full justify-center whitespace-nowrap px-3"
          disabled={action.disabled}
          onClick={() => onCommand(action.command)}
        >
          <Icon className="size-4" />
          {action.label}
        </Button>
      );
    },
    [onCommand]
  );

  const renderActionRow = useCallback(
    (
      rowActions: typeof actions,
      showCount = false,
      rowRef?: React.RefObject<HTMLDivElement | null>,
      countTestId?: string
    ) => (
      <div
        ref={rowRef}
        className={cn(
          "grid min-w-0 gap-2 text-xs text-muted-foreground",
          showCount ? "grid-cols-[auto_repeat(3,minmax(0,1fr))]" : "grid-cols-3"
        )}
      >
        {showCount ? renderCountPill(countTestId) : null}
        {rowActions.map((action) => renderActionButton(action, false))}
      </div>
    ),
    [renderActionButton, renderCountPill]
  );

  const renderCompactGrid = useCallback(
    () => (
      <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] items-center gap-2">
        {renderCountPill("sidebar-selection-count", true)}
        {topActions.map((action) => renderActionButton(action, true, true))}
        <span aria-hidden />
        {bottomActions.map((action) => renderActionButton(action, true, true))}
      </div>
    ),
    [bottomActions, renderActionButton, renderCountPill, topActions]
  );

  return (
    <TooltipProvider delayDuration={120}>
      <div
        ref={hostRef}
        data-testid="sidebar-selection-footer"
        data-footer-mode={footerMode}
        className="relative w-full overflow-hidden rounded-[1.7rem] border border-border/68 bg-card/94 px-4 pb-3 pt-4 shadow-[0_18px_44px_rgba(3,8,16,0.26)] backdrop-blur-sm"
      >
        <div
          className="pointer-events-none absolute inset-x-4 top-3 invisible overflow-hidden space-y-2"
          aria-hidden
        >
          {renderActionRow(topActions, true, fullProbeTopRowRef)}
          {renderActionRow(bottomActions, false, fullProbeBottomRowRef)}
        </div>
        {footerMode === "icons" ? (
          renderCompactGrid()
        ) : (
          <div className="space-y-2">
            {renderActionRow(topActions, true, undefined, "sidebar-selection-count")}
            {renderActionRow(bottomActions)}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export function EditorFileBrowser({
  selectedSource,
  browserPath,
  onNavigateUp,
  onRefresh,
  sourcesLoading,
  treeLoading,
  rootItems,
  directoryItemsByPath,
  loadingPaths,
  expandedPaths,
  selectionOverride,
  onSelectionOverrideApplied,
  activeItemPath,
  activeItemType,
  activeItemSource,
  editingItem,
  onEditingValueChange,
  onEditingCommit,
  onEditingCancel,
  onDirectoryExpand,
  onFileOpen,
  onCreateFile,
  onCreateDirectory,
  onStartRename,
  onMoveEntries,
  onCopyEntries,
  onDeleteEntries,
}: {
  selectedSource: "local";
  browserPath: string;
  onNavigateUp: () => void;
  onRefresh: () => void;
  sourcesLoading: boolean;
  treeLoading: boolean;
  rootItems: FileItem[];
  directoryItemsByPath: Record<string, FileItem[]>;
  loadingPaths: string[];
  expandedPaths: string[];
  selectionOverride: TreeSelection[] | null;
  onSelectionOverrideApplied: () => void;
  activeItemPath: string | null;
  activeItemType: TreeItemType | null;
  activeItemSource: "local" | null;
  editingItem: TreeRenameTarget | null;
  onEditingValueChange: (value: string) => void;
  onEditingCommit: () => void;
  onEditingCancel: () => void;
  onDirectoryExpand: (item: FileItem) => void;
  onFileOpen: (item: FileItem) => void;
  onCreateFile: (parentPath?: string) => void;
  onCreateDirectory: (parentPath?: string) => void;
  onStartRename: (target: TreeSelection) => void;
  onMoveEntries: (
    entries: TreeSelection[],
    destinationPath: string
  ) => Promise<TreeSelection[] | undefined>;
  onCopyEntries: (
    entries: TreeSelection[],
    destinationPath: string
  ) => Promise<TreeSelection[] | undefined>;
  onDeleteEntries: (entries: TreeSelection[]) => Promise<void>;
}) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<TreeSelection[]>([]);
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<TreeSelection[] | null>(null);
  const shiftRangeAnchorPathRef = useRef<string | null>(null);
  const shiftPressedRef = useRef(false);
  const [clipboard, setClipboard] = useState<TreeClipboard | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialogState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [operationPending, setOperationPending] = useState(false);

  const expandedPathSet = useMemo(
    () => new Set(expandedPaths.map((path) => normalizeTreePath(path))),
    [expandedPaths]
  );
  const loadingPathSet = useMemo(
    () => new Set(loadingPaths.map((path) => normalizeTreePath(path))),
    [loadingPaths]
  );
  const shouldHighlightActiveSource = activeItemSource === selectedSource;
  const selectedPathSet = useMemo(
    () => new Set(selectedEntries.map((entry) => normalizeTreePath(entry.path))),
    [selectedEntries]
  );
  const cutPathSet = useMemo(() => {
    if (clipboard?.mode !== "cut") return new Set<string>();
    return new Set(clipboard.items.map((entry) => normalizeTreePath(entry.path)));
  }, [clipboard]);
  const selectedCount = selectedEntries.length;

  const visibleEntries = useMemo(() => {
    const entries: TreeSelection[] = [];
    const walk = (items: FileItem[]) => {
      for (const item of items) {
        const normalizedPath = normalizeTreePath(item.path);
        entries.push({
          source: selectedSource,
          path: normalizedPath,
          type: item.type,
        });
        if (item.type === "directory" && expandedPathSet.has(normalizedPath)) {
          walk(directoryItemsByPath[normalizedPath] ?? EMPTY_FILE_ITEMS);
        }
      }
    };
    walk(rootItems);
    return entries;
  }, [directoryItemsByPath, expandedPathSet, rootItems, selectedSource]);

  const knownPaths = useMemo(
    () => new Set(visibleEntries.map((entry) => entry.path)),
    [visibleEntries]
  );

  const updateSelection = useCallback(
    (nextEntries: TreeSelection[], anchorPath?: string | null) => {
      const normalized = sortSelection(dedupeSelection(nextEntries));
      setSelectedEntries(normalized);
      setSelectionAnchorPath(
        normalizeTreePath(anchorPath ?? normalized[normalized.length - 1]?.path ?? null)
      );
    },
    []
  );

  useEffect(() => {
    setSelectedEntries((current) =>
      current.filter((entry) => entry.source === selectedSource && knownPaths.has(entry.path))
    );
  }, [knownPaths, selectedSource]);

  useEffect(() => {
    if (selectionAnchorPath && !knownPaths.has(selectionAnchorPath)) {
      setSelectionAnchorPath(null);
    }
    if (shiftRangeAnchorPathRef.current && !knownPaths.has(shiftRangeAnchorPathRef.current)) {
      shiftRangeAnchorPathRef.current = null;
    }
  }, [knownPaths, selectionAnchorPath]);

  useEffect(() => {
    const requestedSelection = selectionOverride?.length ? selectionOverride : pendingSelection;
    if (!requestedSelection?.length) return;

    const normalizedPending = sortSelection(
      dedupeSelection(
        requestedSelection
          .filter((entry) => entry.source === selectedSource)
          .map((entry) => ({ ...entry, path: normalizeTreePath(entry.path) }))
      )
    );

    if (!normalizedPending.length) {
      if (selectionOverride?.length) {
        onSelectionOverrideApplied();
      } else {
        setPendingSelection(null);
      }
      return;
    }

    if (!normalizedPending.every((entry) => knownPaths.has(entry.path))) {
      return;
    }

    updateSelection(
      normalizedPending,
      normalizedPending[normalizedPending.length - 1]?.path ?? null
    );
    if (selectionOverride?.length) {
      onSelectionOverrideApplied();
    } else {
      setPendingSelection(null);
    }
  }, [
    knownPaths,
    onSelectionOverrideApplied,
    pendingSelection,
    selectedSource,
    selectionOverride,
    updateSelection,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        shiftPressedRef.current = true;
      }
    };

    const clearShiftAnchor = () => {
      shiftPressedRef.current = false;
      shiftRangeAnchorPathRef.current = null;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        clearShiftAnchor();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearShiftAnchor);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearShiftAnchor);
    };
  }, []);

  const resolveSelectionForTarget = useCallback(
    (target: TreeSelection | null) => {
      if (target && selectedPathSet.has(normalizeTreePath(target.path))) {
        return sortSelection(selectedEntries);
      }
      if (target) return [target];
      return sortSelection(selectedEntries);
    },
    [selectedEntries, selectedPathSet]
  );

  const getDirectoryTargetForSelection = useCallback(
    (target: TreeSelection | null) => {
      if (!target) return normalizeTreePath(browserPath);
      return target.type === "directory"
        ? normalizeTreePath(target.path)
        : getParentTreePath(target.path);
    },
    [browserPath]
  );

  const updateFocusedAnchor = useCallback((path: string | null | undefined) => {
    if (shiftPressedRef.current) {
      return;
    }
    shiftRangeAnchorPathRef.current = null;
    const normalizedPath = normalizeTreePath(path);
    setSelectionAnchorPath(normalizedPath || null);
  }, []);

  const handleToggleSelection = useCallback(
    (
      entry: TreeSelection,
      event?: Pick<ReactMouseEvent<HTMLElement>, "shiftKey" | "metaKey" | "ctrlKey">
    ) => {
      const normalizedEntry = { ...entry, path: normalizeTreePath(entry.path) };

      if (!event?.shiftKey) {
        shiftRangeAnchorPathRef.current = null;
      }

      if (event?.shiftKey) {
        const rangeAnchorPath =
          shiftRangeAnchorPathRef.current ?? selectionAnchorPath ?? normalizedEntry.path;
        const anchorIndex = visibleEntries.findIndex((item) => item.path === rangeAnchorPath);
        const targetIndex = visibleEntries.findIndex((item) => item.path === normalizedEntry.path);
        if (anchorIndex >= 0 && targetIndex >= 0) {
          if (!shiftRangeAnchorPathRef.current) {
            shiftRangeAnchorPathRef.current = rangeAnchorPath;
          }
          const [start, end] =
            anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          const ranged = visibleEntries.slice(start, end + 1);
          updateSelection(ranged, normalizedEntry.path);
          return;
        }
      }

      if (event?.metaKey || event?.ctrlKey) {
        if (selectedPathSet.has(normalizedEntry.path)) {
          updateSelection(
            selectedEntries.filter((current) => current.path !== normalizedEntry.path),
            normalizedEntry.path
          );
          return;
        }

        updateSelection([...selectedEntries, normalizedEntry], normalizedEntry.path);
        return;
      }

      if (selectedPathSet.has(normalizedEntry.path)) {
        updateSelection(
          selectedEntries.filter((current) => current.path !== normalizedEntry.path),
          normalizedEntry.path
        );
        return;
      }

      updateSelection([...selectedEntries, normalizedEntry], normalizedEntry.path);
    },
    [selectedEntries, selectedPathSet, selectionAnchorPath, updateSelection, visibleEntries]
  );

  const clearSelection = useCallback(() => {
    setPendingSelection(null);
    updateSelection([], null);
  }, [updateSelection]);

  const clearClipboardToast = useCallback(() => {
    dismissAdminToast(CLIPBOARD_TOAST_ID);
  }, []);

  const showClipboardToast = useCallback((nextClipboard: TreeClipboard) => {
    showAdminToast(
      "default",
      `${nextClipboard.mode === "copy" ? "复制" : "剪切"} ${nextClipboard.items.length} 项，右键目录或空白处后可粘贴。`,
      {
        toastId: CLIPBOARD_TOAST_ID,
        autoClose: false,
        closeOnClick: false,
      }
    );
  }, []);

  useEffect(() => {
    return () => {
      dismissAdminToast(CLIPBOARD_TOAST_ID);
    };
  }, []);

  const openContextMenu = useCallback(
    (
      target: TreeSelection | null,
      position: { x: number; y: number },
      currentDirectoryPath: string
    ) => {
      if (target && !selectedPathSet.has(normalizeTreePath(target.path))) {
        updateSelection([target], target.path);
      }
      setContextMenu({
        open: true,
        x: position.x,
        y: position.y,
        target,
        currentDirectoryPath,
      });
    },
    [selectedPathSet, updateSelection]
  );

  const executeCommand = useCallback(
    async (command: FileBrowserCommand, targetOverride?: TreeSelection | null) => {
      const target = targetOverride ?? contextMenu?.target ?? null;
      const entries = resolveSelectionForTarget(target);
      const directoryTarget =
        contextMenu?.currentDirectoryPath ?? getDirectoryTargetForSelection(target);

      if (command === "refresh") {
        onRefresh();
        setContextMenu(null);
        return;
      }

      if (command === "clear-selection") {
        clearSelection();
        clearClipboardToast();
        setContextMenu(null);
        return;
      }

      if (command === "new-file") {
        onCreateFile(directoryTarget);
        setContextMenu(null);
        return;
      }

      if (command === "new-directory") {
        onCreateDirectory(directoryTarget);
        setContextMenu(null);
        return;
      }

      if (command === "copy" || command === "cut") {
        if (!entries.length) return;
        const nextClipboard: TreeClipboard = {
          mode: command === "copy" ? "copy" : "cut",
          items: entries,
        };
        setClipboard(nextClipboard);
        showClipboardToast(nextClipboard);
        setContextMenu(null);
        return;
      }

      if (command === "paste") {
        if (!clipboard || operationPending) return;
        setOperationPending(true);
        try {
          let pastedEntries: TreeSelection[] | undefined;
          if (clipboard.mode === "copy") {
            pastedEntries = await onCopyEntries(clipboard.items, directoryTarget);
          } else {
            pastedEntries = await onMoveEntries(clipboard.items, directoryTarget);
            setClipboard(null);
            clearClipboardToast();
          }
          if (pastedEntries?.length) {
            setPendingSelection(pastedEntries);
            updateSelection(pastedEntries, pastedEntries[pastedEntries.length - 1]?.path ?? null);
          } else {
            clearSelection();
          }
          setContextMenu(null);
        } catch {
          // Parent handlers surface owner-facing errors.
        }
        setOperationPending(false);
        return;
      }

      if (command === "rename") {
        if (entries.length !== 1) return;
        onStartRename(entries[0]);
        setContextMenu(null);
        updateSelection(entries, entries[0].path);
        return;
      }

      if (command === "move") {
        if (!entries.length) return;
        setMoveDialog({
          entries,
          destinationPath: getDirectoryTargetForSelection(target),
        });
        setContextMenu(null);
        return;
      }

      if (command === "delete") {
        if (!entries.length) return;
        setDeleteDialog({ entries });
        setContextMenu(null);
      }
    },
    [
      clearSelection,
      clearClipboardToast,
      clipboard,
      contextMenu,
      getDirectoryTargetForSelection,
      onCopyEntries,
      onCreateDirectory,
      onCreateFile,
      onMoveEntries,
      onRefresh,
      onStartRename,
      operationPending,
      resolveSelectionForTarget,
      showClipboardToast,
      updateSelection,
    ]
  );

  const keyboardCommandTarget = useMemo(() => {
    const normalizedAnchor = normalizeTreePath(selectionAnchorPath);
    if (normalizedAnchor) {
      const anchoredEntry = selectedEntries.find((entry) => entry.path === normalizedAnchor);
      if (anchoredEntry) {
        return anchoredEntry;
      }
    }
    return selectedEntries[selectedEntries.length - 1] ?? null;
  }, [selectedEntries, selectionAnchorPath]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (moveDialog || deleteDialog || editingItem) return;

      const key = event.key.toLowerCase();

      if (key === "c") {
        if (!selectedEntries.length) return;
        event.preventDefault();
        void executeCommand("copy", keyboardCommandTarget);
        return;
      }

      if (key === "x") {
        if (!selectedEntries.length) return;
        event.preventDefault();
        void executeCommand("cut", keyboardCommandTarget);
        return;
      }

      if (key === "v") {
        if (!clipboard?.items.length) return;
        event.preventDefault();
        void executeCommand("paste", keyboardCommandTarget);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    clipboard?.items.length,
    deleteDialog,
    editingItem,
    executeCommand,
    keyboardCommandTarget,
    moveDialog,
    selectedEntries.length,
  ]);

  const clipboardDisabledTargets = useMemo(() => {
    const disabled = new Set<string>();
    for (const item of clipboard?.items ?? []) {
      if (item.type !== "directory") continue;
      disabled.add(normalizeTreePath(item.path));
      for (const entry of visibleEntries) {
        if (isTreePathAncestor(item.path, entry.path)) {
          disabled.add(normalizeTreePath(entry.path));
        }
      }
    }
    return disabled;
  }, [clipboard?.items, visibleEntries]);

  const contextMenuItems = useMemo(() => {
    const target = contextMenu?.target ?? null;
    const entries = resolveSelectionForTarget(target);
    const isMulti = entries.length > 1;
    const canPaste =
      Boolean(clipboard?.items.length) &&
      !clipboardDisabledTargets.has(normalizeTreePath(contextMenu?.currentDirectoryPath ?? ""));
    const items: ContextMenuItem[] = [];

    if (isMulti) {
      items.push(
        { id: "move", label: "移动", command: "move" },
        { id: "copy", label: "复制", command: "copy" },
        { id: "cut", label: "剪切", command: "cut" },
        { id: "paste", label: "粘贴", command: "paste", disabled: !canPaste },
        { id: "delete", label: "删除", command: "delete", destructive: true },
        {
          id: "clear-selection",
          label: "清空选择",
          command: "clear-selection",
          separatorBefore: true,
        }
      );
      return items;
    }

    if (!target) {
      return [
        { id: "paste", label: "粘贴", command: "paste", disabled: !canPaste },
        { id: "new-file", label: "新建文件", command: "new-file", separatorBefore: true },
        { id: "new-directory", label: "新建目录", command: "new-directory" },
        { id: "refresh", label: "刷新", command: "refresh", separatorBefore: true },
      ];
    }

    items.push(
      { id: "rename", label: "重命名", command: "rename" },
      { id: "move", label: "移动", command: "move" },
      { id: "copy", label: "复制", command: "copy" }
    );

    if (target.type === "directory") {
      items.push(
        { id: "paste", label: "粘贴", command: "paste", disabled: !canPaste },
        { id: "delete", label: "删除", command: "delete", destructive: true },
        { id: "new-file", label: "新建文件", command: "new-file", separatorBefore: true },
        { id: "new-directory", label: "新建目录", command: "new-directory" }
      );
    } else {
      items.push({ id: "delete", label: "删除", command: "delete", destructive: true });
    }

    return items;
  }, [clipboard?.items.length, clipboardDisabledTargets, contextMenu, resolveSelectionForTarget]);

  const performPrimaryAction = useCallback(
    (item: FileItem) => {
      const entry: TreeSelection = {
        source: selectedSource,
        path: normalizeTreePath(item.path),
        type: item.type,
      };

      updateFocusedAnchor(entry.path);

      if (item.type === "directory") {
        onDirectoryExpand(item);
        return;
      }

      onFileOpen(item);
    },
    [onDirectoryExpand, onFileOpen, selectedSource, updateFocusedAnchor]
  );

  const handlePrimaryAction = useCallback(
    (item: FileItem, event: ReactMouseEvent<HTMLElement>) => {
      const entry: TreeSelection = {
        source: selectedSource,
        path: normalizeTreePath(item.path),
        type: item.type,
      };

      if (isSelectionModifierEvent(event)) {
        event.preventDefault();
        handleToggleSelection(entry, event);
        return;
      }

      updateSelection([entry], entry.path);
      performPrimaryAction(item);
    },
    [handleToggleSelection, performPrimaryAction, selectedSource, updateSelection]
  );

  const renderTreeNodes = useCallback(
    (items: FileItem[], depth = 0): React.ReactNode =>
      items.map((item) => {
        const normalizedPath = normalizeTreePath(item.path);
        const isDirectory = item.type === "directory";
        const isExpanded = isDirectory && expandedPathSet.has(normalizedPath);
        const children = isDirectory
          ? (directoryItemsByPath[normalizedPath] ?? EMPTY_FILE_ITEMS)
          : [];
        const hasLoadedChildren =
          isDirectory && Object.hasOwn(directoryItemsByPath, normalizedPath);
        const directoryCount = hasLoadedChildren ? children.length : (item.count ?? 0);
        const isLoadingBranch = isDirectory && loadingPathSet.has(normalizedPath);
        const isActiveDirectory =
          shouldHighlightActiveSource &&
          activeItemType === "directory" &&
          isDirectory &&
          isTreePathSelected(item.path, activeItemPath);
        const isActiveFile =
          shouldHighlightActiveSource &&
          activeItemType !== "directory" &&
          isTreePathSelected(item.path, activeItemPath);
        const isActiveBranch =
          shouldHighlightActiveSource &&
          isDirectory &&
          isTreePathAncestor(item.path, activeItemPath);
        const isEditing =
          editingItem?.source === selectedSource &&
          editingItem.type === item.type &&
          isTreePathSelected(editingItem.path, item.path);
        const isSelected = selectedPathSet.has(normalizedPath);
        const isCutPending = cutPathSet.has(normalizedPath);
        const showActiveHighlight = selectedCount === 0;
        const entry: TreeSelection = {
          source: selectedSource,
          path: normalizedPath,
          type: item.type,
        };

        return (
          <div key={`${item.type}:${item.path}`} className="min-w-0 space-y-1">
            <div
              data-cut-pending={isCutPending || undefined}
              data-tree-row="true"
              className={cn(
                "relative flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-2xl border border-transparent px-3 py-2 text-left text-sm transition",
                !isEditing && "hover:bg-muted/40 hover:text-foreground",
                isSelected && "border-primary/35 bg-primary/10 text-primary shadow-sm",
                isCutPending && "saturate-75",
                !isSelected &&
                  showActiveHighlight &&
                  (isActiveFile || isActiveDirectory) &&
                  "border-primary/25 bg-primary/6 text-primary shadow-sm",
                !isSelected &&
                  showActiveHighlight &&
                  !isActiveFile &&
                  !isActiveDirectory &&
                  isActiveBranch &&
                  "border-border/35 bg-muted/40 text-foreground",
                !isActiveFile &&
                  !isActiveDirectory &&
                  !isActiveBranch &&
                  !isSelected &&
                  "text-foreground/88"
              )}
              style={{
                opacity: isCutPending ? 0.6 : undefined,
                paddingLeft: `${0.65 + depth * 0.45}rem`,
              }}
            >
              {!isEditing ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={isDirectory ? `${item.name} 目录` : `${item.name} 文件`}
                  className="absolute inset-0 z-0 rounded-2xl"
                  onClick={(event) => handlePrimaryAction(item, event)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openContextMenu(
                      entry,
                      { x: event.clientX, y: event.clientY },
                      getDirectoryTargetForSelection(entry)
                    );
                  }}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex min-w-0 flex-1 items-center gap-2",
                  !isEditing && "pointer-events-none"
                )}
              >
                <button
                  type="button"
                  className="pointer-events-auto flex shrink-0 items-center gap-2"
                  tabIndex={isEditing ? -1 : 0}
                  aria-label={isDirectory ? `${item.name} 目录` : `${item.name} 文件`}
                  onFocus={() => updateFocusedAnchor(entry.path)}
                  onClick={(event) => handlePrimaryAction(item, event)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openContextMenu(
                      entry,
                      { x: event.clientX, y: event.clientY },
                      getDirectoryTargetForSelection(entry)
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      openContextMenu(
                        entry,
                        { x: rect.left + 12, y: rect.bottom + 8 },
                        getDirectoryTargetForSelection(entry)
                      );
                    }
                  }}
                >
                  {isDirectory ? (
                    isExpanded ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )
                  ) : (
                    <span className="block size-4 shrink-0" />
                  )}
                  {selectionMode ? (
                    <Checkbox
                      checked={isSelected}
                      aria-label={`选择 ${item.name}`}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={() => handleToggleSelection(entry)}
                    />
                  ) : isDirectory ? (
                    <Folder
                      className={cn(
                        "size-4 shrink-0",
                        isActiveDirectory || isActiveBranch || isSelected
                          ? "text-primary"
                          : "text-primary"
                      )}
                    />
                  ) : (
                    <TreeFileTypeIcon
                      extension={item.extension}
                      active={isSelected || (showActiveHighlight && isActiveFile)}
                    />
                  )}
                </button>
                {isEditing && editingItem ? (
                  <InlineTreeNameInput
                    value={editingItem.value}
                    type={editingItem.type}
                    onChange={onEditingValueChange}
                    onCommit={onEditingCommit}
                    onCancel={onEditingCancel}
                  />
                ) : (
                  <button
                    type="button"
                    className="pointer-events-auto min-w-0 flex-1 truncate text-left"
                    onFocus={() => updateFocusedAnchor(entry.path)}
                    onClick={(event) => handlePrimaryAction(item, event)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openContextMenu(
                        entry,
                        { x: event.clientX, y: event.clientY },
                        getDirectoryTargetForSelection(entry)
                      );
                    }}
                  >
                    {item.name}
                  </button>
                )}
              </span>
              <div className="relative z-10 pointer-events-none flex shrink-0 items-center gap-2">
                {!isEditing && isDirectory ? (
                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap text-xs text-muted-foreground",
                      (isActiveFile || isActiveDirectory || isSelected) && "text-primary/80"
                    )}
                  >
                    {`${directoryCount} 项`}
                  </span>
                ) : null}
                {!isEditing ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="pointer-events-auto size-8 rounded-full"
                    aria-label={`${item.name} 更多操作`}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      openContextMenu(
                        entry,
                        { x: rect.left, y: rect.bottom + 6 },
                        getDirectoryTargetForSelection(entry)
                      );
                    }}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            {isDirectory && isExpanded ? (
              <div className="min-w-0 space-y-1">
                {isLoadingBranch && children.length === 0 ? (
                  <div
                    className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${1.35 + depth * 0.45}rem` }}
                  >
                    <Spinner /> 读取目录…
                  </div>
                ) : null}
                {children.length > 0 ? renderTreeNodes(children, depth + 1) : null}
                {!isLoadingBranch && children.length === 0 ? (
                  <div
                    className="px-3 py-1 text-xs text-muted-foreground"
                    style={{ paddingLeft: `${1.35 + depth * 0.45}rem` }}
                  >
                    当前目录为空。
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      }),
    [
      activeItemPath,
      activeItemType,
      cutPathSet,
      directoryItemsByPath,
      editingItem,
      expandedPathSet,
      getDirectoryTargetForSelection,
      handlePrimaryAction,
      handleToggleSelection,
      loadingPathSet,
      onEditingCancel,
      onEditingCommit,
      onEditingValueChange,
      openContextMenu,
      selectedPathSet,
      selectedSource,
      selectionMode,
      selectedCount,
      shouldHighlightActiveSource,
      updateFocusedAnchor,
    ]
  );

  const disabledMoveTargets = useMemo(() => {
    const disabled = new Map<string, string>();
    for (const entry of moveDialog?.entries ?? []) {
      const parentPath = getParentTreePath(entry.path);
      if (entry.type !== "directory") {
        if (!disabled.has(parentPath)) {
          disabled.set(parentPath, "当前文件已经在这个目录中，请选择其他目标目录。");
        }
        continue;
      }
      const normalizedPath = normalizeTreePath(entry.path);
      if (!disabled.has(normalizedPath)) {
        disabled.set(normalizedPath, "不能把目录移动到它自身。");
      }
      if (!disabled.has(parentPath)) {
        disabled.set(parentPath, "原目录不能作为移动目标。");
      }
      for (const candidate of visibleEntries) {
        if (isTreePathAncestor(entry.path, candidate.path)) {
          const candidatePath = normalizeTreePath(candidate.path);
          if (!disabled.has(candidatePath)) {
            disabled.set(candidatePath, "不能把目录移动到它的后代目录中。");
          }
        }
      }
    }
    return disabled;
  }, [moveDialog?.entries, visibleEntries]);

  const moveTargetLabel = useMemo(
    () => formatDirectoryTargetLabel(moveDialog?.destinationPath),
    [moveDialog?.destinationPath]
  );
  const moveTargetDisabledReason = useMemo(
    () => disabledMoveTargets.get(normalizeTreePath(moveDialog?.destinationPath)),
    [disabledMoveTargets, moveDialog?.destinationPath]
  );
  const moveDialogRule = useMemo(() => {
    const entries = moveDialog?.entries ?? [];
    if (entries.some((entry) => entry.type === "directory")) {
      return "灰色目录不可选：原目录、所选目录自身，以及它的后代目录。";
    }
    return "灰色目录不可选：已选文件当前所在的目录。";
  }, [moveDialog?.entries]);

  const deleteSummary = useMemo(() => {
    const entries = deleteDialog?.entries ?? [];
    const directories = entries.filter((entry) => entry.type === "directory").length;
    const files = entries.filter((entry) => entry.type === "file").length;
    const segments: string[] = [];
    if (files) segments.push(`${files} 个文件`);
    if (directories) segments.push(`${directories} 个目录`);
    return segments.join("、");
  }, [deleteDialog?.entries]);

  const selectionFloatingFooter = useMemo(
    () =>
      selectedCount > 0 && !contextMenu && !moveDialog && !deleteDialog ? (
        <SidebarSelectionFloatingFooter
          selectedCount={selectedCount}
          clipboardReady={Boolean(clipboard?.items.length)}
          onCommand={(command) => {
            void executeCommand(command);
          }}
        />
      ) : null,
    [clipboard?.items.length, contextMenu, deleteDialog, executeCommand, moveDialog, selectedCount]
  );

  const floatingFooterVisible = Boolean(selectionFloatingFooter);

  useAppShellSidebarFloatingFooter(selectionFloatingFooter);

  return (
    <div
      role="tree"
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-t border-border/54",
        floatingFooterVisible ? "border-b-0" : "border-b border-border/54"
      )}
      data-testid="editor-file-browser"
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        openContextMenu(
          null,
          { x: event.clientX, y: event.clientY },
          normalizeTreePath(browserPath)
        );
      }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/54 py-3">
        <div>
          <div className="font-medium">文件浏览器</div>
          <div className="text-xs text-muted-foreground">浏览内容源，打开要编辑的文件。</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-4">
        <div className="grid min-w-0 shrink-0 gap-2 pb-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={selectionMode ? "secondary" : "outline"}
              onClick={() => setSelectionMode((current) => !current)}
              title="切换批量选择模式"
              aria-label="切换批量选择模式"
            >
              <CheckSquare className="size-4" />
              {selectionMode ? "复选框已开" : "批量选择"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCreateFile(normalizeTreePath(browserPath))}
              title="新建文件"
              aria-label="新建文件"
            >
              <FilePlus2 className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCreateDirectory(normalizeTreePath(browserPath))}
              title="新建目录"
              aria-label="新建目录"
            >
              <FolderPlus className="size-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={onNavigateUp} disabled={!browserPath}>
              <FolderUp className="size-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCcw className="size-4" />
            </Button>
          </div>

          <div
            className="min-w-0 truncate rounded-2xl bg-muted/32 px-3 py-2 text-xs text-muted-foreground"
            title={browserPath || "根目录"}
          >
            {browserPath || "根目录"}
          </div>
        </div>

        <div className="admin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
          {sourcesLoading || (treeLoading && rootItems.length === 0) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> 读取文件树…
            </div>
          ) : rootItems.length > 0 ? (
            renderTreeNodes(rootItems)
          ) : (
            <div className="text-sm text-muted-foreground">当前目录为空。</div>
          )}
        </div>
      </div>

      <FileBrowserContextMenu
        state={contextMenu}
        items={contextMenuItems}
        onClose={() => setContextMenu(null)}
        onSelect={(command) => {
          void executeCommand(command);
        }}
      />

      <Dialog open={moveDialog !== null} onOpenChange={(open) => !open && setMoveDialog(null)}>
        <DialogContent className="flex max-h-[min(90vh,820px)] min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle className="pr-8 text-xl font-semibold">选择目标目录</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-muted-foreground">
              目标将应用于 {moveDialog?.entries.length ?? 0} 项。不能移动到自身、后代目录或原目录。
            </DialogDescription>
          </DialogHeader>
          {moveDialog ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-2">
              <div className="grid gap-2">
                <div
                  className={cn(
                    "rounded-2xl border px-4 py-3",
                    moveTargetDisabledReason
                      ? "border-warning/24 bg-warning/12 text-foreground"
                      : "border-border/56 bg-muted/18 text-foreground"
                  )}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    目标目录
                  </div>
                  <div className="mt-1 truncate text-sm font-medium" title={moveTargetLabel}>
                    {moveTargetLabel}
                  </div>
                  {moveTargetDisabledReason ? (
                    <div className="mt-2 text-xs leading-5 text-warning">
                      {moveTargetDisabledReason}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      选择后会立即作为本次移动的目标位置。
                    </div>
                  )}
                </div>
                <div className="px-1 text-xs leading-5 text-muted-foreground">{moveDialogRule}</div>
              </div>
              <DirectoryPickerTree
                selectedSource={selectedSource}
                rootItems={rootItems}
                directoryItemsByPath={directoryItemsByPath}
                expandedPaths={expandedPaths}
                loadingPaths={loadingPaths}
                selectedPath={moveDialog.destinationPath}
                disabledReasons={disabledMoveTargets}
                className="h-full min-h-[min(14rem,30vh)] flex-1 max-h-none sm:min-h-[min(18rem,36vh)]"
                onSelect={(path) =>
                  setMoveDialog((current) =>
                    current ? { ...current, destinationPath: path } : current
                  )
                }
                onDirectoryExpand={onDirectoryExpand}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog(null)}>
              取消
            </Button>
            <Button
              disabled={operationPending || !moveDialog || Boolean(moveTargetDisabledReason)}
              onClick={async () => {
                if (!moveDialog) return;
                setOperationPending(true);
                try {
                  await onMoveEntries(moveDialog.entries, moveDialog.destinationPath);
                  setMoveDialog(null);
                  clearSelection();
                } catch {
                  // Parent handlers surface owner-facing errors.
                }
                setOperationPending(false);
              }}
            >
              {operationPending ? <Spinner /> : <FolderInput className="size-4" />}
              确认移动
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialog !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null);
        }}
        destructive
        title="确认删除"
        description={`将删除 ${deleteSummary || "选中项目"}。仅支持删除文件和空目录，此操作不可撤销。`}
        confirmLabel="删除"
        onConfirm={async () => {
          if (!deleteDialog) return;
          setOperationPending(true);
          try {
            await onDeleteEntries(deleteDialog.entries);
            setDeleteDialog(null);
            clearSelection();
          } catch {
            // Parent handlers surface owner-facing errors.
          }
          setOperationPending(false);
        }}
      />
    </div>
  );
}
