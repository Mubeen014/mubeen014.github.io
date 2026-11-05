/**
 * Content collections: projects, experience and education. Each entry is one point in the
 * latent space, so `tags` (which drive the embedding) are required. Bad frontmatter fails
 * the build through these Zod schemas.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** Fields every entry shares, regardless of collection. */
const sharedFields = {
  title: z.string().min(1),
  summary: z.string().min(1).max(140),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(), // absent = present
  // Kebab-case so the same concept can't appear as two different embedding directions.
  tags: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)).min(1),
  featured: z.boolean().default(false),
  placeholder: z.boolean().default(false),
};

/**
 * Checks that an entry does not end before it starts.
 *
 * @param entry - Parsed frontmatter with a start date and optional end date.
 * @returns True when there is no end date or it is on/after the start date.
 */
function endsOnOrAfterStart(entry: {
  startDate: Date;
  endDate?: Date | undefined;
}): boolean {
  return entry.endDate === undefined || entry.endDate >= entry.startDate;
}
const dateOrderError = {
  message: 'endDate must be on or after startDate',
  path: ['endDate'],
};

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.mdx' }),
  schema: ({ image }) =>
    z
      .object({
        ...sharedFields,
        role: z.string().min(1),
        links: z
          .object({
            repo: z.url().optional(),
            demo: z.url().optional(),
            paper: z.url().optional(),
          })
          .default({}),
        cover: image().optional(),
      })
      .refine(endsOnOrAfterStart, dateOrderError),
});

const experience = defineCollection({
  loader: glob({ base: './src/content/experience', pattern: '**/*.mdx' }),
  schema: z
    .object({
      ...sharedFields,
      organisation: z.string().min(1),
      position: z.string().min(1),
      location: z.string().min(1),
      employmentType: z.enum([
        'full-time',
        'part-time',
        'contract',
        'internship',
        'freelance',
      ]),
    })
    .refine(endsOnOrAfterStart, dateOrderError),
});

const education = defineCollection({
  loader: glob({ base: './src/content/education', pattern: '**/*.mdx' }),
  schema: z
    .object({
      ...sharedFields,
      institution: z.string().min(1),
      degree: z.string().min(1),
      field: z.string().min(1),
      location: z.string().min(1),
    })
    .refine(endsOnOrAfterStart, dateOrderError),
});

export const collections = { projects, experience, education };
