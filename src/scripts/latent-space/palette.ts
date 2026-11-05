/** Scene colours, read from the CSS tokens so tokens.css stays the single source of truth. */
import { Color } from 'three';
import type { EntryKind } from '../../lib/embedding';

export interface ScenePalette {
  kinds: Record<EntryKind, Color>;
  accent: Color;
  muted: Color;
  line: Color;
}

/**
 * Reads one colour token from :root.
 *
 * @param token - Custom property name, e.g. "--accent".
 * @returns The colour (converted to Three's linear working space).
 * @throws Error if the token is not defined.
 */
function readColorToken(token: string): Color {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  if (value === '') {
    throw new Error(`Scene palette: CSS token ${token} is not defined`);
  }
  return new Color(value);
}

/**
 * Builds the scene palette from CSS tokens.
 *
 * @returns Colours for points, accent, ambient cloud and guide lines.
 */
export function readPalette(): ScenePalette {
  return {
    kinds: {
      project: readColorToken('--point-project-rest'),
      experience: readColorToken('--point-experience'),
      education: readColorToken('--point-education'),
    },
    accent: readColorToken('--accent'),
    muted: readColorToken('--text-muted'),
    line: readColorToken('--navy-line'),
  };
}
