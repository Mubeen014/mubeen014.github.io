/**
 * Content points: one soft round sprite per entry, coloured by kind. A single THREE.Points
 * with a custom shader, so later phases can drive hover state and the 3D→2D→1D morph with
 * attributes and uniforms.
 */
import {
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three';
import type { LatentSpacePoint } from '../../lib/latent-space-data';
import type { ScenePalette } from './palette';

/** Point size in CSS pixels at the reference camera distance. */
const CONTENT_POINT_SIZE = 22;

const vertexShader = /* glsl */ `
  uniform float uProgress;
  uniform float uPixelRatio;
  uniform float uSize;
  attribute vec3 aColor;
  varying vec3 vColor;

  void main() {
    // Points initialise by flying out from the origin (uProgress 0 → 1, eased on the CPU).
    vec4 mvPosition = modelViewMatrix * vec4(position * uProgress, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * uPixelRatio * (7.5 / -mvPosition.z);
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    float distanceFromCentre = length(gl_PointCoord - 0.5);
    float core = 1.0 - smoothstep(0.30, 0.42, distanceFromCentre);
    float halo = (1.0 - smoothstep(0.0, 0.5, distanceFromCentre)) * 0.25;
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
  points.forEach((point, index) => {
    positions.set(point.position3, index * 3);
    const color = palette.kinds[point.kind];
    colors.set([color.r, color.g, color.b], index * 3);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));

  const uProgressUniform = { value: 0 };
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uProgress: uProgressUniform,
      uPixelRatio: { value: pixelRatio },
      uSize: { value: CONTENT_POINT_SIZE },
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
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
