/**
 * Site-wide scroll reveals for headings and paragraphs.
 * - Targets: elements with `data-reveal`, and h2/h3/p children of `data-reveal-children`.
 * - Plain-text elements reveal line by line (SplitText, masked lines sliding up); elements
 *   with nested markup (links, code) reveal as one block so their semantics stay intact.
 * - Only elements below the fold at load are animated, so nothing visible at first paint
 *   (including the LCP element) ever waits for JavaScript.
 * - Reduced motion: a plain fade.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

const SELECTOR = '[data-reveal], [data-reveal-children] > :is(h2, h3, p)';
const START = 'top 90%';

/**
 * Reveal options for one element.
 *
 * @param element - The element being revealed.
 * @returns ScrollTrigger settings that play the reveal once.
 */
function triggerFor(element: Element): ScrollTrigger.Vars {
  return { trigger: element, start: START, once: true };
}

/**
 * Sets up reveals for every target below the fold.
 *
 * @param reducedMotion - Whether the user prefers reduced motion.
 */
async function startReveals(reducedMotion: boolean): Promise<void> {
  gsap.registerPlugin(ScrollTrigger, SplitText);
  const targets = [...document.querySelectorAll<HTMLElement>(SELECTOR)].filter(
    (element) => element.getBoundingClientRect().top > window.innerHeight,
  );
  await document.fonts.ready; // line breaks depend on the final fonts

  for (const element of targets) {
    if (reducedMotion) {
      gsap.from(element, {
        opacity: 0,
        duration: 0.3,
        scrollTrigger: triggerFor(element),
      });
    } else if (element.children.length > 0) {
      gsap.from(element, {
        y: 24,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        scrollTrigger: triggerFor(element),
      });
    } else {
      SplitText.create(element, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,
        onSplit: (split) =>
          gsap.from(split.lines, {
            yPercent: 100,
            duration: 0.7,
            stagger: 0.08,
            ease: 'power3.out',
            scrollTrigger: triggerFor(element),
          }),
      });
    }
  }
}

void startReveals(
  window.matchMedia('(prefers-reduced-motion: reduce)').matches,
);
