export function transitionFor(from: string | undefined, to: string, names: readonly string[]): { bridge: string | null; mix: number; delay: number } {
  const resting = (name: string | undefined) => /^(sit|sleep)$/i.test(name ?? '');
  const authored = from && names.find((name) => name.toLowerCase() === `${from}_to_${to}`.toLowerCase());
  if (authored) return { bridge: authored, mix: 0.12, delay: -1 };
  const stand = names.find((name) => /^(relax|idle|stand)$/i.test(name));
  if (resting(from) && stand && to !== stand) return { bridge: stand, mix: 0.45, delay: 0.65 };
  return { bridge: null, mix: resting(from) || resting(to) ? 0.45 : 0.18, delay: 0 };
}
