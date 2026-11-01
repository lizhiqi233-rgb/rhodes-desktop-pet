import { clampPosition, type Rect } from '../geometry.ts';

// Fractional-DPI rounding is not invertible; preserve requested coordinates that the user has not changed.
export function managementBoundsToSave(requested: Rect, initial: Rect, current: Rect): Rect {
  return {
    x: current.x === initial.x ? requested.x : current.x,
    y: current.y === initial.y ? requested.y : current.y,
    width: current.width === initial.width ? requested.width : current.width,
    height: current.height === initial.height ? requested.height : current.height,
  };
}

export function menuBounds(character: Rect, workArea: Rect): Rect {
  const margin = Math.min(12, workArea.width / 4, workArea.height / 4);
  const area = {
    x: workArea.x + margin, y: workArea.y + margin,
    width: workArea.width - margin * 2, height: workArea.height - margin * 2,
  };
  const scale = Math.min(1, area.width / 272, area.height / 232);
  const size = { width: Math.max(1, Math.floor(272 * scale)), height: Math.max(1, Math.floor(232 * scale)) };
  const right = character.x + character.width + 12;
  const x = right + size.width <= area.x + area.width ? right : character.x - 12 - size.width;
  const position = clampPosition({ x, y: character.y + (character.height - size.height) / 2 }, size, area);
  return { x: Math.round(position.x), y: Math.round(position.y), ...size };
}
