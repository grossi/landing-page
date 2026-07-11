## Project Overview

This is a personal portfolio/blog website. The site is deployed to Vercel (grossi.tech).

Deployment happens automatically via Vercel's GitHub integration — pushes to `main` deploy to production, PRs get preview deployments.

## Architecture

### Component Structure (Atomic Design)
The project follows Atomic Design principles:
- **components/atoms/** - Basic reusable components (Markdown, SideTitle)
- **components/molecules/** - Combinations of atoms (SocialLinks)
- **components/organisms/** - Complex UI sections (Header, Sidebar)
- **components/ui/** - Chakra UI helper components
- **pages/** - Full page components (About, Blog, Contact, Experience, Main, Projects)
- **templates/** - Page templates (PageLayout, Post)

### Content Management
Blog posts and about content are stored as markdown files in `/src/assets/`:
- Blog posts: `/src/assets/posts/`
- About page: `/src/assets/about.md`

Markdown files are imported as asset URLs (`assetsInclude` in `vite.config.ts`) and fetched at runtime.
