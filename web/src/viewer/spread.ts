// Page 0 is the cover, shown alone (on the right); then spreads [1,2], [3,4], …
const spreadStart = (index: number) => (index <= 0 ? 0 : index % 2 ? index : index - 1);

export function visiblePages(index: number, total: number, spread: boolean): number[] {
  if (!spread) return [index];
  const s = spreadStart(index);
  return s === 0 ? [0] : [s, s + 1].filter((i) => i < total);
}

export function nextIndex(index: number, total: number, spread: boolean): number {
  const n = spread ? (index <= 0 ? 1 : spreadStart(index) + 2) : index + 1;
  return n < total ? n : index;
}

export function prevIndex(index: number, total: number, spread: boolean): number {
  if (!spread) return Math.max(index - 1, 0);
  const s = spreadStart(index);
  return s <= 1 ? 0 : s - 2;
}
