/** Faint axis gizmo and floor grid that frame the cloud as a coordinate space. */
import {
  BufferAttribute,
  BufferGeometry,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import type { ScenePalette } from './palette';

const AXIS_LENGTH = 2.6;
const GRID_SIZE = 9;
const GRID_DIVISIONS = 18;
const GRID_Y = -2.4;

export interface Gizmo {
  object: Group;
  dispose(): void;
}

/**
 * Creates the axes (x, y, z from the origin) and a grid below the cloud.
 *
 * @param palette - Scene colours.
 * @returns The group and a dispose function.
 */
export function createGizmo(palette: ScenePalette): Gizmo {
  const axesGeometry = new BufferGeometry();
  axesGeometry.setAttribute(
    'position',
    new BufferAttribute(
      new Float32Array([
        0,
        0,
        0,
        AXIS_LENGTH,
        0,
        0,
        0,
        0,
        0,
        0,
        AXIS_LENGTH,
        0,
        0,
        0,
        0,
        0,
        0,
        AXIS_LENGTH,
      ]),
      3,
    ),
  );
  const axesMaterial = new LineBasicMaterial({
    color: palette.muted,
    transparent: true,
    opacity: 0.35,
  });
  const axes = new LineSegments(axesGeometry, axesMaterial);

  const grid = new GridHelper(
    GRID_SIZE,
    GRID_DIVISIONS,
    palette.line,
    palette.line,
  );
  grid.position.y = GRID_Y;
  const gridMaterial = grid.material as LineBasicMaterial;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.5;

  const object = new Group();
  object.add(axes, grid);
  return {
    object,
    dispose() {
      axesGeometry.dispose();
      axesMaterial.dispose();
      grid.geometry.dispose();
      gridMaterial.dispose();
    },
  };
}
