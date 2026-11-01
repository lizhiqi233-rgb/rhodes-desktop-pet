import type { FurnitureFit } from './library.ts';

export const FURNITURE_MODEL_REPOSITORY = 'https://github.com/lizhiqi233-rgb/Arknights-CN-Unpacker';
export const FURNITURE_MODEL_MANIFEST_URL = `${FURNITURE_MODEL_REPOSITORY}/releases/latest/download/manifest.json`;
export const FURNITURE_MODEL_SCHEMA = 1;

export type ModelVector = { x: number; y: number; z: number };
export type FurnitureModelMaterial = {
  texture: string | null;
  color: [number, number, number, number];
  uvScale: [number, number];
  uvOffset: [number, number];
  alphaTest: number;
  transparent: boolean;
};
export type FurnitureModelMesh = {
  positions: number[];
  uvs: number[];
  matrix: number[];
  materials: FurnitureModelMaterial[];
  groups: Array<{ start: number; count: number; materialIndex: number }>;
};
export type FurnitureModelScene = {
  schema: 3;
  id: string;
  version: string;
  fingerprint: string;
  meshes: FurnitureModelMesh[];
  camera: {
    position: ModelVector;
    target: ModelVector;
    left: number;
    right: number;
    top: number;
    bottom: number;
    near: number;
    far: number;
  };
  width: number;
  height: number;
  fit: FurnitureFit;
  interaction: { animation: 'Sit' | 'Sleep'; native: boolean; facing: -1 | 1 };
};

export type PreparedFurnitureModel = {
  directory: string;
  file: string;
  fit: FurnitureFit;
  dimensions: { width: number; height: number };
  version: string;
  nativeInteraction: boolean;
};
