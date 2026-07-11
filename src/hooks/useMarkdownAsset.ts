import { useEffect, useState } from 'react';

/**
 * Markdown files are imported as asset URLs (see assetsInclude in
 * vite.config.ts) and fetched at runtime.
 */
export function useMarkdownAsset(url: string): string {
  const [text, setText] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
        return response.text();
      })
      .then((content) => {
        if (!cancelled) setText(content);
      })
      .catch(() => {
        if (!cancelled) setText('Sorry, this post failed to load. Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return text;
}
