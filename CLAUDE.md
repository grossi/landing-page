## Project Overview

This is a personal portfolio/blog website. The site is deployed to Vercel (grossi.tech).

Deployment happens automatically via Vercel's GitHub integration — pushes to `main` deploy to production, PRs get preview deployments.

## Architecture

### Component Structure (feature-grouped)
Components are grouped by feature, not by atomic-design layer:
- **components/layout/** - Shared page shell (Header, PageLayout)
- **components/post/** - Markdown-post feature (Post, Markdown, Sidebar, SocialLinks)
- **components/timeline/** - Experience-timeline feature (Timeline, cards, icons, particle animation)
- **components/ui/** - Chakra UI helper components (color-mode)
- **pages/** - Route components (Blog, Experience), composed from the above
- **config/** - Site-wide constants (social links) and timeline theming/particle config
- **hooks/** - Shared hooks (useMarkdownAsset)
- **types/** - Shared TypeScript types

Imports are rooted at `src/` (e.g. `import Post from 'components/post/Post'`); the
alias regex in `vite.config.ts` must list every top-level `src/` directory.

### Content Management
Blog content is stored as markdown files in `/src/assets/` (currently a single
post, `npm-library.md`, rendered at `/blog`).

Markdown files are imported as asset URLs (`assetsInclude` in `vite.config.ts`) and fetched at runtime via `useMarkdownAsset`.
