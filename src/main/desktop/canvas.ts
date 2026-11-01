import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
import { pixelSizeToDip, resizeAnchoredPosition } from '../geometry.ts';
import type { DisplayArea, Point, Size } from '../geometry.ts';
import type { FurnitureCanvasState } from '../desktop.ts';
import type { DesktopPlacementState } from './placement.ts';
import { getDesktopDisplays } from './placement.ts';

type Placement = {
  readonly position: Point;
  display(): DisplayArea;
  place(position: Point, display: DisplayArea, nextSize?: Size): void;
  savePlacement(): Promise<void>;
};

export function createFurnitureCanvasController(options: {
  window: BrowserWindow;
  state: DesktopPlacementState;
  placement: Placement;
}): {
  captureFurnitureCanvas(): FurnitureCanvasState;
  restoreFurnitureCanvas(state: FurnitureCanvasState): Promise<void>;
  resizeFurnitureCanvas(width: number): Promise<Size>;
} {
  const { window, state, placement } = options;
  return {
    captureFurnitureCanvas(): FurnitureCanvasState {
      if (window.isDestroyed()) throw new Error('Desktop is not available');
      const display = placement.display();
      const baselineSize = pixelSizeToDip(state.baselinePixelSize, display.scaleFactor);
      return {
        ...state.pixelSize,
        baselineWidth: state.baselinePixelSize.width,
        baselineHeight: state.baselinePixelSize.height,
        displayId: display.id,
        position: resizeAnchoredPosition(
          placement.position,
          state.size,
          baselineSize,
        ),
      };
    },
    async restoreFurnitureCanvas(canvas: FurnitureCanvasState): Promise<void> {
      if (window.isDestroyed()) return;
      if (![canvas.width, canvas.height, canvas.baselineWidth, canvas.baselineHeight].every((value) => Number.isInteger(value) && value > 0 && value <= 8192)
          || typeof canvas.displayId !== 'number' || !Number.isFinite(canvas.position.x) || !Number.isFinite(canvas.position.y)) {
        throw new Error('Invalid furniture canvas state');
      }
      const available = getDesktopDisplays();
      const display = available.find((candidate) => candidate.id === canvas.displayId)
        ?? available.find((candidate) => candidate.id === screen.getPrimaryDisplay().id)!;
      state.baselinePixelSize = { width: canvas.baselineWidth, height: canvas.baselineHeight };
      state.pixelSize = { width: canvas.width, height: canvas.height };
      const dipSize = pixelSizeToDip(state.pixelSize, display.scaleFactor);
      const nextSize = {
        width: Math.max(dipSize.width, Math.ceil(state.pixelSize.width / display.scaleFactor)),
        height: dipSize.height,
      };
      const baselineSize = pixelSizeToDip(state.baselinePixelSize, display.scaleFactor);
      const position = resizeAnchoredPosition(canvas.position, baselineSize, nextSize);
      placement.place(position, display, nextSize);
      await placement.savePlacement();
    },
    async resizeFurnitureCanvas(width: number): Promise<Size> {
      if (window.isDestroyed()) return { ...state.pixelSize };
      if (!Number.isSafeInteger(width) || width < state.baselinePixelSize.width) {
        throw new Error('Furniture canvas width must be an integer at least the baseline width');
      }
      const display = placement.display();
      const maxWidth = Math.min(8192, Math.floor(display.workArea.width * display.scaleFactor));
      if (maxWidth < state.baselinePixelSize.width) {
        throw new Error('Desktop baseline width exceeds the display work area');
      }
      state.pixelSize = { width: Math.min(width, maxWidth), height: state.baselinePixelSize.height };
      const dipSize = pixelSizeToDip(state.pixelSize, display.scaleFactor);
      const nextSize = {
        width: Math.max(dipSize.width, Math.ceil(state.pixelSize.width / display.scaleFactor)),
        height: dipSize.height,
      };
      placement.place(resizeAnchoredPosition(
        placement.position,
        state.size,
        nextSize,
      ), display, nextSize);
      await placement.savePlacement();
      const [appliedWidth = nextSize.width, appliedHeight = nextSize.height] = window.getContentSize();
      // The renderer viewport is CSS pixels: DIP multiplied by the inverse zoom factor.
      return {
        width: Math.max(1, Math.round(appliedWidth * state.scaleFactor)),
        height: Math.max(1, Math.round(appliedHeight * state.scaleFactor)),
      };
    },
  };
}
