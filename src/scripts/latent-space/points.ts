/**
 * Content points: one soft round sprite per entry, coloured by kind. A single THREE.Points
 * with a custom shader: a per-point highlight state (0–1) drives size, colour and a glow ring,
 * a progress uniform drives the fly-out-from-origin initialise animation, and a morph uniform
 * moves points from the 3D cloud (0) to the 2D scatter (1) to the 1D timeline (2).
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
  uniform float uMorph;
  uniform float uScale2;
  uniform float uScale1;
  attribute vec2 aPosition2;
  attribute float aPosition1;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec3 uAccent;
  attribute vec3 aColor;
  attribute float aState;
  varying vec3 vColor;
  varying float vState;

  void main() {
    // Keep in sync with worldPosition() below.
    vec3 flat2 = vec3(aPosition2 * uScale2, 0.0);
    vec3 line1 = vec3(aPosition1 * uScale1, 0.0, 0.0);
    vec3 morphed = mix(mix(position, flat2, clamp(uMorph, 0.0, 1.0)), line1, clamp(uMorph - 1.0, 0.0, 1.0));
    // Points initialise by flying out from the origin (uProgress 0 → 1, eased on the CPU).
    vec4 mvPosition = modelViewMatrix * vec4(morphed * uProgress, 1.0);
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
   * Sets the morph between views.
   *
   * @param morph - 0 = 3D cloud, 1 = 2D scatter, 2 = 1D timeline (values between blend).
   */
  setMorph(morph: number): void;
  /**
   * Sets the world-space size of the 2D scatter and 1D line (they depend on the viewport).
   *
   * @param scale2 - Half-extent of the 2D scatter (2D targets are in [-1, 1]).
   * @param scale1 - Half-length of the 1D line.
   */
  setTargetScales(scale2: number, scale1: number): void;
  /**
   * Sets one point's highlight state.
   *
   * @param index - Point index (same order as the data).
   * @param state - 0 (resting) to 1 (fully highlighted).
   */
  setState(index: number, state: number): void;
  /**
   * The point's current world position (includes the initialise animation and the morph).
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
  const positions2 = new Float32Array(points.length * 2);
  const positions1 = new Float32Array(points.length);
  points.forEach((point, index) => {
    positions.set(point.position3, index * 3);
    positions2.set(point.position2, index * 2);
    positions1[index] = point.position1;
    const color = palette.kinds[point.kind];
    colors.set([color.r, color.g, color.b], index * 3);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('aPosition2', new BufferAttribute(positions2, 2));
  geometry.setAttribute('aPosition1', new BufferAttribute(positions1, 1));
  const stateAttribute = new BufferAttribute(states, 1);
  geometry.setAttribute('aState', stateAttribute);

  const uProgressUniform = { value: 0 };
  const uMorphUniform = { value: 0 };
  const uScale2Uniform = { value: 1 };
  const uScale1Uniform = { value: 1 };
  const flat = new Vector3();
  const line = new Vector3();
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uProgress: uProgressUniform,
      uMorph: uMorphUniform,
      uScale2: uScale2Uniform,
      uScale1: uScale1Uniform,
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
    setMorph(morph) {
      uMorphUniform.value = morph;
    },
    setTargetScales(scale2, scale1) {
      uScale2Uniform.value = scale2;
      uScale1Uniform.value = scale1;
    },
    setState(index, state) {
      if (states[index] === state) return;
      states[index] = state;
      stateAttribute.needsUpdate = true;
    },
    worldPosition(index, target) {
      const morph = uMorphUniform.value;
      flat.set(
        (positions2[index * 2] ?? 0) * uScale2Uniform.value,
        (positions2[index * 2 + 1] ?? 0) * uScale2Uniform.value,
        0,
      );
      line.set((positions1[index] ?? 0) * uScale1Uniform.value, 0, 0);
      return target
        .fromArray(positions, index * 3)
        .lerp(flat, Math.min(Math.max(morph, 0), 1))
        .lerp(line, Math.min(Math.max(morph - 1, 0), 1))
        .multiplyScalar(uProgressUniform.value);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
