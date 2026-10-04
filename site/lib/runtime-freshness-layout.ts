export interface FreshnessLayout {
  columns: number;
  rows: number;
  gap: number;
  cellSize: number;
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

  if (count === 0) return { columns: 30, rows: 1, gap: 0, cellSize: 0 };

  const columns = Math.max(30, Math.ceil(Math.sqrt((count * width) / height)));
  const rows = Math.ceil(count / columns);
  const gap = Math.min(designGap, width / (2 * columns), height / (2 * rows));
  const cellSize = Math.min(
    8,
    (width - (columns - 1) * gap) / columns,
    (height - (rows - 1) * gap) / rows
  );

  return { columns, rows, gap, cellSize };
}
