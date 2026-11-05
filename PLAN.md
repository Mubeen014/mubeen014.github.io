# Latent Space — Personal Website Build Plan

## 1. Concept
The site presents my work as points in a latent embedding space. Every project, role and degree is a point; related things sit near each other.
- Navigation is exploration: the home hero is an interactive 3D point cloud. Clicking a point flies the camera in and opens that entry's page.
- Scrolling is dimensionality reduction: on the home page, scrolling collapses the same points from a 3D cloud into a 2D scatter (projects), then into a 1D line (career timeline). This is the signature moment.
- ML language as light flavour only: mono annotations like `z = [0.42, -1.17, 0.88]`, "nearest neighbours" for related entries, "out of distribution" for the 404. Body text stays plain English.
- Tone: precise, calm, engineered. One dramatic centrepiece; everything else quiet and fast. If an effect doesn't reinforce the latent-space idea, leave it out.

## 2. Visual identity
Dark theme only (v1). Navy background, orange as the single accent. Orange means "interactive or selected" — never decoration.

CSS tokens (one tokens file; I may adjust hex values):
- --bg #070F24 (page background)
- --bg-raised #0D1A3A (cards, panels, scrolled nav)
- --navy-line #1E3166 (borders, grid, axes)
- --text #E8ECF5
- --text-muted #8C97B3 (secondary text, mono annotations)
- --accent #F28C28 (hovered point, links, CTAs, active state)
- --accent-soft rgba(242,140,40,0.15) (halos, focus rings, selection)
- --point-project #F28C28, --point-experience #5B8DEF, --point-education #C9D3EA

Typography: Geist (headings/body) and Geist Mono (coordinates, tags, dates, command palette), self-hosted (verify package names). Fluid type via clamp(): hero name ~56–112px, body 17–18px, mono 12–13px with 0.02em letter-spacing.

Motifs: point clouds with thin constellation lines to nearest neighbours; faint 3D axis gizmo and grid in the hero; mono coordinate readouts; very subtle noise over the background. 8px card radius, 1px --navy-line borders, no drop shadows; soft orange glow only on the active element.

## 3. Site map
Multi-page. Home is one long scroll; each entry has its own page.
- / — hero latent space, scroll narrative, about, contact
- /projects — 2D map of all projects + filterable card list
- /projects/[slug] — project case study
- /experience — vertical timeline of roles
- /experience/[slug] — role detail
- /education — degrees
- /education/[slug] — degree detail
- /404 — "Out of distribution. This page isn't in the training set."

Global:
- Nav: name/monogram left; Projects, Experience, Education, Contact right; a ⌘K hint button. Transparent over hero, gains --bg-raised + blur after scroll.
- Command palette (⌘K / Ctrl+K, plus tap target on mobile): fuzzy search over all entries and pages, framed as "query the space". Proper dialog: focus trap, Esc closes, focus returns.
- Footer: GitHub, LinkedIn, email; mono line "built with Astro · deployed on GitHub Pages"; last-updated date.

Home sections in scroll order:
1. Hero (100vh): full-bleed 3D space. Bottom-left overlay: name, one-line role, CTAs (View projects, Contact). Mono hint "drag to orbit · click a point to open".
2. About: 2–3 short paragraphs + facts strip. Cloud stays pinned behind, dimmed.
3. Projects (3D → 2D): cloud flattens into a 2D scatter; featured project cards appear beside their points.
4. Experience + education (2D → 1D): points slide onto a horizontal line that becomes the timeline, with cards along it.
5. Contact: short CTA, email, socials. Line fades out.

Index pages:
- /projects: static 2D scatter (same embedding, projected to 2D) above the card list. Tag chips filter both; hovering a card highlights its point and vice versa.
- /experience, /education: vertical timeline, newest first. No WebGL on these pages.

Detail pages: header (title, summary, date range, role, tags, links); mono coordinate readout; MDX body (problem, approach, results, learnings); "Nearest neighbours" block with the 3 closest entries; prev/next within the collection.

## 4. Latent space engine
One Three.js scene, home page only. Positions computed at build time; the browser only renders.

Build time — src/lib/embedding.ts (pure TS, runs in the home page frontmatter, no ML library):
1. Each distinct tag gets a fixed 3D direction from a seeded PRNG (seed = hash of the tag string).
2. Entry position = normalised sum of its tags' directions, scaled to a radius, plus small seeded jitter from its slug. Shared tags → nearby points.
3. Small per-kind offset (project / experience / education) so kinds form loose clusters.
4. Precompute each entry's 3 nearest neighbours (Euclidean). Detail pages reuse these.
5. Morph targets: 2D position = 3D position with z flattened to 0, rescaled to the scatter area; 1D position = x from startDate on the timeline, y = 0.
Use a tiny seeded PRNG in src/lib/prng.ts (e.g. mulberry32). Positions must be identical on every build.

Scene:
- Content points: one per entry, coloured by kind, larger, raycastable.
- Ambient cloud: ~2000 points desktop / ~600 mobile, seeded, low opacity, slow noise drift in the vertex shader. THREE.Points + custom ShaderMaterial, soft round sprites, additive blending. Not interactive.
- Constellation lines from the hovered point to its 3 neighbours, hidden otherwise.
- Faint axis gizmo + grid, fading out as the morph begins.
- Labels are HTML overlays positioned by projecting 3D → screen (not 3D text).

Interaction:
- Drag to orbit with damping. Wheel zoom DISABLED (fights page scroll). Slow auto-rotate, pauses on interaction, resumes after ~4s idle.
- Hover (pointer): point grows and turns --accent, neighbour lines draw, label card shows title, kind, year, mono coordinates.
- Click: camera tweens toward the point (~600ms), then navigates.
- Touch: first tap selects + shows label; tapping label or same point again opens it; tapping empty space deselects. Only horizontal drags orbit, so vertical page scroll still works from the canvas.
- Canvas is aria-hidden; a visually hidden list of links in the hero mirrors every point for keyboard/screen-reader users.

Lifecycle/perf: load Three.js only on home, after first paint (hero text renders before canvas). Render only while on screen (IntersectionObserver) and tab visible. DPR cap 2 desktop / 1.5 mobile. Dispose everything on page leave.

## 5. Animation catalogue (nothing beyond this list)
Each item lists its prefers-reduced-motion behaviour.
- Points initialise: fly out from origin like weights initialising, ~1.2s, on load. Reduced: appear in place.
- Hero name/role: split-by-line slide-up with stagger; role line short text-scramble (GSAP SplitText). Reduced: 200ms fade.
- Auto-rotate + ambient drift. Reduced: off, static scene.
- Hover highlight, neighbour lines, label card. Reduced: same, no tweening.
- Click camera fly-in then navigate (GSAP). Reduced: navigate immediately.
- Dimensionality reduction 3D → 2D → 1D, scroll-scrubbed (ScrollTrigger driving shader uniforms), reversible. Reduced: off; static 2D scatter and plain timeline.
- Headings/paragraph line reveals on scroll, all pages. Reduced: plain fade.
- Smooth scroll: Lenis synced to GSAP ticker. Reduced: native scroll.
- Page transitions: card title morphs into detail header (View Transitions). Reduced: instant.
- Card hover/focus: 1px orange border, slight lift, mono coords fade in (CSS). Reduced: border only.
- Magnetic CTAs (hero + contact), pointer devices only. Reduced: off.
- Timeline line draws on scroll on /experience and /education. Reduced: fully drawn.
Rules: transform/opacity only in the DOM; 200–800ms; power3.out or equivalent, nothing bounces; no custom cursor.

## 6. Tech stack
- Astro, static output; TypeScript strict.
- Content collections with Zod schemas, MDX bodies (build fails on bad frontmatter).
- Plain CSS: one tokens file + Astro scoped styles. No CSS framework.
- Three.js (+ OrbitControls from addons).
- GSAP with ScrollTrigger and SplitText (confirm current licence terms).
- Lenis for smooth scroll.
- View Transitions: check Astro docs whether native cross-document transitions or Astro's client router fits better with the canvas lifecycle; ask me if unclear.
- Command palette: small fuzzy matcher over a build-time JSON index (Fuse.js only if hand-rolling is clearly worse).
- ESLint + Prettier with Astro plugins.
- No UI framework (React/Svelte). Stop and ask before adding one.

Suggested layout (follow current Astro docs where they differ, e.g. content config location):
src/content/{projects,experience,education}/*.mdx
src/content.config.ts
src/lib/{embedding.ts, prng.ts, search-index.ts}
src/scripts/latent-space/{scene.ts, points.ts, interaction.ts, morph.ts, labels.ts}
src/scripts/{command-palette.ts, reveal.ts, smooth-scroll.ts}
src/components/*.astro
src/layouts/{BaseLayout.astro, DetailLayout.astro}
src/pages/{index.astro, 404.astro, projects/index.astro, projects/[slug].astro, experience/index.astro, experience/[slug].astro, education/index.astro, education/[slug].astro}
src/styles/{tokens.css, global.css}
public/{fonts, images, favicon.svg}
.github/workflows/deploy.yml

## 7. Content model
Shared fields: title (string), summary (string, ~140 chars max), startDate (date), endDate (optional date; absent = present), tags (string[], min 1, drives the embedding), featured (bool, default false), placeholder (bool, default false).
- projects: role, links {repo?, demo?, paper?}, cover (optional image)
- experience: organisation, position, location, employmentType
- education: institution, degree, field, location

Placeholders for v1 (all with placeholder: true, realistic length, obviously fake):
- 5 projects with OVERLAPPING tags so clusters and neighbours are visible: Project Alpha (temporal point process modelling), Project Beta (LLM pipeline), Project Gamma (CFD surrogate model), Project Delta (mobile puzzle game), Project Epsilon (data deidentification).
- 2 experience: Company A, Company B.
- 2 education: University A (BSc Mechanical Engineering), University B.
- About/contact copy with [TODO] markers.
Dev builds show a "placeholder" badge on those entries; production hides it. The build prints a warning listing entries still marked placeholder.

## 8. Performance, accessibility, mobile
- The 3D hero enhances a complete HTML site; every entry is reachable via normal links.
- Lighthouse mobile, index/detail pages: Perf ≥ 95, A11y 100, Best Practices ≥ 95, SEO 100. Home: Perf ≥ 85; LCP is the hero name text.
- Home JS gzipped < 250 KB, loaded after first paint; other pages < 60 KB. 60fps on a mid-range laptop.
- Semantic landmarks, one h1 per page, visible orange focus rings, WCAG AA contrast (check --text-muted).
- Mobile: fewer points, DPR 1.5, works from 360px wide with 16px gutters, no horizontal scroll. Morph runs on mobile if it holds 60fps on a mid-range phone; otherwise stop and discuss.
- SEO: per-page title, description, canonical; Open Graph/Twitter tags with one static OG image; sitemap.xml; robots.txt.

## 9. Deployment (GitHub Pages, no custom domain)
- Push to main → GitHub Actions builds and deploys using Astro's official Pages action (see Astro's current deploy guide). Repo Settings → Pages → Source: GitHub Actions.
- Repo named <username>.github.io → site at root, set `site`, no `base`. Any other name → set `base: '/<repo>'`. Ask me which applies.
- Every internal link/asset uses the base-URL helper; no hard-coded "/projects/..." paths.

## 10. Phases (commit + stop for review after each)
Phase 0 — Plan only: read PLAN.md/CLAUDE.md, ask clarifying questions, propose file structure + dependencies. Done when I approve.
Phase 1 — Scaffold + deploy: Astro (TS strict, static), ESLint/Prettier, site/base config + link helper, deploy workflow, "coming soon" home + one test page. Done when push to main deploys and links work live.
Phase 2 — Design system: tokens.css, global.css, self-hosted fonts, type scale, BaseLayout, DetailLayout, card, tag chip, button, temporary /styleguide page. Done when styleguide renders correctly at 360px and 1440px.
Phase 3 — Content + pages: schemas, placeholder MDX, all index/detail pages, prev/next, static 404, home sections with a static gradient where the canvas will go. Done when every route renders, links work live, and bad frontmatter fails the build.
Phase 4 — Latent space engine: prng.ts + embedding.ts with unit tests (determinism, neighbour correctness); hero scene, ambient shader, gizmo, orbit/auto-rotate; hover labels, neighbour lines, click fly-in, touch, hidden link list; Nearest neighbours block on detail pages. Done when 60fps on desktop, every point opens the right page, positions identical across two clean builds.
Phase 5 — Scroll narrative: Lenis + GSAP sync; scroll-scrubbed 3D→2D→1D morph with cards at the right moments; site-wide line reveals. Done when scroll down and back up is smooth and reversible and points land exactly on targets.
Phase 6 — Transitions + extras: view transitions, command palette + search index, magnetic CTAs, card hovers, timeline draw, animated 404. Done when palette is keyboard/screen-reader usable and navigation works in browsers without view-transition support.
Phase 7 — Polish: reduced-motion pass over the whole catalogue, real-phone mobile tuning, Lighthouse/budget checks, SEO, remove /styleguide, placeholder warning, README on how to add an entry. Done when all section 8 targets are met.

## 11. Inputs I'll provide when asked
Repo name decision (affects base), name + one-line role, GitHub/LinkedIn/email, exact navy/orange hex if different, real entries to replace placeholders.
