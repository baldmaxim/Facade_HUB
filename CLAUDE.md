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
- **Supabase** for backend database
- **ESLint 9** with React hooks plugin
- CSS files with CSS variables for theming

## Architecture

FacadeHub is a SPA for analyzing facade costs in residential construction projects. It uses Supabase as a backend for data persistence.

### Routing Structure

```
/                        → HomePage (Hero + StatsPreview)
/objects                 → ObjectsPage (list of objects from Supabase)
/objects/:id             → ObjectPage (object profile with tabs)
/objects/:id/checklist   → ChecklistPage
/objects/:id/info        → ObjectInfoPage
/objects/:id/calculation → CalculationPage (editable table for calculation notes)
```

### Component Layout

- **HomePage**: Standalone layout with Hero
- **Inner pages**: Wrapped in `InnerLayout` (Header + children + Footer)

### Key Patterns

- **Co-located CSS**: Each component has a matching `.css` file in the same directory
- **Supabase client**: Initialized in `src/lib/supabase.js`, uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars
- **Local state**: Uses React useState/useEffect hooks for data fetching and state management
- **Russian localization**: All UI text is in Russian, dates formatted with `toLocaleDateString('ru-RU')`

### Data Sources

- **Static data**: Sample project data in `src/data/projects.js`, work types in `src/data/workTypes.js`
- **Database tables**: `objects`, `calculation_items` (fetched via Supabase)

### Data Model

Objects table: `id`, `name`, `address`, `developer`, `image_url`, `created_at`

Calculation items: `id`, `object_id`, `svor_code`, `work_type`, `note`, `created_at`

## Code Constraints

- **Max file length**: ESLint enforces 600 lines max per file (`max-lines` rule)
- **Unused vars**: Must match `^[A-Z_]` pattern or be used

## CSS Variables

Defined in `src/index.css`:
- `--color-bg`, `--color-bg-secondary` for backgrounds
- `--color-business` (blue), `--color-premium` (purple) for class badges
- `--color-text`, `--color-text-secondary`, `--color-border`, `--color-accent`
