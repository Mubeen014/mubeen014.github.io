/**
 * Ambient cloud: many faint, seeded, non-interactive points that drift slowly in the vertex
 * shader. Additive soft sprites behind the content points.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import { hashString, mulberry32 } from '../../lib/prng';
import type { ScenePalette } from './palette';

const CLOUD_RADIUS = 3.6;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aSize;
  varying float vSeed;

  void main() {
    float phase = aSeed * 6.2831853;
    vec3 drift = 0.08 * vec3(
      sin(uTime * 0.21 + phase),
      sin(uTime * 0.17 + phase * 2.0),
      cos(uTime * 0.19 + phase * 3.0)
    );
    vec4 mvPosition = modelViewMatrix * vec4((position + drift) * uProgress, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aSize * uPixelRatio * (7.5 / -mvPosition.z);
    vSeed = aSeed;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vSeed;

  void main() {
    float distanceFromCentre = length(gl_PointCoord - 0.5);
    float alpha = (1.0 - smoothstep(0.0, 0.5, distanceFromCentre)) * 0.5;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(mix(uColorA, uColorB, vSeed), alpha);
    #include <colorspace_fragment>
  }
`;

export interface AmbientCloud {
  object: Points;
  /**
   * Updates the drift clock.
   *
   * @param seconds - Elapsed time; keep constant for a static cloud.
   */
  setTime(seconds: number): void;
  /**
   * Sets the initialise animation progress.
   *
   * @param progress - 0 (at origin) to 1 (final positions), already eased.
   */
  setProgress(progress: number): void;
  dispose(): void;
}

/**
 * Creates the ambient cloud. Positions are seeded, so the cloud looks the same every visit.
 *
 * @param count - Number of points (fewer on mobile).
 * @param palette - Scene colours.
 * @param pixelRatio - Renderer pixel ratio.
 * @returns The Points object and controls for it.
 */
export function createAmbientCloud(
  count: number,
  palette: ScenePalette,
  pixelRatio: number,
): AmbientCloud {
  const random = mulberry32(hashString('ambient-cloud'));
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    // Uniform direction, radius biased towards the centre so the cloud has a dense core.
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - z * z);
    const radius = CLOUD_RADIUS * Math.pow(random(), 0.6);
    positions.set(
      [
        ring * Math.cos(angle) * radius,
        ring * Math.sin(angle) * radius,
        z * radius,
      ],
      index * 3,
    );
    seeds[index] = random();
    sizes[index] = 2 + random() * 3;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));

  const uTimeUniform = { value: 0 };
  const uProgressUniform = { value: 0 };
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: uTimeUniform,
      uProgress: uProgressUniform,
      uPixelRatio: { value: pixelRatio },
      uColorA: { value: palette.muted },
      uColorB: { value: palette.line },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const object = new Points(geometry, material);
  object.renderOrder = 1;
  return {
    object,
    setTime(seconds) {
      uTimeUniform.value = seconds;
    },
    setProgress(progress) {
      uProgressUniform.value = progress;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
