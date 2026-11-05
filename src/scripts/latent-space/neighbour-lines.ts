/**
 * Constellation lines from the highlighted point to its neighbours (the Jaccard list), drawn
 * outwards from the point as `drawProgress` goes 0 → 1.
 */
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from 'three';
import type { ScenePalette } from './palette';

const MAX_NEIGHBOURS = 3;

export interface NeighbourLines {
  object: LineSegments;
  /**
   * Shows lines from one point towards each neighbour.
   *
   * @param from - Highlighted point's world position.
   * @param to - Neighbours' world positions (at most MAX_NEIGHBOURS are drawn).
   * @param drawProgress - 0 (no line) to 1 (full length).
   */
  show(from: Vector3, to: Vector3[], drawProgress: number): void;
  hide(): void;
  dispose(): void;
}

/**
 * Creates the (initially hidden) neighbour lines.
 *
 * @param palette - Scene colours.
 * @returns The line object and controls for it.
 */
export function createNeighbourLines(palette: ScenePalette): NeighbourLines {
  const positions = new Float32Array(MAX_NEIGHBOURS * 2 * 3);
  const positionAttribute = new BufferAttribute(positions, 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', positionAttribute);
  const material = new LineBasicMaterial({
    color: palette.accent,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const object = new LineSegments(geometry, material);
  object.renderOrder = 3;
  object.visible = false;
  const end = new Vector3();

  return {
    object,
    show(from, to, drawProgress) {
      const lines = to.slice(0, MAX_NEIGHBOURS);
      lines.forEach((target, index) => {
        end.copy(from).lerp(target, drawProgress);
        positions.set([from.x, from.y, from.z, end.x, end.y, end.z], index * 6);
      });
      geometry.setDrawRange(0, lines.length * 2);
      positionAttribute.needsUpdate = true;
      object.visible = lines.length > 0;
    },
    hide() {
      object.visible = false;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
