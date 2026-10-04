const activeOutlines = new WeakMap<Document, () => void>();

function attachMobileNavigation(doc: Document, detail: HTMLElement) {
  const view = doc.defaultView;
  const card = detail.querySelector<HTMLElement>("[data-playbook-mobile-contents]");
  const source = detail.querySelector<HTMLElement>("[data-playbook-floating-source]");
  if (!view || !card || !source) return undefined;

  // Keep React/Astro's source untouched. Fixed controls must escape the reading container.
  const floating = source.cloneNode(true) as HTMLElement;
  floating.removeAttribute("data-playbook-floating-source");
  floating.setAttribute("data-playbook-floating-controls", "");
  floating.dataset.open = "false";
  doc.body.append(floating);
  const panel = floating.querySelector<HTMLElement>("[data-playbook-floating-panel]");
  const group = floating.querySelector<HTMLElement>("[data-playbook-floating-group]");
  const toggle = floating.querySelector<HTMLButtonElement>("[data-playbook-floating-toggle]");
  const close = floating.querySelector<HTMLButtonElement>("[data-playbook-floating-close]");
  const top = floating.querySelector<HTMLButtonElement>("[data-playbook-floating-top]");
  if (!panel || !group || !toggle || !close || !top) {
    floating.remove();
    return undefined;
  }
  panel.id = "playbook-floating-contents";
  toggle.setAttribute("aria-controls", panel.id);

  const mobile = view.matchMedia("(max-width: 1023px)");
  const reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false;
  let generation = 0;
  let frame = 0;
  let motions: Animation[] = [];
  const cancelMotion = () => {
    generation += 1;
    for (const motion of motions) motion.cancel();
    motions = [];
  };
  const setOpen = (open: boolean, restoreFocus = false) => {
    floating.dataset.open = String(open);
    panel.inert = !open;
    panel.setAttribute("aria-hidden", String(!open));
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "收起目录" : "打开目录");
    if (open) {
      const link =
        panel.querySelector<HTMLAnchorElement>('a[aria-current="location"]') ??
        panel.querySelector<HTMLAnchorElement>("a");
      link?.focus({ preventScroll: true });
      link?.scrollIntoView({ block: "nearest", behavior: "instant" });
    } else if (restoreFocus) toggle.focus({ preventScroll: true });
  };
  const setVisible = (next: boolean) => {
    if (next === visible) return;
    const previousStyle = view.getComputedStyle(floating);
    const previousTransform = previousStyle.transform;
    const previousOpacity = previousStyle.opacity;
    visible = next;
    cancelMotion();
    const currentGeneration = generation;
    if (next) {
      floating.hidden = false;
      floating.inert = false;
      floating.dataset.phase = "entering";
      const rect = floating.getBoundingClientRect();
      const dx = view.innerWidth / 2 - (rect.left + rect.width / 2);
      const dy = 16 - rect.top;
      const flight = floating.animate(
        reduced.matches
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              {
                offset: 0,
                transform: `translate(${dx}px, ${dy}px)`,
                opacity: 0,
                filter: "blur(2px)",
              },
              {
                offset: 0.18,
                transform: `translate(${dx * 0.82}px, ${dy * 0.79}px)`,
                opacity: 1,
                filter: "blur(0px)",
              },
              { offset: 0.72, transform: "translate(-10px, -28px)", opacity: 1 },
              { offset: 1, transform: "translate(0, 0)", opacity: 1, filter: "blur(0px)" },
            ],
        { duration: reduced.matches ? 100 : 620, easing: "cubic-bezier(0.22, 0.65, 0.32, 1)" }
      );
      motions.push(flight);
      if (!reduced.matches) {
        motions.push(
          group.animate(
            [
              { transform: "scale(0.8) rotate(-7deg)" },
              { offset: 0.68, transform: "scale(0.99) rotate(1.5deg)" },
              { transform: "scale(1) rotate(0deg)" },
            ],
            { duration: 620, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
          )
        );
      }
      void flight.finished
        .then(() => {
          if (generation === currentGeneration) floating.dataset.phase = "settled";
        })
        .catch(() => undefined);
    } else {
      if (floating.contains(doc.activeElement)) {
        card.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
      }
      setOpen(false);
      floating.inert = true;
      floating.dataset.phase = "exiting";
      const fade = floating.animate(
        [
          { opacity: previousOpacity, transform: previousTransform },
          { opacity: 0, transform: previousTransform },
        ],
        {
          duration: reduced.matches ? 100 : 150,
          fill: "forwards",
        }
      );
      motions.push(fade);
      void fade.finished
        .then(() => {
          if (generation !== currentGeneration) return;
          floating.hidden = true;
          floating.dataset.phase = "hidden";
          cancelMotion();
        })
        .catch(() => undefined);
    }
  };
  const refresh = () => {
    frame = 0;
    floating.style.setProperty(
      "--playbook-outline-top",
      detail.style.getPropertyValue("--playbook-outline-top")
    );
    floating.style.setProperty("--playbook-viewport-width", `${doc.documentElement.clientWidth}px`);
    setVisible(mobile.matches && card.getBoundingClientRect().bottom <= 0);
  };
  const schedule = () => {
    if (!frame) frame = view.requestAnimationFrame(refresh);
  };
  const onToggle = () => setOpen(floating.dataset.open !== "true");
  const onClose = () => setOpen(false, true);
  const onTop = () => {
    setOpen(false);
    const title = detail.querySelector<HTMLElement>("h1");
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
    view.scrollTo({ top: 0, behavior: reduced.matches ? "instant" : "smooth" });
  };
  const onLink = (event: MouseEvent) => {
    const link =
      event.target instanceof view.Element
        ? event.target.closest<HTMLAnchorElement>("a[href^='#']")
        : null;
    const hash = link?.getAttribute("href");
    const target = hash && doc.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    setOpen(false);
    view.history.pushState(view.history.state, "", hash);
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: reduced.matches ? "instant" : "smooth" });
  };
  const onOutside = (event: PointerEvent) => {
    if (floating.dataset.open !== "true") return;
    if (event.target instanceof view.Node && !floating.contains(event.target)) {
      setOpen(false, panel.contains(doc.activeElement));
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && floating.dataset.open === "true") {
      event.preventDefault();
      setOpen(false, true);
    }
  };
  const onMotionChange = () => {
    cancelMotion();
    floating.hidden = !visible;
    floating.dataset.phase = visible ? "settled" : "hidden";
  };

  const observer = new view.IntersectionObserver(schedule);
  observer.observe(card);
  view.addEventListener("scroll", schedule, { passive: true });
  view.addEventListener("resize", schedule);
  mobile.addEventListener("change", schedule);
  reduced.addEventListener("change", onMotionChange);
  toggle.addEventListener("click", onToggle);
  close.addEventListener("click", onClose);
  top.addEventListener("click", onTop);
  panel.addEventListener("click", onLink);
  doc.addEventListener("pointerdown", onOutside);
  doc.addEventListener("keydown", onKey);
  refresh();
  return () => {
    cancelMotion();
    view.cancelAnimationFrame(frame);
    observer.disconnect();
    view.removeEventListener("scroll", schedule);
    view.removeEventListener("resize", schedule);
    mobile.removeEventListener("change", schedule);
    reduced.removeEventListener("change", onMotionChange);
    doc.removeEventListener("pointerdown", onOutside);
    doc.removeEventListener("keydown", onKey);
    floating.remove();
  };
}

function attachContentsTracking(doc: Document, detail: HTMLElement) {
  const view = doc.defaultView;
  if (!view) return undefined;
  const linksById = new Map<string, HTMLAnchorElement[]>();
  for (const link of doc.querySelectorAll<HTMLAnchorElement>("[data-playbook-contents-link]")) {
    const id = decodeURIComponent(link.hash.slice(1));
    if (!doc.getElementById(id)) continue;
    linksById.set(id, [...(linksById.get(id) ?? []), link]);
  }
  const targets = [...linksById.keys()].flatMap((id) => {
    const element = doc.getElementById(id);
    return element && detail.contains(element) ? [{ id, element }] : [];
  });
  if (!targets.length) return undefined;
  let frame = 0;
  let currentId: string | undefined;
  const update = () => {
    frame = 0;
    const header = doc.querySelector<HTMLElement>("[data-public-header]");
    const anchorOffset = Number.parseFloat(detail.style.getPropertyValue("--playbook-outline-top"));
    const threshold =
      Math.max(
        (header?.getBoundingClientRect().bottom ?? 0) + 24,
        Number.isFinite(anchorOffset) ? anchorOffset : 0
      ) + 2;
    let nextId = targets[0].id;
    for (const target of targets) {
      if (target.element.getBoundingClientRect().top > threshold) break;
      nextId = target.id;
    }
    if (nextId === currentId) return;
    currentId = nextId;
    const parents = new Set<string>();
    let parentId = linksById.get(nextId)?.[0].dataset.playbookContentsParent;
    while (parentId && !parents.has(parentId)) {
      parents.add(parentId);
      parentId = linksById.get(parentId)?.[0].dataset.playbookContentsParent;
    }
    for (const [id, links] of linksById) {
      for (const link of links) {
        if (id === nextId) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
        if (parents.has(id)) link.dataset.activeParent = "true";
        else delete link.dataset.activeParent;
      }
    }
  };
  const schedule = () => {
    if (!frame) frame = view.requestAnimationFrame(update);
  };
  view.addEventListener("scroll", schedule, { passive: true });
  view.addEventListener("resize", schedule);
  view.addEventListener("hashchange", schedule);
  update();
  return () => {
    view.cancelAnimationFrame(frame);
    view.removeEventListener("scroll", schedule);
    view.removeEventListener("resize", schedule);
    view.removeEventListener("hashchange", schedule);
  };
}

// CSS supplies a fixed fallback for readers with JavaScript disabled.
// Measure the shared header because its tools can wrap to a second row.
export function attachPlaybookOutlineOffset(doc: Document) {
  activeOutlines.get(doc)?.();
  const view = doc.defaultView;
  const header = doc.querySelector<HTMLElement>("[data-public-header]");
  const detail = doc.querySelector<HTMLElement>("[data-playbook-detail]");
  if (!view || !header || !detail) return undefined;

  const update = () => {
    const gap = Number.parseFloat(view.getComputedStyle(doc.documentElement).fontSize) * 1.5;
    detail.style.setProperty(
      "--playbook-outline-top",
      `${Math.ceil(header.getBoundingClientRect().height + gap)}px`
    );
  };
  const observer = new view.ResizeObserver(update);
  observer.observe(header);
  update();
  const detachMobile = attachMobileNavigation(doc, detail);
  const detachTracking = attachContentsTracking(doc, detail);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    detachMobile?.();
    detachTracking?.();
    if (activeOutlines.get(doc) === dispose) activeOutlines.delete(doc);
  };
  activeOutlines.set(doc, dispose);
  return dispose;
}

if (typeof document !== "undefined") {
  let dispose: (() => void) | undefined;
  const refresh = () => {
    dispose?.();
    dispose = attachPlaybookOutlineOffset(document);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    refresh();
  }
  document.addEventListener("astro:page-load", refresh);
  document.addEventListener("astro:before-swap", () => dispose?.());
}
