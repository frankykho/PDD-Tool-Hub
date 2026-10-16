export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function safeDiv(
  numerator: number,
  denominator: number,
  fallback = 0,
): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return fallback;
  }

  if (denominator === 0) {
    return fallback;
  }

  return numerator / denominator;
}

export function nz(value: number | null | undefined, fallback = 0): number {
  return value == null || !Number.isFinite(value) ? fallback : value;
}

export function sma(values: number[], length: number): number | null {
  if (length <= 0 || values.length < length) {
    return null;
  }

  const window = values.slice(values.length - length);

  if (window.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return window.reduce((sum, value) => sum + value, 0) / length;
}

export function rma(
  values: number[],
  length: number,
): number | null {
  if (length <= 0 || values.length < length) {
    return null;
  }

  let result =
    values
      .slice(0, length)
      .reduce(
        (sum, value) => sum + value,
        0,
      ) / length;

  for (
    let i = length;
    i < values.length;
    i += 1
  ) {
    result =
      (result * (length - 1) +
        values[i]) /
      length;
  }

  return result;
}

export function highest(values: number[], length: number): number | null {
  if (length <= 0 || values.length < length) {
    return null;
  }

  const window = values.slice(values.length - length);

  if (window.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return Math.max(...window);
}

export function lowest(values: number[], length: number): number | null {
  if (length <= 0 || values.length < length) {
    return null;
  }

  const window = values.slice(values.length - length);

  if (window.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return Math.min(...window);
}

export function trueRange(
  high: number,
  low: number,
  previousClose: number | null,
): number {
  if (previousClose == null || !Number.isFinite(previousClose)) {
    return high - low;
  }

  return Math.max(
    high - low,
    Math.abs(high - previousClose),
    Math.abs(low - previousClose),
  );
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  length: number,
): number | null {
  if (
    length <= 0 ||
    highs.length === 0 ||
    highs.length !== lows.length ||
    highs.length !== closes.length
  ) {
    return null;
  }

  const trueRanges: number[] = [];

  for (let i = 0; i < highs.length; i += 1) {
    const previousClose =
      i > 0
        ? closes[i - 1]
        : closes[i];

    trueRanges.push(
      trueRange(
        highs[i],
        lows[i],
        previousClose,
      ),
    );
  }

  return rma(
    trueRanges,
    length,
  );
}

export function efficiencyRatio(
  closes: number[],
  length: number,
): number | null {
  if (length <= 0 || closes.length <= length) {
    return null;
  }

  const current = closes[closes.length - 1];
  const start = closes[closes.length - 1 - length];

  if (!Number.isFinite(current) || !Number.isFinite(start)) {
    return null;
  }

  const netChange = Math.abs(current - start);

  let volatility = 0;

  for (
    let i = closes.length - length;
    i < closes.length;
    i += 1
  ) {
    const currentClose = closes[i];
    const previousClose = closes[i - 1];

    if (!Number.isFinite(currentClose) || !Number.isFinite(previousClose)) {
      return null;
    }

    volatility += Math.abs(currentClose - previousClose);
  }

  return clamp(safeDiv(netChange, volatility, 0), 0, 1);
}

export function standardDeviation(
  values: number[],
  length: number,
): number | null {
  if (length <= 0 || values.length < length) {
    return null;
  }

  const window = values.slice(values.length - length);

  if (window.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const mean =
    window.reduce((sum, value) => sum + value, 0) / window.length;

  const variance =
    window.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    window.length;

  return Math.sqrt(variance);
}

export function zScore(
  values: number[],
  length: number,
): number | null {
  if (length <= 0 || values.length < length) {
    return null;
  }

  const mean = sma(values, length);
  const deviation = standardDeviation(values, length);

  if (mean == null || deviation == null) {
    return null;
  }

  if (deviation === 0) {
    return 0;
  }

  return safeDiv(values[values.length - 1] - mean, deviation, 0);
}

export function rsi(
  closes: number[],
  length: number,
): number | null {
  if (
    length <= 0 ||
    closes.length <= length
  ) {
    return null;
  }

  const gains: number[] = [];
  const losses: number[] = [];

  for (
    let i = 1;
    i < closes.length;
    i += 1
  ) {
    const change =
      closes[i] - closes[i - 1];

    gains.push(
      Math.max(change, 0),
    );

    losses.push(
      Math.max(-change, 0),
    );
  }

  const averageGain = rma(
    gains,
    length,
  );

  const averageLoss = rma(
    losses,
    length,
  );

  if (
    averageGain == null ||
    averageLoss == null
  ) {
    return null;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength =
    averageGain / averageLoss;

  return 100 -
    100 /
      (1 + relativeStrength);
}

export function mapClamp(
  value: number,
  sourceMin: number,
  sourceMax: number,
  targetMin: number,
  targetMax: number,
): number {
  if (sourceMax === sourceMin) {
    return targetMin;
  }

  const normalized = clamp(
    safeDiv(value - sourceMin, sourceMax - sourceMin, 0),
    0,
    1,
  );

  return targetMin + normalized * (targetMax - targetMin);
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}