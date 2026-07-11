# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal portfolio/blog website built with React 19 and TypeScript 5 using Vite. The site is deployed to Vercel (grossi.life).

### Recent Updates (2026)
- Migrated from Create React App to Vite 6
- React 19 with React Router 7 (`react-router` package, no longer `react-router-dom`)
- TypeScript 5.8
- Chakra UI v3 with new theming system
- Framer Motion v12
- Deployment moved from AWS S3 to Vercel

## Essential Commands

### Development
```bash
npm run dev         # Start Vite dev server (port 5173)
npm run build       # Type-check (tsc --noEmit) + production build
npm run preview     # Preview the production build locally
npm test            # Run Vitest (passes with no tests; none exist yet)
```

Deployment happens automatically via Vercel's GitHub integration — pushes to `main` deploy to production, PRs get preview deployments. There is no manual deploy script.

## Architecture

### Component Structure (Atomic Design)
The project follows Atomic Design principles:
- **components/atoms/** - Basic reusable components (Markdown, SideTitle)
- **components/molecules/** - Combinations of atoms (SocialLinks)
- **components/organisms/** - Complex UI sections (Header, Sidebar)
- **components/ui/** - Chakra UI helper components
- **pages/** - Full page components (About, Blog, Contact, Experience, Main, Projects)
- **templates/** - Page templates (PageLayout, Post)

Imports are rooted at `src/` (tsconfig `baseUrl`), e.g. `import Main from 'pages/Main'`. The matching Vite alias lives in `vite.config.ts` — if you add a new top-level directory under `src/`, add it to the alias regex there.

### Key Technologies
- **Build tool**: Vite 6 (`@vitejs/plugin-react`)
- **UI Framework**: Chakra UI v3 with Emotion
- **Routing**: React Router v7 (`react-router`)
- **Markdown**: markdown-to-jsx for blog posts
- **Code Highlighting**: react-syntax-highlighter
- **Animations**: Framer Motion v12

### Content Management
Blog posts and about content are stored as markdown files in `/src/assets/`:
- Blog posts: `/src/assets/posts/`
- About page: `/src/assets/about.md`

Markdown files are imported as asset URLs (`assetsInclude` in `vite.config.ts`) and fetched at runtime.

### Theme Support
The app includes dark/light theme switching functionality. Dark theme is the default with background color #1a202c (gray.800) and white text. Theme preference is saved to localStorage.

## Important Notes

- TypeScript is configured with strict mode enabled
- The site uses client-side routing; `vercel.json` rewrites all paths to `/index.html` for SPA hosting
