import { transitionFor } from '../transitions.ts';
import type { PetModel } from './types.ts';
export function updateAnimation(model: PetModel, name: string | null, loop: boolean): number {
  if (!name || !model.animationDurations.has(name)) return 0;
  const current = model.spine.state.getCurrent(0);
  const from = current?.animation?.name;
  if (from === name && current.loop === loop) return 0;
  const plan = transitionFor(from, name, [...model.animationDurations.keys()]);
  const entry = model.spine.state.setAnimation(0, plan.bridge ?? name, plan.bridge ? false : loop);
  entry.mixDuration = plan.mix;
  if (!plan.bridge) return 0;
  const delay = plan.delay < 0 ? model.animationDurations.get(plan.bridge)! : plan.delay;
  const target = model.spine.state.addAnimation(0, name, loop, delay);
  target.mixDuration = 0.22;
  return delay;
}

export function pickRandom<T>(values: T[]): T | null {
  return values.length ? values[Math.floor(Math.random() * values.length)]! : null;
}

export function chooseIdle(model: PetModel): void {
  model.head.cancel();
  updateAnimation(model, pickRandom(model.idleAnimations), true);
}
