/**
 * Pointer, touch and keyboard interaction for the latent space.
 * - Mouse: hover highlights (point grows, turns accent, neighbour lines draw, label shows);
 *   click flies the camera in, then navigates.
 * - Touch: first tap selects; tapping the same point or its label opens it; tapping empty
 *   space deselects. Taps pick within TOUCH_PICK_RADIUS.
 * - Keyboard: focusing a link in the hidden list highlights its point; Enter follows the link.
 * - Reduced motion: no tweening; opening navigates immediately.
 * Picking is done in screen space (projected point centres), matching what the user sees.
 */
import { gsap } from 'gsap';
import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { LatentSpacePoint } from '../../lib/latent-space-data';
import type { ContentPoints } from './points';
import type { NeighbourLines } from './neighbour-lines';
import type { PointLabel } from './labels';

const MOUSE_PICK_RADIUS = 14;
const TOUCH_PICK_RADIUS = 22;
const TAP_MAX_MOVEMENT = 8;
const HIGHLIGHT_SECONDS = 0.2;
const LINE_DRAW_SECONDS = 0.4;
const FLY_SECONDS = 0.6;
const FLY_STOP_DISTANCE = 1.4;

type HighlightSource = 'hover' | 'touch' | 'focus' | 'fly';

export interface InteractionOptions {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  points: LatentSpacePoint[];
  contentPoints: ContentPoints;
  lines: NeighbourLines;
  label: PointLabel;
  /** The hidden list of links mirroring every point. */
  linkList: HTMLElement;
  reducedMotion: boolean;
}

export interface Interaction {
  /**
   * Advances highlight tweens and repositions the label and lines. Call once per frame.
   *
   * @param deltaSeconds - Time since the last frame.
   */
  update(deltaSeconds: number): void;
  /** True while the camera is flying towards a point (orbit controls must not update). */
  isFlying(): boolean;
  /** True while any point is highlighted. */
  hasHighlight(): boolean;
  /** Back to the resting state: no selection, label or lines, fly-in cancelled. */
  reset(): void;
  dispose(): void;
}

/**
 * Moves a value towards a target by at most `step`.
 *
 * @param value - Current value.
 * @param target - Target value.
 * @param step - Maximum change.
 * @returns The new value.
 */
function moveTowards(value: number, target: number, step: number): number {
  return value < target
    ? Math.min(value + step, target)
    : Math.max(value - step, target);
}

/**
 * Wires up interaction for a mounted scene.
 *
 * @param options - Scene objects and DOM elements to interact with.
 * @returns Per-frame update and lifecycle functions.
 */
export function createInteraction(options: InteractionOptions): Interaction {
  const {
    container,
    canvas,
    camera,
    controls,
    points,
    contentPoints,
    lines,
    label,
    linkList,
    reducedMotion,
  } = options;
  const indexByKey = new Map(points.map((point, index) => [point.key, index]));
  const neighbourIndices = points.map((point) =>
    point.neighbours.flatMap((key) => {
      const index = indexByKey.get(key);
      return index === undefined ? [] : [index];
    }),
  );
  const states = points.map(() => 0);
  const projected = new Vector3();
  const from = new Vector3();
  const neighbourPositions = [new Vector3(), new Vector3(), new Vector3()];

  let highlighted: number | null = null;
  let source: HighlightSource | null = null;
  let lineDraw = 0;
  let flyTween: gsap.core.Tween | null = null;
  let pointerDown: { x: number; y: number; id: number } | null = null;

  /**
   * Projects a point to container pixels.
   *
   * @param index - Point index.
   * @returns Screen position, or null when the point is behind the camera.
   */
  const toScreen = (index: number): { x: number; y: number } | null => {
    contentPoints.worldPosition(index, projected).project(camera);
    if (projected.z > 1) return null;
    return {
      x: ((projected.x + 1) / 2) * canvas.clientWidth,
      y: ((1 - projected.y) / 2) * canvas.clientHeight,
    };
  };

  /**
   * The point nearest to a client position, within a radius.
   *
   * @param clientX - Pointer x (viewport pixels).
   * @param clientY - Pointer y (viewport pixels).
   * @param radius - Pick radius in CSS pixels.
   * @returns Point index, or null when nothing is close enough.
   */
  const pick = (
    clientX: number,
    clientY: number,
    radius: number,
  ): number | null => {
    const bounds = canvas.getBoundingClientRect();
    let best: number | null = null;
    let bestDistance = radius;
    for (let index = 0; index < points.length; index++) {
      const screen = toScreen(index);
      if (!screen) continue;
      const distance = Math.hypot(
        screen.x - (clientX - bounds.left),
        screen.y - (clientY - bounds.top),
      );
      if (distance <= bestDistance) {
        best = index;
        bestDistance = distance;
      }
    }
    return best;
  };

  const highlight = (
    index: number | null,
    newSource: HighlightSource | null,
  ) => {
    if (index !== highlighted) {
      lineDraw = reducedMotion ? 1 : 0;
    }
    highlighted = index;
    source = index === null ? null : newSource;
    const point = index === null ? undefined : points[index];
    if (point) {
      container.dataset['selected'] = point.key;
      label.show(point);
    } else {
      delete container.dataset['selected'];
      label.hide();
      lines.hide();
    }
  };

  const open = (index: number) => {
    const point = points[index];
    if (!point || flyTween) return;
    if (reducedMotion) {
      window.location.assign(point.href);
      return;
    }
    highlight(index, 'fly');
    controls.enabled = false;
    const target = contentPoints.worldPosition(index, new Vector3());
    const startCamera = camera.position.clone();
    const startTarget = controls.target.clone();
    const endCamera = startCamera
      .clone()
      .sub(target)
      .setLength(FLY_STOP_DISTANCE)
      .add(target);
    const progress = { t: 0 };
    flyTween = gsap.to(progress, {
      t: 1,
      duration: FLY_SECONDS,
      ease: 'power3.inOut',
      onUpdate: () => {
        camera.position.lerpVectors(startCamera, endCamera, progress.t);
        controls.target.lerpVectors(startTarget, target, progress.t);
        camera.lookAt(controls.target);
      },
      onComplete: () => window.location.assign(point.href),
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.buttons !== 0 || flyTween)
      return;
    const index = pick(event.clientX, event.clientY, MOUSE_PICK_RADIUS);
    canvas.style.cursor = index === null ? '' : 'pointer';
    if (index !== null) {
      if (index !== highlighted || source !== 'hover')
        highlight(index, 'hover');
    } else if (source === 'hover') {
      highlight(null, null);
    }
  };
  const onPointerLeave = () => {
    canvas.style.cursor = '';
    if (source === 'hover') highlight(null, null);
  };
  const onPointerDown = (event: PointerEvent) => {
    pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = pointerDown;
    pointerDown = null;
    if (
      !start ||
      start.id !== event.pointerId ||
      flyTween ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >
        TAP_MAX_MOVEMENT
    ) {
      return; // a drag (orbit), not a click or tap
    }
    if (event.pointerType === 'touch') {
      const index = pick(event.clientX, event.clientY, TOUCH_PICK_RADIUS);
      if (index === null) highlight(null, null);
      else if (index === highlighted && source === 'touch') open(index);
      else highlight(index, 'touch');
      return;
    }
    const index = pick(event.clientX, event.clientY, MOUSE_PICK_RADIUS);
    if (index !== null) open(index);
  };
  const onPointerCancel = () => {
    pointerDown = null;
  };
  const onLabelClick = (event: MouseEvent) => {
    event.preventDefault();
    if (highlighted !== null) open(highlighted);
  };
  const onLinkFocusIn = (event: FocusEvent) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>(
      'a[data-key]',
    )?.dataset['key'];
    const index = key === undefined ? undefined : indexByKey.get(key);
    if (index !== undefined) highlight(index, 'focus');
  };
  const onLinkFocusOut = () => {
    if (source === 'focus') highlight(null, null);
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  label.element.addEventListener('click', onLabelClick);
  linkList.addEventListener('focusin', onLinkFocusIn);
  linkList.addEventListener('focusout', onLinkFocusOut);

  return {
    update(deltaSeconds) {
      const step = reducedMotion ? 1 : deltaSeconds / HIGHLIGHT_SECONDS;
      states.forEach((state, index) => {
        const next = moveTowards(state, index === highlighted ? 1 : 0, step);
        states[index] = next;
        contentPoints.setState(index, next);
      });
      if (highlighted === null) return;

      lineDraw = reducedMotion
        ? 1
        : Math.min(1, lineDraw + deltaSeconds / LINE_DRAW_SECONDS);
      contentPoints.worldPosition(highlighted, from);
      const targets = (neighbourIndices[highlighted] ?? []).map(
        (neighbour, slot) =>
          contentPoints.worldPosition(
            neighbour,
            neighbourPositions[slot] ?? new Vector3(),
          ),
      );
      lines.show(from, targets, lineDraw);

      const screen = toScreen(highlighted);
      if (screen) label.place(screen.x, screen.y);
    },
    isFlying: () => flyTween !== null,
    hasHighlight: () => highlighted !== null,
    reset() {
      flyTween?.kill();
      flyTween = null;
      controls.enabled = true;
      pointerDown = null;
      canvas.style.cursor = '';
      highlight(null, null);
      states.forEach((_, index) => {
        states[index] = 0;
        contentPoints.setState(index, 0);
      });
    },
    dispose() {
      flyTween?.kill();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      label.element.removeEventListener('click', onLabelClick);
      linkList.removeEventListener('focusin', onLinkFocusIn);
      linkList.removeEventListener('focusout', onLinkFocusOut);
    },
  };
}
