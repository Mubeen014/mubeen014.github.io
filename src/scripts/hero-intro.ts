/**
 * The hero role line's short text-scramble on load: characters resolve left to right from
 * random glyphs. (The slide-up of the hero lines is pure CSS so it runs at first paint.)
 */
import { gsap } from 'gsap';

const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Scrambles an element's text and resolves it back to the original.
 *
 * @param element - Element whose text content to scramble (plain text only).
 * @param seconds - How long the resolve takes.
 * @throws Error if the element contains child elements (they would be lost).
 */
export function scrambleText(element: HTMLElement, seconds: number): void {
  if (element.children.length > 0) {
    throw new Error('scrambleText: element must contain plain text only');
  }
  const finalText = element.textContent ?? '';
  const state = { revealed: 0 };
  const randomGlyph = () =>
    GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? '';
  gsap.to(state, {
    revealed: finalText.length,
    duration: seconds,
    ease: 'none',
    onUpdate: () => {
      const count = Math.floor(state.revealed);
      const tail = [...finalText.slice(count)].map((char) =>
        char === ' ' ? ' ' : randomGlyph(),
      );
      element.textContent = finalText.slice(0, count) + tail.join('');
    },
    onComplete: () => {
      element.textContent = finalText;
    },
  });
}
