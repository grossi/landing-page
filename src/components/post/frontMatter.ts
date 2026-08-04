export interface PostMeta {
  date?: string;
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n*/;

/**
 * Splits an optional `---` front-matter header off a markdown post.
 * Only `date: YYYY-MM-DD` is recognized; unknown keys are ignored.
 */
export function parseFrontMatter(text: string): { meta: PostMeta; body: string } {
  const match = text.match(FRONT_MATTER);
  if (!match) return { meta: {}, body: text };

  const meta: PostMeta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key === 'date' && value) meta.date = value;
  }
  return { meta, body: text.slice(match[0].length) };
}

/** `2021-06-01` → `June 1, 2021`, without the UTC day-shift of `new Date(iso)`. */
export function formatPostDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
