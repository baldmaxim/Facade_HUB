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
- **React Router DOM 7** for client-side routing
- **Supabase** for backend/database
- **ESLint 9** with React hooks plugin
- CSS files with CSS variables for theming

## Architecture

FacadeHub is an SPA for analyzing facade costs in residential projects. Uses Supabase for data persistence.

### Routing Structure

```
/                           → HomePage (Hero + ProjectsTable)
/objects                    → ObjectsPage (list of objects from Supabase)
/objects/:id                → ObjectPage (object profile with tabs)
/objects/:id/checklist      → ChecklistPage
/objects/:id/info           → ObjectInfoPage
/objects/:id/calculation    → CalculationPage
```

### Directory Structure

```
src/
├── components/     # Reusable UI components (Header, Footer, ProjectCard, modals)
├── pages/          # Route page components (ObjectsPage, ObjectPage, etc.)
├── data/           # Static data (projects.js for homepage table)
├── lib/            # External service clients (supabase.js)
└── index.css       # Global styles and CSS variables
```

### Key Patterns

- **Co-located CSS**: Each component/page has a matching `.css` file
- **Supabase data**: Objects stored in Supabase `objects` table, accessed via `src/lib/supabase.js`
- **Static data**: Homepage projects table uses `src/data/projects.js`
- **Local state only**: Uses React useState hooks, no global state management
- **Russian localization**: All UI text is in Russian, prices/dates formatted with `Intl.NumberFormat('ru-RU')` and `toLocaleDateString('ru-RU')`
- **Layout patterns**: HomePage renders without Header (Hero has its own nav), inner pages use `InnerLayout` wrapper with Header/Footer
- **Supabase fetching**: Use `useState` for `data/loading/error`, fetch in `useEffect` with cleanup pattern

### Data Models

**projects.js (static)**: `id`, `name`, `developer`, `class` (business|premium), `facadeType`, `material`, `pricePerSqm`, `totalArea`, `year`, `location`

**Supabase objects table**: `id`, `name`, `address`, `developer`, `image_url`, `created_at`

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=<supabase-project-url>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
```

## Code Constraints

- **Max file length**: ESLint enforces 600 lines max per file (`max-lines` rule)
- **Unused vars**: Must match `^[A-Z_]` pattern or be used

## CSS Variables

Defined in `src/index.css`:
- `--color-bg`, `--color-bg-secondary` for backgrounds
- `--color-business` (blue), `--color-premium` (purple) for class badges
- `--color-text`, `--color-text-secondary`, `--color-border`, `--color-accent`
