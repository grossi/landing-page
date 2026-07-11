import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Markdown files are imported as asset URLs and fetched at runtime.
  assetsInclude: ['**/*.md'],
  resolve: {
    // Imports are rooted at src/ (tsconfig baseUrl), e.g. `import Main from 'pages/Main'`.
    alias: [
      {
        find: /^(assets|components|hooks|pages|templates|types|utils)(\/.*)?$/,
        replacement: `${src}/$1$2`,
      },
    ],
  },
});
