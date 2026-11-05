/**
 * The home-page latent space: renderer, camera, orbit controls, render loop and lifecycle.
 * Loaded lazily after first paint, so the hero text (the LCP element) never waits for it.
 */
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LatentSpaceData } from '../../lib/latent-space-data';
import { createAmbientCloud } from './ambient-cloud';
import { createContentPoints } from './points';
import { createGizmo } from './gizmo';
import { readPalette } from './palette';

const CAMERA_FOV = 40;
const CAMERA_DISTANCE = 8;
const AUTO_ROTATE_SPEED = 0.6; // full turn ≈ 100 s
const AUTO_ROTATE_RESUME_MS = 4000;
const INITIALISE_MS = 1200;
const MAX_FRAME_SECONDS = 0.1;
const AMBIENT_COUNT = { desktop: 2000, compact: 600 };
const PIXEL_RATIO_CAP = { desktop: 2, compact: 1.5 };

/** Handle for a mounted scene. */
export interface LatentSpaceHandle {
  /** Stops rendering and releases every GPU resource, listener and observer. */
  destroy(): void;
}

/**
 * power3.out easing.
 *
 * @param t - Linear progress in [0, 1].
 * @returns Eased progress in [0, 1].
 */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Shifts the projection so the cloud sits beside the hero text: right of centre on wide
 * screens, above centre on tall ones (the text is bottom-left). Tall screens also move the
 * camera back so the cloud's width fits the narrow view.
 *
 * @param camera - The scene camera.
 * @param width - Canvas width in CSS pixels.
 * @param height - Canvas height in CSS pixels.
 */
function frameCamera(
  camera: PerspectiveCamera,
  width: number,
  height: number,
): void {
  camera.aspect = width / height;
  camera.position.setLength(
    CAMERA_DISTANCE * Math.sqrt(Math.max(1, 0.9 / camera.aspect)),
  );
  if (width >= height) {
    camera.setViewOffset(width, height, -width * 0.18, 0, width, height);
  } else {
    camera.setViewOffset(width, height, 0, height * 0.14, width, height);
  }
  camera.updateProjectionMatrix();
}

/**
 * Mounts the latent space into a container and starts rendering while it is on screen.
 *
 * @param container - Element the canvas fills (positioned by CSS).
 * @param data - Parsed scene data.
 * @returns A handle to destroy the scene.
 * @throws Error if WebGL is unavailable (from WebGLRenderer) or a CSS token is missing.
 */
export function mountLatentSpace(
  container: HTMLElement,
  data: LatentSpaceData,
): LatentSpaceHandle {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compact = matchMedia('(max-width: 48rem), (pointer: coarse)').matches;
  const pixelRatio = Math.min(
    window.devicePixelRatio,
    compact ? PIXEL_RATIO_CAP.compact : PIXEL_RATIO_CAP.desktop,
  );
  const palette = readPalette();

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  container.append(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
  camera.position.set(0, 1.2, CAMERA_DISTANCE);

  const contentPoints = createContentPoints(data.points, palette, pixelRatio);
  const ambientCloud = createAmbientCloud(
    compact ? AMBIENT_COUNT.compact : AMBIENT_COUNT.desktop,
    palette,
    pixelRatio,
  );
  const gizmo = createGizmo(palette);
  scene.add(gizmo.object, ambientCloud.object, contentPoints.object);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = false; // wheel must keep scrolling the page
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.7;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  // OrbitControls sets touch-action: none; pan-y gives vertical swipes back to page scroll.
  canvas.style.touchAction = 'pan-y';

  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  const pauseAutoRotate = () => {
    clearTimeout(resumeTimer);
    controls.autoRotate = false;
  };
  const scheduleAutoRotate = () => {
    if (reducedMotion) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, AUTO_ROTATE_RESUME_MS);
  };
  controls.addEventListener('start', pauseAutoRotate);
  controls.addEventListener('end', scheduleAutoRotate);

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    frameCamera(camera, width, height);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const startTime = performance.now();
  let lastFrameTime = startTime;
  const renderFrame = (now: number) => {
    const deltaSeconds = Math.min(
      (now - lastFrameTime) / 1000,
      MAX_FRAME_SECONDS,
    );
    lastFrameTime = now;
    const progress = reducedMotion
      ? 1
      : easeOutCubic(Math.min((now - startTime) / INITIALISE_MS, 1));
    contentPoints.setProgress(progress);
    ambientCloud.setProgress(progress);
    if (!reducedMotion) {
      ambientCloud.setTime((now - startTime) / 1000);
    }
    controls.update(deltaSeconds);
    renderer.render(scene, camera);
    container.dataset['ready'] = '';
  };

  let onScreen = false;
  const updateLoop = () => {
    const shouldRender = onScreen && document.visibilityState === 'visible';
    if (shouldRender) {
      lastFrameTime = performance.now();
    }
    renderer.setAnimationLoop(shouldRender ? renderFrame : null);
  };
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? false;
    updateLoop();
  });
  intersectionObserver.observe(container);
  document.addEventListener('visibilitychange', updateLoop);

  const destroy = () => {
    renderer.setAnimationLoop(null);
    clearTimeout(resumeTimer);
    intersectionObserver.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', updateLoop);
    window.removeEventListener('pagehide', onPageHide);
    controls.removeEventListener('start', pauseAutoRotate);
    controls.removeEventListener('end', scheduleAutoRotate);
    controls.dispose();
    contentPoints.dispose();
    ambientCloud.dispose();
    gizmo.dispose();
    renderer.dispose();
    canvas.remove();
    delete container.dataset['ready'];
  };
  // A page kept in the back/forward cache only pauses (visibilitychange); otherwise free everything.
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) destroy();
  };
  window.addEventListener('pagehide', onPageHide);

  return { destroy };
}
