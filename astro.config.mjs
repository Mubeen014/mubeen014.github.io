import { defineConfig } from 'astro/config';

// User site (mubeen014.github.io): served from the domain root, so no `base`.
// `trailingSlash: 'always'` pairs with the default `build.format: 'directory'`
// (every page is `<route>/index.html`) so links never trigger a host redirect.
export default defineConfig({
  site: 'https://mubeen014.github.io',
  output: 'static',
  trailingSlash: 'always',
});
