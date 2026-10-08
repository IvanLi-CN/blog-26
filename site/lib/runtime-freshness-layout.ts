export interface FreshnessLayout {
  columns: number;
  rows: number;
  gap: number;
  cellSize: number;
  gridHeight: number;
}

export function calculateFreshnessLayout(
  count: number,
  width: number,
  height: number,
  designGap: number
): FreshnessLayout | null {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(designGap) ||
    designGap < 0
  ) {
    return null;
  }

  if (count === 0) return { columns: 30, rows: 0, gap: 0, cellSize: 0, gridHeight: 0 };

  const gapRatio = designGap / 8;
  const minimumColumns = Math.max(30, Math.ceil((width / 8 + gapRatio) / (1 + gapRatio)));
  const minimumHeightColumns = Math.ceil((width / height + gapRatio) / (1 + gapRatio));
  let upperColumns = Math.max(minimumColumns, count, minimumHeightColumns);
  const epsilon = 1e-9;

  const measure = (columns: number) => {
    const cellSize = width / (columns + gapRatio * (columns - 1));
    const rows = Math.ceil(count / columns);
    const gap = gapRatio * cellSize;
    const gridHeight = rows * cellSize + (rows - 1) * gap;
    return { columns, rows, gap, cellSize, gridHeight };
  };
  const fits = (layout: ReturnType<typeof measure>) =>
    layout.cellSize <= 8 + epsilon && layout.gridHeight <= height + epsilon;

  while (!fits(measure(upperColumns))) {
    const nextColumns = Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.max(upperColumns + 1, upperColumns * 2)
    );
    if (nextColumns === upperColumns) return null;
    upperColumns = nextColumns;
  }

  let lowerColumns = minimumColumns;
  while (lowerColumns < upperColumns) {
    const middleColumns = lowerColumns + Math.floor((upperColumns - lowerColumns) / 2);
    if (fits(measure(middleColumns))) {
      upperColumns = middleColumns;
    } else {
      lowerColumns = middleColumns + 1;
    }
  }

  return measure(lowerColumns);
}
