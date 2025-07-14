# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal portfolio/blog website built with React 18 and TypeScript 5 using Create React App. The site is deployed to AWS S3 (grossi.life).

### Recent Updates (2025)
- React 18.3.1 with new root API
- TypeScript 5.8.0
- Chakra UI v3 with new theming system
- React Router v6 with updated routing syntax
- Framer Motion v11
- All dependencies updated to latest versions

## Essential Commands

### Development
```bash
yarn start          # Start development server (port 3000)
yarn test           # Run Jest tests
yarn build          # Create production build
yarn deploy         # Build and deploy to S3 (runs build + push-s3)
```

### Testing
```bash
yarn test                    # Run all tests in watch mode
yarn test --coverage        # Run tests with coverage report
yarn test MyComponent       # Run tests matching pattern
```

## Architecture

### Component Structure (Atomic Design)
The project follows Atomic Design principles:
- **atoms/** - Basic reusable components (Markdown, SideTitle)
- **molecules/** - Combinations of atoms (SocialLinks)
- **organisms/** - Complex UI sections (Header, Sidebar)
- **pages/** - Full page components (About, Blog, Main)
- **templates/** - Page templates (Post)

### Key Technologies
- **UI Framework**: Chakra UI v3 with Emotion
- **Routing**: React Router DOM v6
- **Markdown**: markdown-to-jsx for blog posts
- **Code Highlighting**: react-syntax-highlighter
- **Animations**: Framer Motion v11

### Content Management
Blog posts and about content are stored as markdown files in `/src/assets/`:
- Blog posts: `/src/assets/posts/`
- About page: `/src/assets/about.md`

### Theme Support
The app includes dark/light theme switching functionality. Dark theme is the default with background color #1a202c (gray.800) and white text. Theme preference is saved to localStorage.

## Important Notes

- TypeScript is configured with strict mode enabled
- ESLint extends react-app configuration
- AWS S3 deployment requires appropriate AWS credentials configured
- The site uses client-side routing, ensure S3 is configured for SPA hosting