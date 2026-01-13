# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # Production build
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

## Tech Stack

- **React 19** with JSX (no TypeScript)
- **Vite 7** for bundling and dev server
- **ESLint 9** with React hooks plugin
- CSS files with CSS variables for theming

## Architecture

FacadeHub is a frontend-only SPA for analyzing facade costs in residential projects. No backend/API - uses static data.

### Component Hierarchy

```
App.jsx
├── Header.jsx      - Navigation with logo
├── Hero.jsx        - Landing section with statistics
├── ProjectsTable.jsx - Main feature: filterable/sortable data table
└── Footer.jsx
```

### Key Patterns

- **Co-located CSS**: Each component has a matching `.css` file
- **Static data**: Project data lives in `src/data/projects.js`
- **Local state only**: Uses React useState hooks, no global state management
- **Russian localization**: All UI text is in Russian, prices formatted with `Intl.NumberFormat('ru-RU')`

### Data Model (projects.js)

Projects have: `id`, `name`, `developer`, `class` (business|premium), `facadeType`, `material`, `pricePerSqm`, `totalArea`, `year`, `location`

## Code Constraints

- **Max file length**: ESLint enforces 600 lines max per file (`max-lines` rule)
- **Unused vars**: Must match `^[A-Z_]` pattern or be used

## CSS Variables

Defined in `src/index.css`:
- `--color-bg`, `--color-bg-secondary` for backgrounds
- `--color-business` (blue), `--color-premium` (purple) for class badges
- `--color-text`, `--color-text-secondary`, `--color-border`, `--color-accent`
