// ─── utils/formatting.ts ─────────────────────────────────────────────────────

/**
 * Format a volatility score + regime for display.
 */
export function formatVolatility(score: number, regime: string): string {
  const bar = score >= 80 ? '●●●●●'
    : score >= 60 ? '●●●●○'
    : score >= 40 ? '●●●○○'
    : score >= 20 ? '●●○○○'
    : '●○○○○';
  return `${bar} ${score} (${regime})`;
}

/**
 * Format a percentage for display, handling null gracefully.
 */
export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(1)}%`;
}

/**
 * Capitalise first letter of a string.
 */
export function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Render a simple key-value section as plain HTML table rows.
 */
export function kvRows(pairs: [string, string][]): string {
  return pairs
    .map(([k, v]) => `<tr><td class="key">${k}</td><td class="val">${v}</td></tr>`)
    .join('\n');
}

/**
 * Escape HTML special characters to prevent injection in webviews.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
