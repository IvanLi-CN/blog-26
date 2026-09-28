const runtimeUnits = [
  { threshold: 1_000_000_000_000, suffix: "T" },
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 1_000, suffix: "K" },
] as const;

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
  useGrouping: false,
});

const formatPlainValue = (value: number, maximumFractionDigits: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    useGrouping: false,
  }).format(value);

const formatScaledValue = (value: number, unitIndex: number, maximumFractionDigits: number) => {
  const unit = runtimeUnits[unitIndex];
  const scaledValue = unit ? value / unit.threshold : value;
  const formattedValue = new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    useGrouping: false,
  }).format(scaledValue);
  return `${formattedValue}${unit?.suffix ?? ""}`;
};

export function formatRuntimeValue(value: number): string {
  if (!Number.isFinite(value)) return "0";

  const absoluteValue = Math.abs(value);
  let unitIndex = runtimeUnits.findIndex(({ threshold }) => absoluteValue >= threshold);
  if (unitIndex < 0) unitIndex = runtimeUnits.length;

  const unit = runtimeUnits[unitIndex];
  const scaledValue = unit ? absoluteValue / unit.threshold : absoluteValue;
  if (unitIndex > 0 && Number(scaledValue.toFixed(3)) >= 1000) unitIndex -= 1;

  const formattedValue =
    unitIndex === runtimeUnits.length
      ? compactNumberFormatter.format(value)
      : formatScaledValue(Math.abs(value) * (value < 0 ? -1 : 1), unitIndex, 3);
  return value < 0 && !formattedValue.startsWith("-") ? `-${formattedValue}` : formattedValue;
}

export function getRuntimeValueCandidates(value: number): string[] {
  if (!Number.isFinite(value)) return ["0"];

  const absoluteValue = Math.abs(value);
  const baseUnitIndex = runtimeUnits.findIndex(({ threshold }) => absoluteValue >= threshold);
  const normalizedBaseUnitIndex = baseUnitIndex < 0 ? runtimeUnits.length : baseUnitIndex;
  const unitIndexes = [
    normalizedBaseUnitIndex,
    ...Array.from(
      { length: normalizedBaseUnitIndex },
      (_, index) => normalizedBaseUnitIndex - index - 1
    ),
  ];
  const candidates: string[] = [];

  for (const unitIndex of unitIndexes) {
    const unit = runtimeUnits[unitIndex];
    const scaledValue = unit ? absoluteValue / unit.threshold : absoluteValue;
    for (const maximumFractionDigits of [3, 2, 1, 0]) {
      const roundedValue = Number(scaledValue.toFixed(maximumFractionDigits));
      if (unit && roundedValue >= 1000) continue;
      if (unit && unitIndex < normalizedBaseUnitIndex && roundedValue < 1) continue;
      const formattedValue =
        unitIndex === runtimeUnits.length
          ? formatPlainValue(value, maximumFractionDigits)
          : formatScaledValue(
              Math.abs(value) * (value < 0 ? -1 : 1),
              unitIndex,
              maximumFractionDigits
            );
      const candidate =
        value < 0 && !formattedValue.startsWith("-") ? `-${formattedValue}` : formattedValue;
      if (!candidates.includes(candidate)) candidates.push(candidate);
    }
  }

  return candidates.length ? candidates : [formatRuntimeValue(value)];
}
