import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// User site (mubeen014.github.io): served from the domain root, so no `base`.
// `trailingSlash: 'always'` pairs with the default `build.format: 'directory'`
// (every page is `<route>/index.html`) so links never trigger a host redirect.
export default defineConfig({
  site: 'https://mubeen014.github.io',
  output: 'static',
  trailingSlash: 'always',
  integrations: [mdx()],
  vite: {
    build: {
      rolldownOptions: {
        output: {
          // Three.js in its own chunk: cached across deploys and measurable on its own.
          codeSplitting: {
            groups: [
              { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
            ],
          },
        },
      },
    },
  },
});
