/**
 * Polymarket Precision Price & Probability Formatters
 * Accurately formats prices, percentages, and cents without losing decimal precision (e.g. 99.1¢ / 99.1% / $0.991)
 */

/**
 * Formats a Polymarket price in dollars with proper decimal precision.
 * If the price has 3 or 4 decimal places (e.g. 0.991), displays $0.991 instead of truncating to $0.99.
 */
export function formatDollar(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '$0.50';
  const num = Number(val);
  
  // Check if there are significant digits beyond 2 decimals (e.g. 0.991, 0.005)
  const cents10x = Math.round(num * 1000);
  if (cents10x % 10 !== 0) {
    return `$${num.toFixed(3)}`;
  }
  return `$${num.toFixed(2)}`;
}

/**
 * Formats probability percentage preserving decimals (e.g. 99.1%, 68.5%, 50%).
 */
export function formatProbability(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '50%';
  const num = Number(val);
  const pct = num * 100;
  
  // If exact whole integer percentage (e.g. 50%), show 50%, otherwise 1 decimal place (e.g. 99.1%)
  const rounded1 = Math.round(pct * 10) / 10;
  if (rounded1 % 1 === 0) {
    return `${rounded1.toFixed(0)}%`;
  }
  return `${rounded1.toFixed(1)}%`;
}

/**
 * Formats price in cents (e.g. 99.1¢, 68¢, 0.5¢), matching Polymarket's native display.
 */
export function formatCents(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '50¢';
  const num = Number(val);
  const cents = num * 100;
  const rounded1 = Math.round(cents * 10) / 10;
  if (rounded1 % 1 === 0) {
    return `${rounded1.toFixed(0)}¢`;
  }
  return `${rounded1.toFixed(1)}¢`;
}

/**
 * Formats a combined price headline (e.g. "$0.991 (99.1¢)")
 */
export function formatPriceWithCents(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '$0.50 (50¢)';
  const dollar = formatDollar(val);
  const cents = formatCents(val);
  return `${dollar} (${cents})`;
}
