const attached = new WeakMap<HTMLElement, () => void>();

export function attachPlaybookResourceBrowser(root: HTMLElement) {
  attached.get(root)?.();
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view) return undefined;
  const panels = Array.from(
    root.querySelectorAll<HTMLDetailsElement>("[data-playbook-file-panel]")
  );
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>("[data-playbook-file]"));
  const sidebar = root.querySelector<HTMLElement>(".playbook-file-sidebar");
  const workspace = root.querySelector<HTMLElement>("[data-playbook-resource-workspace]");
  const dialog = root.querySelector<HTMLDialogElement>("[data-playbook-resource-fullscreen]");
  const expand = root.querySelector<HTMLButtonElement>("[data-playbook-resource-expand]");
  if (!panels.length || !sidebar || !workspace || !dialog || !expand) return undefined;
  let current = Number(root.dataset.initialFile) || 0;
  let treeOpen = true;
  let compact = workspace.getBoundingClientRect().width < 640;
  let treeAnimation: Animation | undefined;
  let expanded = false;
  let inlineHeight = "";
  let bodyOverflow = "";
  let pageOverflow = "";
  const scrollSelector =
    ".playbook-file-sidebar nav, .playbook-file-reading, .playbook-file-source pre";
  const scrollPositions = new WeakMap<HTMLElement, { top: number; left: number }>();
  const saveScrollPositions = () => {
    for (const scroller of root.querySelectorAll<HTMLElement>(scrollSelector)) {
      if (scroller.getClientRects().length)
        scrollPositions.set(scroller, { top: scroller.scrollTop, left: scroller.scrollLeft });
    }
  };
  const restoreScrollPositions = () => {
    for (const scroller of root.querySelectorAll<HTMLElement>(scrollSelector)) {
      const position = scrollPositions.get(scroller);
      if (!position || !scroller.getClientRects().length) continue;
      scroller.scrollTop = position.top;
      scroller.scrollLeft = position.left;
    }
  };
  const trackScroll = (event: Event) => {
    const target = event.target;
    if (
      !(target instanceof view.HTMLElement) ||
      !target.matches(scrollSelector) ||
      !target.getClientRects().length
    )
      return;
    scrollPositions.set(target, { top: target.scrollTop, left: target.scrollLeft });
  };
  const syncExpansionButton = () => {
    expand.setAttribute("aria-expanded", String(expanded));
    const label = expanded ? "退出放大显示" : "放大公开资源";
    expand.setAttribute("aria-label", label);
    expand.title = label;
  };
  const restoreExpansion = () => {
    if (!expanded) return;
    saveScrollPositions();
    expanded = false;
    dialog.before(workspace);
    root.style.height = inlineHeight;
    doc.body.style.overflow = bodyOverflow;
    doc.documentElement.style.overflow = pageOverflow;
    delete root.dataset.fullscreen;
    syncExpansionButton();
    restoreScrollPositions();
    if (root.isConnected) expand.focus({ preventScroll: true });
  };
  const setExpanded = (open: boolean) => {
    if (open === expanded) return;
    if (!open) {
      saveScrollPositions();
      dialog.close();
      restoreExpansion();
      return;
    }
    inlineHeight = root.style.height;
    bodyOverflow = doc.body.style.overflow;
    pageOverflow = doc.documentElement.style.overflow;
    saveScrollPositions();
    // Keep the original page geometry while moving the same live workspace into the top layer.
    root.style.height = `${root.getBoundingClientRect().height}px`;
    dialog.append(workspace);
    expanded = true;
    root.dataset.fullscreen = "true";
    syncExpansionButton();
    doc.body.style.overflow = "hidden";
    doc.documentElement.style.overflow = "hidden";
    dialog.showModal();
    restoreScrollPositions();
    expand.focus({ preventScroll: true });
  };
  const focusToggle = () =>
    panels[current]
      ?.querySelector<HTMLButtonElement>("[data-playbook-tree-open]")
      ?.focus({ preventScroll: true });
  const revealSelection = () => {
    if (!treeOpen) return;
    const link = links.find((item) => Number(item.dataset.playbookFile) === current);
    const navigation = sidebar.querySelector("nav");
    if (!link?.getClientRects().length || !navigation) return;
    const selected = link.getBoundingClientRect();
    const visible = navigation.getBoundingClientRect();
    // Scroll only the tree; reopening it must preserve the reader's page position.
    if (selected.top < visible.top) navigation.scrollTop -= visible.top - selected.top;
    else if (selected.bottom > visible.bottom)
      navigation.scrollTop += selected.bottom - visible.bottom;
  };
  const setTree = (open: boolean, animate = true) => {
    const wasVisible = !sidebar.hidden;
    const previous = wasVisible ? view.getComputedStyle(sidebar) : undefined;
    const startOpacity = previous?.opacity ?? "0";
    const startTransform = previous?.transform ?? "translate(-4px, -6px)";
    treeAnimation?.cancel();
    treeAnimation = undefined;
    treeOpen = open;
    sidebar.inert = !open;
    sidebar.setAttribute("aria-hidden", String(!open));
    root.dataset.treeOpen = String(open);
    for (const button of root.querySelectorAll<HTMLElement>("[data-playbook-tree-open]")) {
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "关闭文件树" : "展开文件树");
    }
    const motion =
      compact && animate && !view.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (motion && typeof sidebar.animate === "function" && (open || wasVisible)) {
      sidebar.hidden = false;
      const animation = sidebar.animate(
        [
          { opacity: startOpacity, transform: startTransform },
          { opacity: open ? "1" : "0", transform: open ? "none" : "translate(-4px, -6px)" },
        ],
        { duration: 160, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
      treeAnimation = animation;
      animation.finished
        .then(() => {
          if (treeAnimation !== animation) return;
          sidebar.hidden = !treeOpen;
          treeAnimation = undefined;
        })
        // Rapid toggles and disposal cancel the previous transition.
        .catch(() => undefined);
    } else sidebar.hidden = !open;
    revealSelection();
  };
  const select = (index: number) => {
    saveScrollPositions();
    current = index;
    for (const panel of panels) {
      const selected = Number(panel.dataset.playbookFilePanel) === index;
      panel.hidden = !selected;
      panel.open = selected;
    }
    for (const link of links) {
      if (Number(link.dataset.playbookFile) === index) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
    restoreScrollPositions();
    revealSelection();
  };
  const selectHash = () => {
    const panel = panels.find((item) => `#${item.id}` === view.location.hash);
    if (panel) select(Number(panel.dataset.playbookFilePanel));
  };
  const click = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof view.Element)) return;
    if (target.closest("[data-playbook-resource-expand]")) {
      setExpanded(!expanded);
      return;
    }
    const close = target.closest("[data-playbook-tree-close]");
    const toggle = target.closest("[data-playbook-tree-open]");
    if (close || toggle) {
      setTree(close ? false : !treeOpen);
      if (!treeOpen) focusToggle();
      else if (treeOpen)
        links
          .find((link) => Number(link.dataset.playbookFile) === current)
          ?.focus({ preventScroll: true });
      return;
    }
    const mode = target.closest<HTMLElement>("[data-playbook-file-view]");
    if (mode) {
      const panel = panels[current];
      const reading = panel.querySelector<HTMLElement>("[data-playbook-file-reading]");
      const source = panel.querySelector<HTMLElement>("[data-playbook-file-source]");
      if (reading && source) {
        saveScrollPositions();
        reading.hidden = mode.dataset.playbookFileView !== "read";
        source.hidden = !reading.hidden;
        restoreScrollPositions();
        for (const button of panel.querySelectorAll<HTMLElement>("[data-playbook-file-view]"))
          button.setAttribute("aria-pressed", String(button === mode));
      }
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a[href^='#']");
    if (
      !link ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    const panel = panels.find((item) => `#${item.id}` === link.getAttribute("href"));
    if (!panel) return;
    event.preventDefault();
    select(Number(panel.dataset.playbookFilePanel));
    view.history.replaceState(null, "", `#${panel.id}`);
    if (compact) {
      setTree(false);
      panel.querySelector<HTMLElement>(".playbook-file-path")?.focus({ preventScroll: true });
    }
  };
  const dismissOutside = (event: PointerEvent) => {
    const target = event.target;
    if (!compact || !treeOpen || !(target instanceof view.Element)) return;
    if (
      sidebar.contains(target) ||
      target.closest("[data-playbook-tree-open]")?.closest("[data-playbook-resource-browser]") ===
        root
    )
      return;
    if (sidebar.contains(doc.activeElement)) focusToggle();
    setTree(false);
  };
  const dismissEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    if (compact && treeOpen) {
      event.preventDefault();
      setTree(false);
      focusToggle();
    } else if (expanded) {
      event.preventDefault();
      setExpanded(false);
    }
  };
  const cancelExpansion = (event: Event) => {
    event.preventDefault();
    if (compact && treeOpen) {
      setTree(false);
      focusToggle();
    } else setExpanded(false);
  };
  const closeExpansion = () => {
    if (!dialog.open) restoreExpansion();
  };
  const resize = new view.ResizeObserver(() => {
    const nextCompact = workspace.getBoundingClientRect().width < 640;
    if (nextCompact === compact) return;
    const treeFocused = sidebar.contains(doc.activeElement);
    compact = nextCompact;
    setTree(!compact, false);
    if (compact && treeFocused) focusToggle();
  });
  root.dataset.enhanced = "true";
  select(current);
  selectHash();
  setTree(!compact, false);
  resize.observe(workspace);
  root.addEventListener("click", click);
  root.addEventListener("scroll", trackScroll, true);
  doc.addEventListener("pointerdown", dismissOutside);
  doc.addEventListener("keydown", dismissEscape);
  dialog.addEventListener("cancel", cancelExpansion);
  dialog.addEventListener("close", closeExpansion);
  view.addEventListener("hashchange", selectHash);
  const dispose = () => {
    root.removeEventListener("click", click);
    root.removeEventListener("scroll", trackScroll, true);
    doc.removeEventListener("pointerdown", dismissOutside);
    doc.removeEventListener("keydown", dismissEscape);
    dialog.removeEventListener("cancel", cancelExpansion);
    dialog.removeEventListener("close", closeExpansion);
    view.removeEventListener("hashchange", selectHash);
    resize.disconnect();
    treeAnimation?.cancel();
    if (dialog.open) dialog.close();
    restoreExpansion();
    delete root.dataset.enhanced;
    delete root.dataset.treeOpen;
    sidebar.hidden = false;
    sidebar.inert = false;
    sidebar.removeAttribute("aria-hidden");
    for (const panel of panels) panel.hidden = false;
    attached.delete(root);
  };
  attached.set(root, dispose);
  return dispose;
}

if (typeof document !== "undefined") {
  let disposers: (() => void)[] = [];
  const dispose = () => {
    for (const detach of disposers) detach();
    disposers = [];
  };
  const refresh = () => {
    dispose();
    disposers = Array.from(
      document.querySelectorAll<HTMLElement>("[data-playbook-resource-browser]")
    )
      .map(attachPlaybookResourceBrowser)
      .filter((detach): detach is () => void => !!detach);
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
  document.addEventListener("astro:page-load", refresh);
  document.addEventListener("astro:before-swap", dispose);
}
