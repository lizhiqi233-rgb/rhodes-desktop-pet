export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayArea {
  id: number;
  workArea: Rect;
  scaleFactor: number;
}

const DRAG_THRESHOLD = 5;
const DEFAULT_MARGIN = 24;

function validatePoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("Point coordinates must be finite");
  }
}

function validateSize(size: Size): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new RangeError("Size dimensions must be finite and positive");
  }
}

function validateArea(area: Rect): void {
  if (
    !Number.isFinite(area.x) ||
    !Number.isFinite(area.y) ||
    !Number.isFinite(area.width) ||
    !Number.isFinite(area.height) ||
    area.width <= 0 ||
    area.height <= 0 ||
    !Number.isFinite(area.x + area.width) ||
    !Number.isFinite(area.y + area.height)
  ) {
    throw new RangeError("Area coordinates must be finite with positive dimensions");
  }
}

function primaryOrFirst(displays: readonly DisplayArea[], primaryId: number): DisplayArea {
  if (displays.length === 0) throw new RangeError("At least one display is required");
  return displays.find((display) => display.id === primaryId) ?? displays[0]!;
}

function preferDisplay(candidate: DisplayArea, current: DisplayArea, primaryId: number): boolean {
  if (candidate.id === primaryId || current.id === primaryId) {
    return candidate.id === primaryId;
  }
  return candidate.id < current.id;
}

export function pixelSizeToDip(size: Size, scaleFactor: number): Size {
  validateSize(size);
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    throw new RangeError("Display scale must be finite and positive");
  }
  return {
    width: Math.max(1, Math.floor(size.width / scaleFactor)),
    height: Math.max(1, Math.floor(size.height / scaleFactor)),
  };
}

export function resizeAnchoredPosition(position: Point, previous: Size, next: Size): Point {
  validatePoint(position);
  validateSize(previous);
  validateSize(next);
  return {
    x: position.x + (previous.width - next.width) / 2,
    y: position.y + previous.height - next.height,
  };
}


export function clampPosition(point: Point, size: Size, area: Rect): Point {
  validatePoint(point);
  validateSize(size);
  validateArea(area);

  if (size.width > area.width || size.height > area.height) {
    return { x: area.x, y: area.y };
  }

  return {
    x: Math.min(area.x + area.width - size.width, Math.max(area.x, point.x)),
    y: Math.min(area.y + area.height - size.height, Math.max(area.y, point.y)),
  };
}

function bottomRightPosition(size: Size, area: Rect): Point {
  validateSize(size);
  validateArea(area);
  return clampPosition(
    {
      x: area.x + Math.max(0, area.width - size.width - DEFAULT_MARGIN),
      y: area.y + Math.max(0, area.height - size.height - DEFAULT_MARGIN),
    },
    size,
    area,
  );
}

export function restorePlacement(
  saved: { displayId: number | null; position: Point | null },
  size: Size,
  displays: readonly DisplayArea[],
  primaryId: number,
): { displayId: number; position: Point } {
  validateSize(size);

  const savedDisplay = saved.displayId === null
    ? undefined
    : displays.find((display) => display.id === saved.displayId);

  if (savedDisplay !== undefined) {
    const position = saved.position === null
      ? bottomRightPosition(size, savedDisplay.workArea)
      : clampPosition(saved.position, size, savedDisplay.workArea);
    return { displayId: savedDisplay.id, position };
  }

  const primary = primaryOrFirst(displays, primaryId);
  return {
    displayId: primary.id,
    position: bottomRightPosition(size, primary.workArea),
  };
}

function contains(area: Rect, point: Point): boolean {
  return point.x >= area.x && point.y >= area.y &&
    point.x < area.x + area.width && point.y < area.y + area.height;
}

function distanceToArea(point: Point, area: Rect): number {
  const dx = Math.max(area.x - point.x, 0, point.x - (area.x + area.width));
  const dy = Math.max(area.y - point.y, 0, point.y - (area.y + area.height));
  return Math.hypot(dx, dy);
}

export function displayForPoint(
  point: Point,
  displays: readonly DisplayArea[],
  primaryId: number,
): DisplayArea {
  validatePoint(point);
  if (displays.length === 0) throw new RangeError("At least one display is required");

  let selected: DisplayArea | undefined;
  let selectedContainsPoint = false;
  let selectedDistance = Infinity;

  for (const display of displays) {
    validateArea(display.workArea);
    const isContained = contains(display.workArea, point);

    if (isContained) {
      if (!selectedContainsPoint || preferDisplay(display, selected!, primaryId)) {
        selected = display;
        selectedContainsPoint = true;
      }
    } else if (!selectedContainsPoint) {
      const distance = distanceToArea(point, display.workArea);
      if (
        selected === undefined ||
        distance < selectedDistance ||
        (distance === selectedDistance && preferDisplay(display, selected, primaryId))
      ) {
        selected = display;
        selectedDistance = distance;
      }
    }
  }

  return selected!;
}

export class DragGesture {
  private startX: number | null = null;
  private startY: number | null = null;
  private lastX: number | null = null;
  private lastY: number | null = null;
  private dragged = false;

  begin(point: Point): void {
    validatePoint(point);
    this.startX = this.lastX = point.x;
    this.startY = this.lastY = point.y;
    this.dragged = false;
  }

  move(point: Point): { dragging: boolean; delta: Point } {
    validatePoint(point);
    const { startX, startY, lastX, lastY } = this;
    if (startX === null || startY === null || lastX === null || lastY === null) {
      return { dragging: false, delta: { x: 0, y: 0 } };
    }

    let deltaX = 0;
    let deltaY = 0;
    if (this.dragged) {
      deltaX = point.x - lastX;
      deltaY = point.y - lastY;
    } else {
      deltaX = point.x - startX;
      deltaY = point.y - startY;
      if (Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
        this.dragged = true;
      } else {
        deltaX = 0;
        deltaY = 0;
      }
    }

    this.lastX = point.x;
    this.lastY = point.y;
    return { dragging: this.dragged, delta: { x: deltaX, y: deltaY } };
  }

  end(): { clicked: boolean; dragged: boolean } {
    const active = this.startX !== null;
    const dragged = active && this.dragged;
    this.reset();
    return { clicked: active && !dragged, dragged };
  }

  cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.startX = null;
    this.startY = null;
    this.lastX = null;
    this.lastY = null;
    this.dragged = false;
  }
}
