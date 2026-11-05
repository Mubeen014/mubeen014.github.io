import { defineConfig } from 'astro/config';

// User site (mubeen014.github.io): served from the domain root, so no `base`.
export default defineConfig({
  site: 'https://mubeen014.github.io',
  output: 'static',
});
