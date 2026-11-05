/**
 * One typed view over all three content collections. Pages, and later the embedding and
 * search index, read entries from here rather than from the collections directly.
 */
import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { url } from './paths';

export type EntryKind = 'project' | 'experience' | 'education';

/** A project, role or degree, normalised across collections. */
export interface Entry {
  kind: EntryKind;
  id: string;
  href: string;
  title: string;
  /** Line shown under the title (experience: organisation · location · employment type). */
  subtitle: string | undefined;
  summary: string;
  startDate: Date;
  endDate: Date | undefined;
  tags: string[];
  featured: boolean;
  placeholder: boolean;
}

/** A project's real cover image with its alt text. */
export interface CoverImage {
  src: ImageMetadata;
  alt: string;
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

type AnyCollectionEntry =
  | CollectionEntry<'projects'>
  | CollectionEntry<'experience'>
  | CollectionEntry<'education'>;

/**
 * Title and subtitle for an entry. Experience entries are titled by position.
 *
 * @param entry - The raw collection entry.
 * @returns The display title and the line shown under it.
 */
function titleLines(entry: AnyCollectionEntry): {
  title: string;
  subtitle: string | undefined;
} {
  if (entry.collection === 'experience') {
    const { position, organisation, location, employmentType } = entry.data;
    return {
      title: position,
      subtitle: `${organisation} · ${location} · ${employmentType}`,
    };
  }
  return { title: entry.data.title, subtitle: undefined };
}

/**
 * Converts a collection entry into the shared `Entry` shape.
 *
 * @param kind - Which collection the entry came from.
 * @param entry - The raw collection entry.
 * @returns The normalised entry.
 */
function toEntry(kind: EntryKind, entry: AnyCollectionEntry): Entry {
  const { summary, startDate, endDate, tags, featured, placeholder } =
    entry.data;
  return {
    kind,
    id: entry.id,
    href: url(`${indexPaths[kind]}${entry.id}/`),
    ...titleLines(entry),
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

/**
 * Real cover images keyed by project id. Projects without one are absent from the map.
 *
 * @returns Map from project id to its cover image and alt text.
 * @throws Error if a project has a cover without alt text (the schema prevents this).
 */
export async function getProjectCovers(): Promise<Map<string, CoverImage>> {
  const covers = new Map<string, CoverImage>();
  for (const project of await getCollection('projects')) {
    const { cover, coverAlt } = project.data;
    if (cover === undefined) continue;
    if (coverAlt === undefined) {
      throw new Error(`Project "${project.id}" has a cover but no coverAlt`);
    }
    covers.set(project.id, { src: cover, alt: coverAlt });
  }
  return covers;
}
