export const RUNTIME_METRIC_MOTION_DURATION = 500;

const motionEase = "cubic-bezier(.22,1,.36,1)";
const digitPattern = /^\d$/u;

export type RuntimeMetricWheel = {
  from: string;
  to: string;
  direction: "up" | "down" | "neutral";
  cycles: number;
  position: number;
};

export type RuntimeMetricMotionPlan = {
  from: string;
  to: string;
  wheels: RuntimeMetricWheel[];
};

type RuntimeMetricMotionElement = HTMLElement & {
  animate?: Element["animate"];
};

type RuntimeMetricMotionOptions = {
  duration?: number;
  prefersReducedMotion?: () => boolean;
  now?: () => number;
  frame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
};

const getDigitStep = (from: string, to: string) => {
  if (!digitPattern.test(from) || !digitPattern.test(to) || from === to) {
    return { direction: "neutral" as const, cycles: 0 };
  }
  const fromDigit = Number(from);
  const toDigit = Number(to);
  const up = (toDigit - fromDigit + 10) % 10;
  const down = (fromDigit - toDigit + 10) % 10;
  if (up === 0 || down === 0) return { direction: "neutral" as const, cycles: 0 };
  if (up <= down) return { direction: "up" as const, cycles: Math.min(up, 3) };
  return { direction: "down" as const, cycles: Math.min(down, 3) };
};

export function createRuntimeMetricMotionPlan(from: string, to: string): RuntimeMetricMotionPlan {
  const wheels: RuntimeMetricWheel[] = [];
  const length = Math.max(from.length, to.length);
  for (let position = 0; position < length; position += 1) {
    const fromIndex = from.length - length + position;
    const toIndex = to.length - length + position;
    const fromChar = from[fromIndex] ?? "";
    const toChar = to[toIndex] ?? "";
    if (fromChar === toChar) continue;
    const digitStep = getDigitStep(fromChar, toChar);
    wheels.push({
      from: fromChar,
      to: toChar,
      direction: digitStep.direction,
      cycles: digitStep.cycles || 1,
      position,
    });
  }
  return { from, to, wheels };
}

function sequenceForWheel(wheel: RuntimeMetricWheel) {
  if (
    wheel.direction === "neutral" ||
    !digitPattern.test(wheel.from) ||
    !digitPattern.test(wheel.to)
  ) {
    return [wheel.from || " ", wheel.to || " "];
  }
  const start = Number(wheel.from);
  const direction = wheel.direction === "up" ? 1 : -1;
  return Array.from({ length: wheel.cycles + 1 }, (_, index) =>
    String((start + direction * index + 10) % 10)
  );
}

function getVisualElement(value: HTMLElement) {
  let visual = value.querySelector<HTMLElement>("[data-runtime-value-visual]");
  if (!visual) {
    visual = document.createElement("span");
    visual.className = "runtime-value-visual";
    visual.dataset.runtimeValueVisual = "";
    visual.setAttribute("aria-hidden", "true");
    value.replaceChildren(visual);
  }
  return visual;
}

function renderStatic(value: HTMLElement, text: string) {
  const visual = getVisualElement(value);
  visual.textContent = text;
  value.dataset.runtimeValueVisible = text;
  value.dataset.runtimeValueAnimating = "false";
}

function prefersReducedMotionDefault() {
  if (typeof document === "undefined" || typeof window === "undefined") return true;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
    document.hidden ||
    document.documentElement.dataset.webDemoMotion === "reduce"
  );
}

export function createRuntimeMetricMotion(
  value: HTMLElement,
  options: RuntimeMetricMotionOptions = {}
) {
  const duration = options.duration ?? RUNTIME_METRIC_MOTION_DURATION;
  const prefersReducedMotion = options.prefersReducedMotion ?? prefersReducedMotionDefault;
  const now = options.now ?? (() => performance.now());
  const frame = options.frame ?? ((callback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((id) => window.cancelAnimationFrame(id));
  const animations: Animation[] = [];
  let currentText = value.dataset.runtimeValueVisible ?? value.textContent?.trim() ?? "";
  let targetText = currentText;
  let animationStart = 0;
  let frameId: number | undefined;
  let settleTimer: number | undefined;
  let destroyed = false;

  const cancelAnimations = () => {
    for (const animation of animations.splice(0)) animation.cancel();
    if (frameId !== undefined) cancelFrame(frameId);
    if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    frameId = undefined;
    settleTimer = undefined;
  };

  const settleToCurrent = () => {
    if (currentText !== targetText) {
      const progress = Math.min(1, Math.max(0, (now() - animationStart) / duration));
      currentText = progress >= 0.52 ? targetText : currentText;
    }
    cancelAnimations();
    renderStatic(value, currentText);
  };

  const updateCurrentFrame = () => {
    frameId = undefined;
    if (destroyed || value.dataset.runtimeValueAnimating !== "true") return;
    const progress = Math.min(1, Math.max(0, (now() - animationStart) / duration));
    if (progress >= 0.52) currentText = targetText;
    if (progress < 1) frameId = frame(updateCurrentFrame);
  };

  const animateTo = (nextText: string) => {
    const fromText = currentText;
    const plan = createRuntimeMetricMotionPlan(fromText, nextText);
    if (!plan.wheels.length) {
      targetText = nextText;
      renderStatic(value, nextText);
      return;
    }

    targetText = nextText;
    animationStart = now();
    const visual = getVisualElement(value);
    visual.replaceChildren();
    value.dataset.runtimeValueAnimating = "true";
    value.dataset.runtimeValueMotionFrom = fromText;
    value.dataset.runtimeValueMotionTo = nextText;
    value.dataset.runtimeValueMotionWheels = String(plan.wheels.length);

    const wheelsByPosition = new Map(plan.wheels.map((wheel) => [wheel.position, wheel]));
    const length = Math.max(fromText.length, nextText.length);
    for (let position = 0; position < length; position += 1) {
      const wheel = wheelsByPosition.get(position);
      const targetChar = nextText[nextText.length - length + position] ?? "";
      if (!wheel) {
        const staticChar = document.createElement("span");
        staticChar.className = "runtime-value-token";
        staticChar.textContent = targetChar;
        visual.appendChild(staticChar);
        continue;
      }

      const wheelNode = document.createElement("span");
      wheelNode.className = "runtime-value-wheel";
      wheelNode.dataset.runtimeValueWheel = "";
      wheelNode.dataset.runtimeValueWheelDirection = wheel.direction;
      wheelNode.dataset.runtimeValueWheelCycles = String(wheel.cycles);
      const track = document.createElement("span");
      track.className = "runtime-value-wheel-track";
      for (const character of sequenceForWheel(wheel)) {
        const token = document.createElement("span");
        token.className = "runtime-value-wheel-token";
        token.textContent = character;
        track.appendChild(token);
      }
      wheelNode.appendChild(track);
      visual.appendChild(wheelNode);

      if (typeof track.animate !== "function") continue;
      const finalOffset = -((track.childElementCount - 1) / track.childElementCount) * 100;
      try {
        const animation = (track as RuntimeMetricMotionElement).animate(
          [{ transform: "translateY(0%)" }, { transform: `translateY(${finalOffset}%)` }],
          { duration, easing: motionEase, fill: "both" }
        );
        animations.push(animation);
      } catch {
        // A browser without Web Animations still gets the final readable value.
      }
    }
    if (frameId === undefined) frameId = frame(updateCurrentFrame);
    const revision = targetText;
    settleTimer = window.setTimeout(() => {
      settleTimer = undefined;
      if (!destroyed && targetText === revision) {
        currentText = targetText;
        cancelAnimations();
        renderStatic(value, targetText);
      }
    }, duration);
    for (const animation of animations) void animation.finished.catch(() => undefined);
  };

  renderStatic(value, currentText);

  return {
    update(nextText: string, animate = true) {
      if (destroyed) return;
      if (value.dataset.runtimeValueAnimating === "true") settleToCurrent();
      if (!animate || prefersReducedMotion() || currentText === nextText) {
        targetText = nextText;
        renderStatic(value, nextText);
        return;
      }
      animateTo(nextText);
    },
    settle() {
      if (destroyed) return;
      targetText = currentText;
      settleToCurrent();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimations();
      renderStatic(value, targetText);
    },
    get currentText() {
      return currentText;
    },
    get isAnimating() {
      return value.dataset.runtimeValueAnimating === "true";
    },
  };
}
