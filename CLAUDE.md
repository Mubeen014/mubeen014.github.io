# CLAUDE.md

Personal website: Astro + TypeScript + Three.js + GSAP, deployed to GitHub Pages. Full spec in PLAN.md.

## Workflow
- Work one phase of PLAN.md at a time. End each phase with a commit, a short summary, and stop for my review.
- Ask before any decision that is costly to reverse (new dependency, architecture, data model). State minor assumptions instead of asking.
- If the plan is wrong or infeasible, stop and say so. Never silently change course.
- Check current official docs before using any library API (Astro, Three.js, GSAP, Lenis change between majors). Never invent APIs or parameters.
- Use the latest stable version of each dependency at install time.

## Code style
- Simple, readable code. Descriptive names.
- TSDoc on every exported function, class and module: purpose, params, return value, thrown errors.
- Comments only where the "why" isn't obvious.
- One responsibility per function. No premature abstraction. Don't overengineer.
- One correct code path: no fallbacks or alternative implementations (reduced-motion handling is the only branch).
- Fail fast with clear errors when preconditions aren't met.
- Rely on TypeScript strict types instead of runtime checks.
- DOM animations: transform and opacity, plus colour transitions (color, background-color, border-color; ~150ms ease-out). Never animate layout properties (width, height, top/left, margin, padding).
- All internal links and asset paths go through one base-URL helper (import.meta.env.BASE_URL).

## Changes
- Surgical, minimal diffs. Don't refactor or restyle code outside the task.
- Debug from evidence: targeted logging, fix root causes.

## Commands
- `npm run dev` — dev server
- `npm run build` — `astro check` then `astro build` (type errors fail the build)
- `npm run preview` — serve `dist/`
- `npm run check` — type-check only
- `npm run lint` — ESLint
- `npm run format` — Prettier (Markdown docs are excluded)
- `npm test` — Vitest unit tests (`src/**/*.test.ts`)
- `npm run check:determinism` — two clean builds must produce identical output (also runs in CI)
