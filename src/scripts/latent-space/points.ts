/**
 * Content points: one soft round sprite per entry, coloured by kind. A single THREE.Points
 * with a custom shader: a per-point highlight state (0–1) drives size, colour and a glow ring,
 * and a progress uniform drives the fly-out-from-origin initialise animation.
 */
import {
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { LatentSpacePoint } from '../../lib/latent-space-data';
import type { ScenePalette } from './palette';

/** Point size in CSS pixels at the reference camera distance (REFERENCE_DEPTH). */
export const CONTENT_POINT_SIZE = 22;
/** Camera depth at which a point is drawn at CONTENT_POINT_SIZE. */
export const REFERENCE_DEPTH = 7.5;
/** How much larger a fully highlighted point is drawn. */
const HIGHLIGHT_GROWTH = 0.7;

const vertexShader = /* glsl */ `
  uniform float uProgress;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec3 uAccent;
  attribute vec3 aColor;
  attribute float aState;
  varying vec3 vColor;
  varying float vState;

  void main() {
    // Points initialise by flying out from the origin (uProgress 0 → 1, eased on the CPU).
    vec4 mvPosition = modelViewMatrix * vec4(position * uProgress, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * (1.0 + ${HIGHLIGHT_GROWTH.toFixed(2)} * aState) * uPixelRatio * (${REFERENCE_DEPTH.toFixed(1)} / -mvPosition.z);
    vColor = mix(aColor, uAccent, aState);
    vState = aState;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vState;

  void main() {
    float distanceFromCentre = length(gl_PointCoord - 0.5);
    // Highlighted: a smaller solid core inside a soft accent glow (size + ring, not just colour).
    float coreEdge = mix(0.30, 0.22, vState);
    float core = 1.0 - smoothstep(coreEdge, coreEdge + 0.08, distanceFromCentre);
    float halo = (1.0 - smoothstep(0.0, 0.5, distanceFromCentre)) * mix(0.25, 0.55, vState);
    float alpha = max(core, halo);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`;

export interface ContentPoints {
  object: Points;
  /**
   * Sets the initialise animation progress.
   *
   * @param progress - 0 (all at origin) to 1 (final positions), already eased.
   */
  setProgress(progress: number): void;
  /**
   * Sets one point's highlight state.
   *
   * @param index - Point index (same order as the data).
   * @param state - 0 (resting) to 1 (fully highlighted).
   */
  setState(index: number, state: number): void;
  /**
   * The point's current world position (includes the initialise animation).
   *
   * @param index - Point index.
   * @param target - Vector to write into.
   * @returns `target`.
   */
  worldPosition(index: number, target: Vector3): Vector3;
  dispose(): void;
}

/**
 * Creates the content points.
 *
 * @param points - Scene data points.
 * @param palette - Scene colours.
 * @param pixelRatio - Renderer pixel ratio (point sizes are in CSS pixels).
 * @returns The Points object and controls for it.
 */
export function createContentPoints(
  points: LatentSpacePoint[],
  palette: ScenePalette,
  pixelRatio: number,
): ContentPoints {
  const positions = new Float32Array(points.length * 3);
  const colors = new Float32Array(points.length * 3);
  const states = new Float32Array(points.length);
  points.forEach((point, index) => {
    positions.set(point.position3, index * 3);
    const color = palette.kinds[point.kind];
    colors.set([color.r, color.g, color.b], index * 3);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  const stateAttribute = new BufferAttribute(states, 1);
  geometry.setAttribute('aState', stateAttribute);

  const uProgressUniform = { value: 0 };
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uProgress: uProgressUniform,
      uPixelRatio: { value: pixelRatio },
      uSize: { value: CONTENT_POINT_SIZE },
      uAccent: { value: palette.accent },
    },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });

  const object = new Points(geometry, material);
  object.renderOrder = 2;
  return {
    object,
    setProgress(progress) {
      uProgressUniform.value = progress;
    },
    setState(index, state) {
      if (states[index] === state) return;
      states[index] = state;
      stateAttribute.needsUpdate = true;
    },
    worldPosition(index, target) {
      return target
        .fromArray(positions, index * 3)
        .multiplyScalar(uProgressUniform.value);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
