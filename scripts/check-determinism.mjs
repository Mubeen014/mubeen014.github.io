/**
 * Determinism check: "same content → same positions". Runs two clean Astro builds and fails
 * if any output file differs. The footer's build date is the only allowed difference, so it
 * is masked before comparing (a build that crosses midnight must not fail).
 */
import { execSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const CACHES = ['dist', '.astro', 'node_modules/.vite', 'node_modules/.astro'];
const BUILD_DATE = /last updated \d{4}-\d{2}-\d{2}/g;

/**
 * Runs a build with every cache removed first.
 *
 * @returns Nothing; output lands in ./dist.
 */
function cleanBuild() {
  for (const path of CACHES) rmSync(path, { recursive: true, force: true });
  execSync('npx astro build', { stdio: 'ignore' });
}

/**
 * Lists every file under a directory, relative to it, sorted.
 *
 * @param root - Directory to walk.
 * @returns Relative file paths.
 */
function listFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(relative(root, path));
    }
  };
  walk(root);
  return files.sort();
}

/**
 * Reads a build output file with the build date masked.
 *
 * @param path - File path.
 * @returns File contents as a Buffer (text files have the date masked).
 */
function readMasked(path) {
  const content = readFileSync(path);
  return path.endsWith('.html')
    ? Buffer.from(
        content.toString('utf8').replace(BUILD_DATE, 'last updated <date>'),
      )
    : content;
}

const firstBuild = join(mkdtempSync(join(tmpdir(), 'determinism-')), 'dist');
cleanBuild();
renameSync('dist', firstBuild);
cleanBuild();

const firstFiles = listFiles(firstBuild);
const secondFiles = listFiles('dist');
const differences = [
  ...firstFiles
    .filter((file) => !secondFiles.includes(file))
    .map((file) => `only in first build: ${file}`),
  ...secondFiles
    .filter((file) => !firstFiles.includes(file))
    .map((file) => `only in second build: ${file}`),
  ...firstFiles
    .filter((file) => secondFiles.includes(file))
    .filter(
      (file) =>
        !readMasked(join(firstBuild, file)).equals(
          readMasked(join('dist', file)),
        ),
    )
    .map((file) => `differs: ${file}`),
];
rmSync(firstBuild, { recursive: true, force: true });

if (differences.length > 0) {
  console.error(`Determinism check failed:\n${differences.join('\n')}`);
  process.exit(1);
}
console.log(
  `Determinism check passed: ${firstFiles.length} files identical across two clean builds.`,
);
