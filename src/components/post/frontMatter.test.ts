import { describe, expect, it } from 'vitest';
import { formatPostDate, parseFrontMatter } from './frontMatter';

describe('parseFrontMatter', () => {
  it('extracts the date and strips the header', () => {
    const { meta, body } = parseFrontMatter('---\ndate: 2021-06-01\n---\n\n# Title\n');
    expect(meta.date).toBe('2021-06-01');
    expect(body).toBe('# Title\n');
  });

  it('passes through posts without front matter', () => {
    const { meta, body } = parseFrontMatter('# Title\n\nBody.');
    expect(meta.date).toBeUndefined();
    expect(body).toBe('# Title\n\nBody.');
  });

  it('ignores unknown keys', () => {
    const { meta } = parseFrontMatter('---\nauthor: me\ndate: 2021-06-01\n---\n# T');
    expect(meta).toEqual({ date: '2021-06-01' });
  });

  it('does not treat a mid-document rule as front matter', () => {
    const text = '# Title\n\n---\ndate: 2021-06-01\n---\n';
    expect(parseFrontMatter(text).body).toBe(text);
  });
});

describe('formatPostDate', () => {
  it('renders the long form without a UTC day shift', () => {
    expect(formatPostDate('2021-06-01')).toBe('June 1, 2021');
  });

  it('returns unparseable input unchanged', () => {
    expect(formatPostDate('yesterday')).toBe('yesterday');
  });
});
