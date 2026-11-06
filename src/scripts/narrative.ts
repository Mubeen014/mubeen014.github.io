/**
 * The home page scroll narrative (dimensionality reduction):
 * - Scrolling into Projects morphs the cloud into the 2D scatter (morph 0 → 1); scrolling into
 *   Experience & education morphs it onto the 1D timeline (1 → 2). Both are scrubbed by the
 *   scroll position, so scrolling back up reverses them exactly, with plateaus in between.
 * - The card in the middle of the viewport highlights its point (label + neighbour lines).
 * - A scrim fades in behind the sections so text stays readable over the canvas.
 * Only started when motion is allowed and the scene mounted.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { LatentSpaceHandle } from './latent-space/scene';

/**
 * Wires scroll positions to the scene.
 *
 * @param scene - The mounted latent space.
 * @throws Error if the Projects or Experience & education sections, or the scrim, are missing.
 */
export function startNarrative(scene: LatentSpaceHandle): void {
  const projects = document.querySelector<HTMLElement>('#projects');
  const career = document.querySelector<HTMLElement>('#career');
  const scrim = document.querySelector<HTMLElement>('[data-narrative-scrim]');
  const about = document.querySelector<HTMLElement>('#about');
  if (!projects || !career || !scrim || !about) {
    throw new Error(
      'Narrative: #about, #projects, #career or the scrim is missing',
    );
  }
  gsap.registerPlugin(ScrollTrigger);

  const progress = { toScatter: 0, toLine: 0 };
  const applyMorph = () => scene.setMorph(progress.toScatter + progress.toLine);
  /** Morph stage that completes as `section` scrolls from the bottom of the viewport to 25%. */
  const morphStage = (section: HTMLElement, stage: keyof typeof progress) => {
    const update = (self: ScrollTrigger) => {
      progress[stage] = self.progress;
      applyMorph();
    };
    ScrollTrigger.create({
      trigger: section,
      start: 'top bottom',
      end: 'top 25%',
      onUpdate: update,
      onRefresh: update,
    });
  };
  morphStage(projects, 'toScatter');
  morphStage(career, 'toLine');

  let activeKey: string | null = null;
  for (const item of document.querySelectorAll<HTMLElement>(
    '#projects [data-entry-key], #career [data-entry-key]',
  )) {
    const key = item.dataset['entryKey'] ?? '';
    ScrollTrigger.create({
      trigger: item,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => {
        if (self.isActive) {
          activeKey = key;
          scene.setScrollHighlight(key);
        } else if (activeKey === key) {
          activeKey = null;
          scene.setScrollHighlight(null);
        }
      },
    });
  }

  gsap.fromTo(
    scrim,
    { opacity: 0 },
    {
      opacity: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: about,
        start: 'top bottom',
        end: 'top 40%',
        scrub: true,
      },
    },
  );
}
