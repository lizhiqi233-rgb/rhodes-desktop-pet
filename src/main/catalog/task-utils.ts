
export async function mapLimit<T, U>(items: readonly T[], limit: number, callback: (item: T) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await callback(items[index]!);
    }
  }));
  return output;
}
