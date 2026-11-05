/**
 * One typed view over all three content collections, joined with their latent-space
 * embedding. Pages (and later the search index) read entries from here rather than from
 * the collections directly.
 */
import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { url } from './paths';
import {
  computeEmbedding,
  entryKey,
  formatCoordinates,
  type EntryKind,
  type Neighbour,
  type Vector2,
  type Vector3,
} from './embedding';

export type { EntryKind };

/** A project, role or degree, normalised across collections. */
export interface Entry {
  kind: EntryKind;
  id: string;
  /** Unique across collections, e.g. "project/project-alpha". */
  key: string;
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
  /** Latent-space positions; see `embedding.ts`. */
  position3: Vector3;
  position2: Vector2;
  position1: number;
  /** Mono readout of `position3`, e.g. "z = [0.42, -1.17, 0.88]". */
  coords: string;
  /** Entries sharing tags (by key), most similar first; may be empty. */
  neighbours: Neighbour[];
}

/** An entry before its embedding is attached. */
type BaseEntry = Omit<
  Entry,
  'position3' | 'position2' | 'position1' | 'coords' | 'neighbours'
>;

/** A related entry with its Jaccard tag similarity. */
export interface NearestNeighbour {
  entry: Entry;
  similarity: number;
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
 * Converts a collection entry into the shared shape (without its embedding).
 *
 * @param kind - Which collection the entry came from.
 * @param entry - The raw collection entry.
 * @returns The normalised entry.
 */
function toEntry(kind: EntryKind, entry: AnyCollectionEntry): BaseEntry {
  const { summary, startDate, endDate, tags, featured, placeholder } =
    entry.data;
  return {
    kind,
    id: entry.id,
    key: entryKey(kind, entry.id),
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
    const list = placeholders.map((entry) => entry.key).join(', ');
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
  const baseEntries = [
    ...projects.map((entry) => toEntry('project', entry)),
    ...experience.map((entry) => toEntry('experience', entry)),
    ...education.map((entry) => toEntry('education', entry)),
  ];
  const points = computeEmbedding(baseEntries);
  const entries = baseEntries
    .map((base): Entry => {
      const point = points.get(base.key);
      if (!point) {
        throw new Error(`entries: no embedding for ${base.key}`);
      }
      return {
        ...base,
        position3: point.position3,
        position2: point.position2,
        position1: point.position1,
        coords: formatCoordinates(point.position3),
        neighbours: point.neighbours,
      };
    })
    .sort(newestFirst);
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

/**
 * One entry by kind and id.
 *
 * @param kind - Entry kind.
 * @param id - Entry id within its collection.
 * @returns The entry.
 * @throws Error if it does not exist.
 */
export async function getEntry(kind: EntryKind, id: string): Promise<Entry> {
  const key = entryKey(kind, id);
  const entry = (await getAllEntries()).find(
    (candidate) => candidate.key === key,
  );
  if (!entry) {
    throw new Error(`getEntry: no entry ${key}`);
  }
  return entry;
}

/**
 * Resolves an entry's nearest neighbours to full entries.
 *
 * @param entry - The entry whose neighbours to resolve.
 * @returns Neighbouring entries with similarities, most similar first (may be empty).
 * @throws Error if a neighbour key does not match any entry.
 */
export async function getNearestNeighbours(
  entry: Entry,
): Promise<NearestNeighbour[]> {
  const byKey = new Map(
    (await getAllEntries()).map((candidate) => [candidate.key, candidate]),
  );
  return entry.neighbours.map(({ key, similarity }) => {
    const neighbour = byKey.get(key);
    if (!neighbour) {
      throw new Error(
        `getNearestNeighbours: unknown neighbour ${key} of ${entry.key}`,
      );
    }
    return { entry: neighbour, similarity };
  });
}
