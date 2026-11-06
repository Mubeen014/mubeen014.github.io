/**
 * Lenis smooth scrolling for the home page, driven by GSAP's ticker so ScrollTrigger (and the
 * scroll-scrubbed morph) read exactly the scroll position Lenis renders.
 * Not started under prefers-reduced-motion: the page keeps native scrolling.
 */
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Starts smooth scrolling. In-page anchor links (e.g. /#contact) scroll smoothly and land
 * below the fixed nav.
 *
 * @returns The Lenis instance.
 * @throws Error if the site nav is missing (its height sets the anchor offset).
 */
export function startSmoothScroll(): Lenis {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) {
    throw new Error('Smooth scroll: [data-nav] not found');
  }
  gsap.registerPlugin(ScrollTrigger);
  const lenis = new Lenis({ anchors: { offset: -nav.offsetHeight } });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000)); // ticker time is seconds; Lenis wants ms
  gsap.ticker.lagSmoothing(0);
  return lenis;
}
