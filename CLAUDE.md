## Project Overview

This is a personal portfolio/blog website. The site is deployed to Vercel (grossi.tech).

Deployment happens automatically via Vercel's GitHub integration — pushes to `main` deploy to production, PRs get preview deployments.

Imports are rooted at `src/` (e.g. `import Post from 'components/post/Post'`); the
alias regex in `vite.config.ts` must list every top-level `src/` directory.

### Content Management
Blog content is stored as markdown files in `/src/assets/` (currently a single
post, `npm-library.md`, rendered at `/blog`).

Markdown files are imported as asset URLs (`assetsInclude` in `vite.config.ts`) and fetched at runtime via `useMarkdownAsset`.
