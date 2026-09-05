# Project overview

This is Gabriel Rossi's personal portfolio/blog website, deployed at
`grossi.tech` on Vercel. It also includes interactive Three.js flight experiences
and a collection of standalone arcade games.

Vercel's GitHub integration deploys pushes to `main` to production and creates
preview deployments for pull requests.

## Architecture and validation

The site uses React + TypeScript + Vite.
The standalone arcade games live in `public/arcade/` and use their vendored
Three.js version; the React app uses the version in `package-lock.json`.

Imports are rooted at `src/` (for example, `components/post/Post`). Keep the
alias regex in `vite.config.ts` aligned with any new source-root imports.

Install dependencies with `npm ci`. Validate changes with `npm run build`
(including TypeScript checks) and `npm test`. Use `gh` for GitHub operations.

## Content management

Blog content lives in `src/assets/`; `npm-library.md` is rendered at `/blog`.
Markdown files are imported as asset URLs through Vite's `assetsInclude` and
fetched at runtime by `useMarkdownAsset`.

Posts start with a front-matter header (`---` / `date: YYYY-MM-DD` / `---`),
parsed by `components/post/frontMatter.ts` and displayed as a "Published on …"
byline. Give new posts their date.

## Code Review Rules

- Verify compatibility claims against the locked dependency versions and actual
  import paths. The shared ship factory in `public/arcade/shared/ship.js` is used
  by both the app and standalone games. Its relative source import currently
  works in Vite dev and production builds; flag a regression with evidence,
  rather than assuming all imports from `public/` fail.
- Check GPU resource ownership and game lifecycle changes: owned resources must
  be disposed, shared assets must survive other consumers' teardown, and input
  or animation loops must not remain active after disposal or while paused.
  Keep visual banking independent of the ship's control frame.
- Report actionable regressions with a concrete trigger, consequence, and code
  location. Validate suspected dead code across the app, standalone HTML scripts,
  and test fixtures. Prefer behavioral regression tests; flag timing-dependent
  or implementation-copying tests when they conceal a real coverage gap. Avoid
  style-only suggestions, speculative issues, and duplicate findings. Use CI
  results for mechanical build/test checks and state what was not verified.
