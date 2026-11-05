/** Date formatting for entry date ranges. */

const monthYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Formats an entry's date range, e.g. "Mar 2023 – present".
 *
 * @param startDate - When the entry started.
 * @param endDate - When it ended; undefined means ongoing.
 * @returns A human-readable range using an en dash.
 */
export function formatDateRange(
  startDate: Date,
  endDate: Date | undefined,
): string {
  const end = endDate === undefined ? 'present' : monthYear.format(endDate);
  return `${monthYear.format(startDate)} – ${end}`;
}
