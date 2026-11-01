import { Application } from 'pixi.js';
import type { PreparedFurniturePreview, PreparedSkinPreview } from '../shared/contracts.ts';
import type { FurnitureFit } from '../shared/library.ts';
import { validateFurnitureFit } from '../shared/furniture-fit.ts';
import { RestProps } from './rest-props.ts';
import type { FurnitureAssetSwap } from './rest-props.ts';
import { loadFurnitureModel, type FurnitureRender } from './furniture-model.ts';
import { layoutPreview } from './preview/layout.ts';
import { loadPreviewModel, type PreviewModel } from './preview/model-loader.ts';
import { beginFurnitureTrial } from './preview/trial.ts';

export class SettingsPreview {
  private readonly app: Application;
  private readonly observer: ResizeObserver;
  private readonly container: HTMLElement;
  private readonly props = new RestProps();
  private model: PreviewModel | null = null;
  private furniture: PreparedFurniturePreview | null = null;
  private furnitureRender: FurnitureRender | null = null;
  private skinAbort: AbortController | null = null;
  private furnitureAbort: AbortController | null = null;
  private skinGeneration = 0;
  private furnitureGeneration = 0;
  private trialKind: 'chair' | 'bed' | null = null;
  private readonly intersectionObserver: IntersectionObserver;
  private inViewport = false;
  private readonly onVisibilityChange = (): void => this.updateTicker();
  private destroyed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.app = new Application({
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
      resolution: Math.max(1, Math.min(3, window.devicePixelRatio || 1)),
      autoDensity: true,
      backgroundAlpha: 0,
      antialias: true,
      forceCanvas: false,
      autoStart: false,
      sharedTicker: false,
    });
    this.app.ticker.maxFPS = 30;
    this.app.stage.sortableChildren = true;
    this.props.back.zIndex = 0;
    this.props.front.zIndex = 2;
    this.app.stage.addChild(this.props.back, this.props.front);
    container.replaceChildren(this.app.view as HTMLCanvasElement);
    this.app.ticker.add(() => {
      if (this.model) this.model.spine.update(Math.min(0.1, this.app.ticker.elapsedMS / 1000));
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      if (this.destroyed) return;
      this.inViewport = entries[0]?.isIntersecting ?? false;
      this.updateTicker();
    });
    this.intersectionObserver.observe(container);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
  }

  async showSkin(prepared: PreparedSkinPreview): Promise<void> {
    if (this.destroyed) throw new Error('Preview has been destroyed');
    const generation = ++this.skinGeneration;
    this.skinAbort?.abort();
    const controller = new AbortController();
    this.skinAbort = controller;
    let candidate: PreviewModel;
    try {
      candidate = await loadPreviewModel(prepared, controller.signal);
    } finally {
      if (this.skinAbort === controller) this.skinAbort = null;
    }
    if (controller.signal.aborted || generation !== this.skinGeneration || this.destroyed) {
      this.disposeModel(candidate);
      return;
    }
    const previous = this.model;
    this.model = candidate;
    candidate.spine.zIndex = 1;
    this.app.stage.addChild(candidate.spine);
    if (previous) this.disposeModel(previous);
    this.trialKind = null;
    layoutPreview(this.app, this.container, this.model, this.furniture, this.trialKind, this.props, this.destroyed);
    this.updateTicker();
  }

  async showFurniture(prepared: PreparedFurniturePreview): Promise<void> {
    if (this.destroyed) throw new Error('Preview has been destroyed');
    const generation = ++this.furnitureGeneration;
    this.furnitureAbort?.abort();
    const controller = new AbortController();
    this.furnitureAbort = controller;
    let render: FurnitureRender;
    try {
      render = await loadFurnitureModel(prepared, prepared.fit, controller.signal, true);
    } finally {
      if (this.furnitureAbort === controller) this.furnitureAbort = null;
    }
    if (controller.signal.aborted || generation !== this.furnitureGeneration || this.destroyed) {
      render.asset.texture.destroy(true);
      render.dispose?.();
      return;
    }
    const previousRender = this.furnitureRender;
    let swap: FurnitureAssetSwap;
    try {
      swap = this.props.setFurnitureAssets(
        prepared.kind === 'chair' ? render.asset : null,
        prepared.kind === 'bed' ? render.asset : null,
      );
    } catch (error) {
      render.asset.texture.destroy(true);
      render.dispose?.();
      throw error;
    }
    this.furniture = prepared;
    this.furnitureRender = render;
    this.trialKind = null;
    if (this.model?.idleAnimation) this.model.spine.state.setAnimation(0, this.model.idleAnimation, true);
    this.model?.spine.update(0);
    layoutPreview(this.app, this.container, this.model, this.furniture, this.trialKind, this.props, this.destroyed);
    swap.commit();
    previousRender?.dispose?.();
  }

  get canEditFurnitureFit(): boolean {
    return this.trialKind !== null && this.furniture?.kind === this.trialKind;
  }

  updateFurnitureFit(value: FurnitureFit): void {
    if (this.destroyed) throw new Error('Preview has been destroyed');
    const previous = this.furniture;
    if (!previous) return;
    const fit = validateFurnitureFit(value);
    const render = this.furnitureRender;
    const kind = previous.kind === 'chair' ? 'chair' : 'mat';
    const before = previous.fit.rotation;
    const after = fit.rotation;
    const rotationChanged = before.x !== after.x || before.y !== after.y || before.z !== after.z;
    if (rotationChanged) {
      if (!render?.redraw) throw new Error('Furniture rotation is unavailable for this image');
      this.props.replaceFurnitureAsset(kind, render.redraw(fit));
    } else {
      this.props.updateFurnitureFit(kind, render?.mapFit ? render.mapFit(fit) : fit);
    }
    if (!layoutPreview(this.app, this.container, this.model, this.furniture, this.trialKind, this.props, this.destroyed)) {
      if (rotationChanged) {
        this.props.replaceFurnitureAsset(kind, render!.redraw!(previous.fit));
      } else {
        this.props.updateFurnitureFit(kind, render?.mapFit ? render.mapFit(previous.fit) : previous.fit);
      }
      layoutPreview(this.app, this.container, this.model, this.furniture, this.trialKind, this.props, this.destroyed);
      throw new RangeError('Furniture fit does not fit within the preview canvas or resting pose.');
    }
    this.furniture = { ...previous, fit };
  }

  trial(kind: 'chair' | 'bed'): boolean {
    if (!beginFurnitureTrial(this.model, this.furniture, kind)) return false;
    this.trialKind = kind;
    return layoutPreview(this.app, this.container, this.model, this.furniture, this.trialKind, this.props, this.destroyed);
  }

  clearFurniture(): void {
    // Cancel pending loads without discarding the current actor.
    this.skinGeneration++;
    this.furnitureGeneration++;
    this.skinAbort?.abort();
    this.furnitureAbort?.abort();
    this.skinAbort = null;
    this.furnitureAbort = null;
    if (this.furniture) this.props.setFurnitureAssets(null, null).commit();
    this.furnitureRender?.dispose?.();
    this.furnitureRender = null;
    this.furniture = null;
    this.trialKind = null;
    if (this.model?.idleAnimation) this.model.spine.state.setAnimation(0, this.model.idleAnimation, true);
    this.model?.spine.update(0);
    layoutPreview(this.app, this.container, this.model, this.furniture, this.trialKind, this.props, this.destroyed);
  }

  clear(): void {
    if (this.model) this.disposeModel(this.model);
    this.model = null;
    this.clearFurniture();
    if (!this.destroyed) this.app.render();
    this.updateTicker();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.ticker.stop();
    this.clear();
    this.observer.disconnect();
    this.intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.app.stage.removeChild(this.props.back, this.props.front);
    this.props.destroy();
    this.app.destroy(true, { children: true });
    this.container.replaceChildren();
  }

  private resize(): void {
    if (this.destroyed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) {
      this.app.ticker.stop();
      this.app.renderer.resize(1, 1);
      return;
    }
    if (this.app.screen.width !== width || this.app.screen.height !== height) this.app.renderer.resize(width, height);
    layoutPreview(this.app, this.container, this.model, this.furniture, this.trialKind, this.props, this.destroyed);
    this.updateTicker();
  }

  private updateTicker(): void {
    if (this.destroyed) return;
    if (!this.model || !this.inViewport || document.hidden
        || this.container.clientWidth <= 0 || this.container.clientHeight <= 0) {
      this.app.ticker.stop();
    } else if (!this.app.ticker.started) {
      this.app.ticker.start();
    }
  }


  private disposeModel(model: PreviewModel): void {
    if (model.spine.parent) model.spine.parent.removeChild(model.spine);
    model.spine.destroy({ children: true });
    model.atlas.dispose();
  }
}
