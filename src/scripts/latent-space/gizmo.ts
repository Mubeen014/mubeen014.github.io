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
const AXES_OPACITY = 0.35;
const GRID_OPACITY = 0.5;

export interface Gizmo {
  object: Group;
  /**
   * Fades the axes and grid.
   *
   * @param opacity - 0 (invisible) to 1 (normal).
   */
  setOpacity(opacity: number): void;
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
    opacity: AXES_OPACITY,
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
  gridMaterial.opacity = GRID_OPACITY;

  const object = new Group();
  object.add(axes, grid);
  return {
    object,
    setOpacity(opacity) {
      axesMaterial.opacity = AXES_OPACITY * opacity;
      gridMaterial.opacity = GRID_OPACITY * opacity;
      object.visible = opacity > 0.001;
    },
    dispose() {
      axesGeometry.dispose();
      axesMaterial.dispose();
      grid.geometry.dispose();
      gridMaterial.dispose();
    },
  };
}
