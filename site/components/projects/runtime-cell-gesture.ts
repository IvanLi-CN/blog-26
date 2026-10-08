export interface RuntimeTouchPoint {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export type RuntimeTouchGesturePhase = "idle" | "pressing" | "inspecting";

export interface RuntimeTouchMoveResult {
  cancelled: boolean;
  point: RuntimeTouchPoint | null;
  preventDefault: boolean;
}

export interface RuntimeTouchGestureController {
  readonly phase: RuntimeTouchGesturePhase;
  start(point: RuntimeTouchPoint): void;
  move(points: RuntimeTouchPoint[]): RuntimeTouchMoveResult;
  end(): { recognized: boolean };
  cancel(): void;
  isInspecting(): boolean;
}

interface Options {
  jitterPx?: number;
  longPressMs?: number;
  onRecognized?: (point: RuntimeTouchPoint) => void;
}

function distanceSquared(a: RuntimeTouchPoint, b: RuntimeTouchPoint) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function createRuntimeTouchGestureController({
  jitterPx = 8,
  longPressMs = 500,
  onRecognized,
}: Options = {}): RuntimeTouchGestureController {
  let phase: RuntimeTouchGesturePhase = "idle";
  let originPoint: RuntimeTouchPoint | null = null;
  let activePoint: RuntimeTouchPoint | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const cancel = () => {
    clearTimer();
    phase = "idle";
    originPoint = null;
    activePoint = null;
  };

  return {
    get phase() {
      return phase;
    },
    start(point) {
      cancel();
      originPoint = { ...point };
      activePoint = { ...point };
      phase = "pressing";
      timer = setTimeout(() => {
        timer = null;
        if (phase !== "pressing" || !activePoint) return;
        phase = "inspecting";
        onRecognized?.({ ...activePoint });
      }, longPressMs);
    },
    move(points) {
      if (phase === "idle") {
        return { cancelled: false, point: null, preventDefault: false };
      }
      if (points.length !== 1) {
        cancel();
        return { cancelled: true, point: null, preventDefault: false };
      }
      const nextPoint = points[0];
      if (!activePoint || nextPoint.id !== activePoint.id) {
        return { cancelled: false, point: null, preventDefault: false };
      }
      if (phase === "pressing") {
        if (!originPoint || distanceSquared(originPoint, nextPoint) > jitterPx ** 2) {
          cancel();
          return { cancelled: true, point: null, preventDefault: false };
        }
        activePoint = { ...nextPoint };
        return { cancelled: false, point: null, preventDefault: false };
      }
      activePoint = { ...nextPoint };
      return { cancelled: false, point: { ...activePoint }, preventDefault: true };
    },
    end() {
      const recognized = phase === "inspecting";
      cancel();
      return { recognized };
    },
    cancel,
    isInspecting() {
      return phase === "inspecting";
    },
  };
}
