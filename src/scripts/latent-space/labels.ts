/**
 * The label card for the highlighted point: an HTML overlay (not 3D text) positioned by
 * projecting the point to the screen. It flips to the other side of the point and is clamped
 * so it always stays inside the viewport and below the fixed nav.
 */
import type { LatentSpacePoint } from '../../lib/latent-space-data';

const OFFSET = 18;
const VIEWPORT_MARGIN = 8;

export interface PointLabel {
  /** The label element (a link, so tapping it opens the entry). */
  element: HTMLAnchorElement;
  /**
   * Fills the label with a point's details and makes it visible.
   *
   * @param point - The highlighted point.
   */
  show(point: LatentSpacePoint): void;
  hide(): void;
  /**
   * Places the label next to a point.
   *
   * @param x - Point x in container pixels.
   * @param y - Point y in container pixels.
   */
  place(x: number, y: number): void;
  dispose(): void;
}

/**
 * Creates a hidden label inside the scene container.
 *
 * @param container - Positioned element the canvas fills.
 * @returns The label and controls for it.
 */
export function createPointLabel(container: HTMLElement): PointLabel {
  const element = document.createElement('a');
  element.className = 'latent-label';
  element.tabIndex = -1; // keyboard users get the hidden link list instead
  const meta = document.createElement('span');
  meta.className = 'latent-label-meta mono';
  const title = document.createElement('strong');
  title.className = 'latent-label-title';
  const coords = document.createElement('span');
  coords.className = 'latent-label-coords mono';
  element.append(meta, title, coords);
  container.append(element);

  let width = 0;
  let height = 0;

  return {
    element,
    show(point) {
      element.href = point.href;
      element.dataset['kind'] = point.kind;
      meta.textContent = `${point.kind} · ${point.year}`;
      title.textContent = point.title;
      coords.textContent = point.coords;
      element.toggleAttribute('data-visible', true);
      // Measured once per show; reading layout every frame would force reflows.
      width = element.offsetWidth;
      height = element.offsetHeight;
    },
    hide() {
      element.toggleAttribute('data-visible', false);
    },
    place(x, y) {
      const bounds = container.getBoundingClientRect();
      const navBottom =
        document.querySelector('[data-nav]')?.getBoundingClientRect().bottom ??
        0;
      const pointX = bounds.left + x;
      const pointY = bounds.top + y;
      const minTop = Math.max(navBottom, 0) + VIEWPORT_MARGIN;
      const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
      const maxTop = window.innerHeight - height - VIEWPORT_MARGIN;

      // Prefer above-right of the point; flip to the left / below when that would overflow.
      let left = pointX + OFFSET;
      if (left > maxLeft) left = pointX - OFFSET - width;
      let top = pointY - OFFSET - height;
      if (top < minTop) top = pointY + OFFSET;
      left = Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft);
      top = Math.min(Math.max(top, minTop), maxTop);

      element.style.transform = `translate(${Math.round(left - bounds.left)}px, ${Math.round(top - bounds.top)}px)`;
    },
    dispose() {
      element.remove();
    },
  };
}
