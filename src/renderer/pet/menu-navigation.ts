export function menuTargetIndex(key: string, current: number, count: number): number | null {
  if (!count) return null;
  switch (key) {
    case 'ArrowDown': return (current + 1) % count;
    case 'ArrowUp': return current <= 0 ? count - 1 : current - 1;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}
