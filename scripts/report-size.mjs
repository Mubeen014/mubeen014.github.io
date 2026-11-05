/**
 * Reports the gzipped JavaScript each built page loads (inline module scripts, external
 * scripts and everything they import, statically or lazily), split into Three.js and app
 * code (Three.js and GSAP listed separately), and checks the budgets from PLAN.md section 8. Run after `npm run build`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const ASSETS = join(DIST, '_astro');
const BUDGET_KB = { home: 250, other: 60 };

/**
 * Lists every HTML page in the build.
 *
 * @param dir - Directory to walk.
 * @returns Paths of .html files.
 */
function listPages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listPages(path);
    return path.endsWith('.html') ? [path] : [];
  });
}

/**
 * Every JS chunk a chunk references by file name (static, dynamic or preload-map imports).
 *
 * @param chunk - Chunk file name inside _astro.
 * @returns Referenced chunk file names that exist.
 */
function referencedChunks(chunk) {
  const source = readFileSync(join(ASSETS, chunk), 'utf8');
  const names = [...source.matchAll(/([\w.-]+\.js)/g)].map((match) => match[1]);
  return [...new Set(names)].filter(
    (name) => name !== chunk && existsSync(join(ASSETS, name)),
  );
}

/**
 * All chunks reachable from a page's external module scripts.
 *
 * @param html - Page HTML.
 * @returns Chunk file names.
 */
function chunksForPage(html) {
  const queue = [
    ...html.matchAll(/<script[^>]+src="\/_astro\/([^"]+\.js)"/g),
  ].map((match) => match[1]);
  const seen = new Set();
  while (queue.length > 0) {
    const chunk = queue.pop();
    if (seen.has(chunk)) continue;
    seen.add(chunk);
    queue.push(...referencedChunks(chunk));
  }
  return [...seen];
}

/**
 * Gzipped size in KB.
 *
 * @param content - Bytes or text.
 * @returns Size in KB.
 */
const gzipKb = (content) => gzipSync(content, { level: 9 }).length / 1024;

/**
 * Inline module scripts Astro writes straight into a page.
 *
 * @param html - Page HTML.
 * @returns Their concatenated source ('' when there are none).
 */
function inlineScripts(html) {
  return [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .join('\n');
}

let failed = false;
for (const page of listPages(DIST).sort()) {
  const html = readFileSync(page, 'utf8');
  const chunks = chunksForPage(html);
  const inline = inlineScripts(html);
  const sizeOf = (chunk) => gzipKb(readFileSync(join(ASSETS, chunk)));
  const vendorKb = (prefix) =>
    chunks
      .filter((chunk) => chunk.startsWith(prefix))
      .reduce((sum, chunk) => sum + sizeOf(chunk), 0);
  const three = vendorKb('three.');
  const gsap = vendorKb('gsap.');
  const app =
    (inline === '' ? 0 : gzipKb(Buffer.from(inline))) +
    chunks
      .filter(
        (chunk) => !chunk.startsWith('three.') && !chunk.startsWith('gsap.'),
      )
      .reduce((sum, chunk) => sum + sizeOf(chunk), 0);
  const total = three + gsap + app;
  const isHome = page === join(DIST, 'index.html');
  const budget = isHome ? BUDGET_KB.home : BUDGET_KB.other;
  const over = total > budget;
  failed ||= over;
  console.log(
    `${over ? 'OVER' : 'ok  '} /${relative(DIST, page)}: ${total.toFixed(1)} KB gzip ` +
      `(three ${three.toFixed(1)}, gsap ${gsap.toFixed(1)}, app ${app.toFixed(1)}; budget ${budget}) ${chunks.length ? `[${chunks.join(', ')}]` : ''}`,
  );
}
process.exit(failed ? 1 : 0);
