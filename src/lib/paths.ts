/**
 * Single source of truth for internal links and asset paths.
 * All hrefs/srcs in the site must go through `url()` so a future `base` change is one-line.
 */

/**
 * Prefixes an absolute site path with the configured base URL.
 * Page routes always get a trailing slash (matches `trailingSlash: 'always'`);
 * file paths (last segment contains a ".") are left as-is. A "#hash" suffix is preserved.
 *
 * @param path - Site-absolute path, e.g. "/projects/alpha", "/favicon.svg" or "/#contact".
 * @returns The path prefixed with `import.meta.env.BASE_URL` (no double slashes).
 * @throws Error if `path` does not start with "/".
 */
export function url(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`url(): path must start with "/", got "${path}"`);
  }
  const hashIndex = path.indexOf('#');
  const pathname = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : path.slice(hashIndex);

  const lastSegment = pathname.split('/').pop() ?? '';
  const isFile = lastSegment.includes('.');
  const normalizedPathname =
    isFile || pathname.endsWith('/') ? pathname : `${pathname}/`;

  return (
    import.meta.env.BASE_URL.replace(/\/$/, '') + normalizedPathname + hash
  );
}
