---
name: verify
description: Build, run, and drive the landing-page site to verify changes work end-to-end.
---

# Verifying landing-page changes

Vite + React SPA (personal CV site for grossi.tech). No test suite — verification is running the built site in a browser.

## Build and serve

```bash
npm run build          # tsc --noEmit && vite build → dist/
npx vite preview --port 4173   # serves dist/ with SPA fallback
```

Dev server alternative: `npm run dev` (default port 5173).

## Flows worth driving

- `/` — Experience timeline page (default route).
- `/blog` — fetches a markdown asset at runtime and renders it with
  syntax highlighting. This exercises the `.md`-as-asset-URL pipeline
  (`assetsInclude` in vite.config.ts), the most fragile part of the setup.
- Deep-link routes directly (fresh navigation, not client-side links) to
  confirm SPA fallback works.
- Check console for errors — a clean load logs nothing.

## Gotchas

- Imports are rooted at `src/` (e.g. `import Main from 'pages/Main'`),
  resolved by a regex alias in vite.config.ts. New top-level dirs under
  `src/` must be added to that regex.
- Unknown routes render an empty page — there is no catch-all route in
  App.tsx. Pre-existing behavior, not a regression.
- `.md` files import as asset URLs and are `fetch()`ed at runtime.
