/**
 * One typed view over all three content collections. Pages, and later the embedding and
 * search index, read entries from here rather than from the collections directly.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { url } from './paths';

export type EntryKind = 'project' | 'experience' | 'education';

/** A project, role or degree, normalised across collections. */
export interface Entry {
  kind: EntryKind;
  id: string;
  href: string;
  title: string;
  summary: string;
  startDate: Date;
  endDate: Date | undefined;
  tags: string[];
  featured: boolean;
  placeholder: boolean;
}

/** Link to a neighbouring entry in index order. */
export interface AdjacentLink {
  title: string;
  href: string;
}

const indexPaths: Record<EntryKind, string> = {
  project: '/projects/',
  experience: '/experience/',
  education: '/education/',
};

/**
 * Site path of the index page listing a kind of entry.
 *
 * @param kind - Entry kind.
 * @returns Path through `url()`, e.g. "/projects/".
 */
export function indexPathForKind(kind: EntryKind): string {
  return url(indexPaths[kind]);
}

/**
 * Converts a collection entry into the shared `Entry` shape.
 *
 * @param kind - Which collection the entry came from.
 * @param entry - The raw collection entry.
 * @returns The normalised entry.
 */
function toEntry(
  kind: EntryKind,
  entry:
    | CollectionEntry<'projects'>
    | CollectionEntry<'experience'>
    | CollectionEntry<'education'>,
): Entry {
  const { title, summary, startDate, endDate, tags, featured, placeholder } =
    entry.data;
  return {
    kind,
    id: entry.id,
    href: url(`${indexPaths[kind]}${entry.id}/`),
    title,
    summary,
    startDate,
    endDate,
    tags,
    featured,
    placeholder,
  };
}

/**
 * Orders entries newest first (by start date, then title for a stable tie-break).
 *
 * @param a - First entry.
 * @param b - Second entry.
 * @returns Negative when `a` should come first.
 */
function newestFirst(a: Entry, b: Entry): number {
  return (
    b.startDate.getTime() - a.startDate.getTime() ||
    a.title.localeCompare(b.title)
  );
}

/**
 * Logs every entry still marked placeholder, so it is visible in production build output.
 *
 * @param entries - All entries.
 */
function warnAboutPlaceholders(entries: Entry[]): void {
  const placeholders = entries.filter((entry) => entry.placeholder);
  if (placeholders.length > 0) {
    const list = placeholders
      .map((entry) => `${entry.kind}/${entry.id}`)
      .join(', ');
    console.warn(
      `[entries] ${placeholders.length} entries still marked placeholder: ${list}`,
    );
  }
}

/**
 * Loads all three collections into one list.
 *
 * @returns All entries, newest first.
 */
async function loadAllEntries(): Promise<Entry[]> {
  const [projects, experience, education] = await Promise.all([
    getCollection('projects'),
    getCollection('experience'),
    getCollection('education'),
  ]);
  const entries = [
    ...projects.map((entry) => toEntry('project', entry)),
    ...experience.map((entry) => toEntry('experience', entry)),
    ...education.map((entry) => toEntry('education', entry)),
  ].sort(newestFirst);
  if (import.meta.env.PROD) {
    warnAboutPlaceholders(entries);
  }
  return entries;
}

// Cached so the build loads (and warns) once rather than once per page.
let allEntries: Promise<Entry[]> | undefined;

/**
 * All entries across collections, newest first.
 *
 * @returns Cached promise of every entry.
 */
export function getAllEntries(): Promise<Entry[]> {
  allEntries ??= loadAllEntries();
  return allEntries;
}

/**
 * Entries of one kind, newest first (the order used by index pages and prev/next).
 *
 * @param kind - Entry kind to keep.
 * @returns Entries of that kind.
 */
export async function getEntriesOfKind(kind: EntryKind): Promise<Entry[]> {
  return (await getAllEntries()).filter((entry) => entry.kind === kind);
}

/**
 * The previous (newer) and next (older) entries of the same kind.
 *
 * @param kind - Entry kind.
 * @param id - Entry id.
 * @returns Adjacent links; undefined at either end of the list.
 * @throws Error if no entry of that kind has the id.
 */
export async function getAdjacentEntries(
  kind: EntryKind,
  id: string,
): Promise<{
  previous: AdjacentLink | undefined;
  next: AdjacentLink | undefined;
}> {
  const entries = await getEntriesOfKind(kind);
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new Error(`getAdjacentEntries: no ${kind} entry with id "${id}"`);
  }
  const toLink = (entry: Entry | undefined) =>
    entry && { title: entry.title, href: entry.href };
  return {
    previous: toLink(entries[index - 1]),
    next: toLink(entries[index + 1]),
  };
}
