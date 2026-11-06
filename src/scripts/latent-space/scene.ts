/**
 * The home-page latent space: renderer, camera, orbit controls, render loop and lifecycle.
 * Loaded lazily after first paint, so the hero text (the LCP element) never waits for it.
 */
import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LatentSpaceData } from '../../lib/latent-space-data';
import { createAmbientCloud } from './ambient-cloud';
import { createContentPoints } from './points';
import { createGizmo } from './gizmo';
import { readPalette } from './palette';
import { createNeighbourLines } from './neighbour-lines';
import { createPointLabel } from './labels';
import { createInteraction } from './interaction';
import { createMorph } from './morph';

const CAMERA_FOV = 40;
const CAMERA_DISTANCE = 8;
const CAMERA_REST_POSITION = new Vector3(0, 1.2, CAMERA_DISTANCE);
const AUTO_ROTATE_SPEED = 0.6; // full turn ≈ 100 s
const AUTO_ROTATE_RESUME_MS = 4000; // idle time before auto-rotate resumes
const INITIALISE_MS = 1200;
const MAX_FRAME_SECONDS = 0.1;
const AMBIENT_COUNT = { desktop: 2000, compact: 600 };
const PIXEL_RATIO_CAP = { desktop: 2, compact: 1.5 };
const MAX_SCATTER_SCALE = 2.2;
const MAX_LINE_SCALE = 2.8;

/** Handle for a mounted scene. */
export interface LatentSpaceHandle {
  /**
   * Sets the dimensionality-reduction morph (driven by scroll).
   *
   * @param value - 0 = 3D cloud, 1 = 2D scatter, 2 = 1D timeline.
   */
  setMorph(value: number): void;
  /**
   * Highlights the point of the card in view, or clears it.
   *
   * @param key - Entry key, or null.
   */
  setScrollHighlight(key: string | null): void;
  /** Stops rendering and releases every GPU resource, listener and observer. */
  destroy(): void;
}

/** Viewport-dependent sizes for the morph targets. */
interface MorphLayout {
  frontDistance: number;
  scale2: number;
  scale1: number;
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
 * Shifts the projection so the cloud sits beside the content: right of centre on wide
 * screens, above centre on tall ones (the text is bottom-left). Tall screens also move the
 * camera back so the cloud's width fits the narrow view.
 *
 * @param camera - The scene camera.
 * @param width - Canvas width in CSS pixels.
 * @param height - Canvas height in CSS pixels.
 * @param moveCamera - False while the morph owns the camera position.
 * @returns Sizes for the 2D scatter and 1D line that fit the visible area.
 */
function frameCamera(
  camera: PerspectiveCamera,
  width: number,
  height: number,
  moveCamera: boolean,
): MorphLayout {
  const wide = width >= height;
  camera.aspect = width / height;
  const distance =
    CAMERA_DISTANCE * Math.sqrt(Math.max(1, 0.9 / camera.aspect));
  if (moveCamera) {
    camera.position.setLength(distance);
  }
  if (wide) {
    camera.setViewOffset(width, height, -width * 0.18, 0, width, height);
  } else {
    camera.setViewOffset(width, height, 0, height * 0.14, width, height);
  }
  camera.updateProjectionMatrix();

  // The origin sits right of centre (wide) or above centre (tall); keep targets clear of the
  // edges and, on wide screens, of the left content column.
  const halfHeight = distance * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
  const halfWidth = halfHeight * camera.aspect;
  const availableX = halfWidth * (wide ? 0.55 : 0.85);
  // The 1D line extends left of the origin too, where the content column sits on wide screens.
  const availableLineX = halfWidth * (wide ? 0.4 : 0.85);
  const availableY = halfHeight * (wide ? 0.75 : 0.45);
  return {
    frontDistance: distance,
    scale2: Math.min(MAX_SCATTER_SCALE, availableX, availableY),
    scale1: Math.min(MAX_LINE_SCALE, availableLineX),
  };
}

/**
 * Mounts the latent space into a container and starts rendering while it is on screen.
 *
 * @param container - Element the canvas fills (positioned by CSS).
 * @param data - Parsed scene data.
 * @param linkList - The hidden list of links mirroring every point (keyboard path).
 * @returns A handle to destroy the scene.
 * @throws Error if WebGL is unavailable (from WebGLRenderer) or a CSS token is missing.
 */
export function mountLatentSpace(
  container: HTMLElement,
  data: LatentSpaceData,
  linkList: HTMLElement,
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
  camera.position.copy(CAMERA_REST_POSITION);

  const contentPoints = createContentPoints(data.points, palette, pixelRatio);
  const ambientCloud = createAmbientCloud(
    compact ? AMBIENT_COUNT.compact : AMBIENT_COUNT.desktop,
    palette,
    pixelRatio,
  );
  const gizmo = createGizmo(palette);
  const lines = createNeighbourLines(palette);
  scene.add(
    gizmo.object,
    ambientCloud.object,
    lines.object,
    contentPoints.object,
  );
  const label = createPointLabel(container);
  const morph = createMorph({
    camera,
    contentPoints,
    ambientCloud,
    gizmo,
    palette,
  });
  scene.add(morph.object);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = false; // wheel must keep scrolling the page
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.7;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  // OrbitControls sets touch-action: none; pan-y gives vertical swipes back to page scroll,
  // so only horizontal drags orbit on touch screens.
  canvas.style.touchAction = 'pan-y';

  const interaction = createInteraction({
    container,
    canvas,
    camera,
    controls,
    points: data.points,
    contentPoints,
    lines,
    label,
    linkList,
    reducedMotion,
  });

  // Auto-rotate pauses while dragging or while a point is highlighted, and resumes after
  // AUTO_ROTATE_RESUME_MS of neither.
  let autoRotateResumesAt = 0;
  let wasHighlighted = false;
  const onControlsStart = () => {
    autoRotateResumesAt = Infinity;
  };
  const onControlsEnd = () => {
    autoRotateResumesAt = performance.now() + AUTO_ROTATE_RESUME_MS;
  };
  controls.addEventListener('start', onControlsStart);
  controls.addEventListener('end', onControlsEnd);

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    const layout = frameCamera(camera, width, height, !morph.isActive());
    morph.setLayout(layout.frontDistance, layout.scale2, layout.scale1);
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

    const highlighted = interaction.hasHighlight();
    if (wasHighlighted && !highlighted) {
      autoRotateResumesAt = Math.max(
        autoRotateResumesAt,
        now + AUTO_ROTATE_RESUME_MS,
      );
    }
    wasHighlighted = highlighted;
    const morphing = morph.isActive();
    container.toggleAttribute('data-morphing', morphing);
    controls.autoRotate =
      !reducedMotion && !highlighted && !morphing && now >= autoRotateResumesAt;
    controls.enabled = !morphing && !interaction.isFlying();
    interaction.setPointerEnabled(!morphing);

    // The morph or the fly-in tween owns the camera while it runs.
    morph.updateCamera();
    if (!morph.isActive() && !interaction.isFlying()) {
      controls.update(deltaSeconds);
    }
    interaction.update(deltaSeconds);
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
    intersectionObserver.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', updateLoop);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    controls.removeEventListener('start', onControlsStart);
    controls.removeEventListener('end', onControlsEnd);
    interaction.dispose();
    controls.dispose();
    contentPoints.dispose();
    ambientCloud.dispose();
    gizmo.dispose();
    lines.dispose();
    label.dispose();
    morph.dispose();
    renderer.dispose();
    canvas.remove();
    delete container.dataset['ready'];
  };
  // A page kept in the back/forward cache only pauses (visibilitychange); otherwise free everything.
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) destroy();
  };
  // Restored from the back/forward cache (e.g. Back after a fly-in): return to the resting view.
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    interaction.reset();
    if (morph.isActive()) return; // scrolled into the morph: the scroll position owns the camera
    camera.position.copy(CAMERA_REST_POSITION);
    controls.target.set(0, 0, 0);
    resize(); // reapplies the aspect-dependent camera distance
    controls.update();
    autoRotateResumesAt = 0;
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  return {
    setMorph: (value) => morph.setMorph(value),
    setScrollHighlight: (key) => interaction.setScrollHighlight(key),
    destroy,
  };
}
