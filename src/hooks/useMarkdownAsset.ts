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
      .then((response) => response.text())
      .then((content) => {
        if (!cancelled) setText(content);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return text;
}
