/**
 * Dimensionality reduction: one scroll-driven value moves the scene from the 3D cloud (0) to
 * the 2D scatter (1) to the 1D timeline (2), and is fully reversible.
 * - Points blend between their targets (in the shader, see points.ts).
 * - The camera eases from wherever the user left it to a straight-on front view, so the
 *   flattened scatter is seen flat; it returns exactly to where it was when morph is back at 0.
 * - Axes and grid fade out as the morph begins; the ambient cloud dims; the timeline line
 *   fades in for the 1D stage.
 */
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import type { AmbientCloud } from './ambient-cloud';
import type { ContentPoints } from './points';
import type { Gizmo } from './gizmo';
import type { ScenePalette } from './palette';

const GIZMO_FADE_END = 0.4;
const AMBIENT_OPACITY = { cloud: 1, scatter: 0.3, line: 0.05 };
const TIMELINE_OPACITY = 0.6;

export interface Morph {
  /** The timeline line (add to the scene). */
  object: LineSegments;
  /**
   * Sets the morph value and applies it to points, cloud, gizmo and line.
   *
   * @param value - 0 = 3D cloud, 1 = 2D scatter, 2 = 1D timeline.
   */
  setMorph(value: number): void;
  /** True while morph > 0 (the camera is owned by the morph; orbit and picking are off). */
  isActive(): boolean;
  /**
   * Viewport-dependent sizes, called on resize.
   *
   * @param frontDistance - Camera distance in the front view.
   * @param scale2 - Half-extent of the 2D scatter in world units.
   * @param scale1 - Half-length of the 1D line in world units.
   */
  setLayout(frontDistance: number, scale2: number, scale1: number): void;
  /** Moves the camera for the current morph value. Call once per frame while active. */
  updateCamera(): void;
  dispose(): void;
}

/**
 * Clamps to [0, 1].
 *
 * @param value - Any number.
 * @returns The clamped value.
 */
function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * power3.inOut easing.
 *
 * @param t - Linear progress in [0, 1].
 * @returns Eased progress.
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Creates the morph controller.
 *
 * @param parts - Camera and scene objects the morph drives, plus the palette.
 * @returns The controller.
 */
export function createMorph(parts: {
  camera: PerspectiveCamera;
  contentPoints: ContentPoints;
  ambientCloud: AmbientCloud;
  gizmo: Gizmo;
  palette: ScenePalette;
}): Morph {
  const { camera, contentPoints, ambientCloud, gizmo, palette } = parts;
  const linePositions = new Float32Array(6);
  const lineAttribute = new BufferAttribute(linePositions, 3);
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', lineAttribute);
  const lineMaterial = new LineBasicMaterial({
    color: palette.muted,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const object = new LineSegments(lineGeometry, lineMaterial);
  object.visible = false;

  const front = new Vector3(0, 0, 1);
  let morph = 0;
  let cameraStart: Vector3 | null = null;

  return {
    object,
    setMorph(value) {
      morph = value;
      contentPoints.setMorph(value);
      gizmo.setOpacity(1 - clamp01(value / GIZMO_FADE_END));
      ambientCloud.setOpacity(
        value <= 1
          ? AMBIENT_OPACITY.cloud +
              (AMBIENT_OPACITY.scatter - AMBIENT_OPACITY.cloud) * clamp01(value)
          : AMBIENT_OPACITY.scatter +
              (AMBIENT_OPACITY.line - AMBIENT_OPACITY.scatter) *
                clamp01(value - 1),
      );
      lineMaterial.opacity = TIMELINE_OPACITY * clamp01(value - 1);
      object.visible = value > 1;
      if (value > 0 && cameraStart === null) {
        cameraStart = camera.position.clone();
      }
    },
    isActive: () => morph > 0,
    setLayout(frontDistance, scale2, scale1) {
      front.set(0, 0, frontDistance);
      contentPoints.setTargetScales(scale2, scale1);
      linePositions.set([-scale1, 0, 0, scale1, 0, 0]);
      lineAttribute.needsUpdate = true;
    },
    updateCamera() {
      if (cameraStart === null) return;
      const t = easeInOutCubic(clamp01(morph));
      const length =
        cameraStart.length() + (front.length() - cameraStart.length()) * t;
      camera.position.lerpVectors(cameraStart, front, t).setLength(length);
      camera.lookAt(0, 0, 0);
      if (morph <= 0) {
        cameraStart = null; // back at the starting view: orbit controls take over again
      }
    },
    dispose() {
      lineGeometry.dispose();
      lineMaterial.dispose();
    },
  };
}
