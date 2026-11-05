/**
 * Single source of truth for internal links and asset paths.
 * All hrefs/srcs in the site must go through `url()` so a future `base` change is one-line.
 */

/**
 * Prefixes an absolute site path with the configured base URL.
 *
 * @param path - Site-absolute path, e.g. "/projects/alpha". Must start with "/".
 * @returns The path prefixed with `import.meta.env.BASE_URL` (no double slashes).
 * @throws Error if `path` does not start with "/".
 */
export function url(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`url(): path must start with "/", got "${path}"`);
  }
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}
