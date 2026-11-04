/** "1206 × 2622" with locale digit grouping off (sizes read better without it). */
export function formatSize(width: number, height: number, locale: string): string {
  const format = new Intl.NumberFormat(locale, { useGrouping: false });
  return `${format.format(width)} × ${format.format(height)}`;
}
