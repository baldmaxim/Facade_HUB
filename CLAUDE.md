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
- **Supabase** for backend database and storage
- **ESLint 9** with React hooks plugin
- CSS files with CSS variables for theming

## Architecture

FacadeHub is an SPA for analyzing facade costs in residential construction projects. Uses Supabase for data persistence.

### Routing Structure

```
/                           → HomePage (Hero + ProjectsTable)
/objects                    → ObjectsPage (list of objects from Supabase)
/objects/:id                → ObjectPage (object profile with tabs)
/objects/:id/checklist      → ChecklistPage
/objects/:id/info           → ObjectInfoPage
/objects/:id/calculation    → CalculationPage (editable table with image upload)
```

### Directory Structure

```
src/
├── api/            # API layer for Supabase calls (objects.js, calculations.js, checklists.js, works.js, storage.js)
├── components/     # Reusable UI components (Header, Footer, ProjectCard, modals)
├── pages/          # Route page components (ObjectsPage, ObjectPage, etc.)
├── data/           # Static data and constants (projects.js, workTypes.js, checklistItems.js)
├── lib/            # External service clients (supabase.js, checklistParser.js)
└── index.css       # Global styles and CSS variables
```

### Component Layout

- **HomePage**: Standalone layout with Hero
- **Inner pages**: Wrapped in `InnerLayout` (Header + children + Footer)

### Key Patterns

- **Co-located CSS**: Each component/page has a matching `.css` file
- **API layer**: All Supabase calls are in `src/api/` directory, components import from there
- **Supabase client**: Initialized in `src/lib/supabase.js`, uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars
- **Local state**: Uses React useState/useEffect hooks for data fetching and state management
- **Russian localization**: All UI text is in Russian, dates formatted with `toLocaleDateString('ru-RU')`
- **Layout patterns**: HomePage renders without Header (Hero has its own nav), inner pages use `InnerLayout` wrapper

### Data Sources

- **Static data**: Sample project data in `src/data/projects.js`, work types in `src/data/workTypes.js`, checklist items in `src/data/checklistItems.js`
- **Database tables**: `objects`, `calculation_items`, `checklists`, `work_types`, `object_works` (fetched via Supabase)

### Data Models

**projects.js (static)**: `id`, `name`, `developer`, `class` (business|premium), `facadeType`, `material`, `pricePerSqm`, `totalArea`, `year`, `location`

**Supabase tables**:
- `objects`: `id`, `name`, `address`, `developer`, `image_url`, `created_at`
- `calculation_items`: `id`, `object_id`, `svor_code`, `work_type`, `note`, `image_url`, `created_at`
- `checklists`: `id`, `object_id`, `item_id`, `status`, `note`, `custom_value`
- `work_types`: `id`, `name`, `unit`
- `object_works`: `id`, `object_id`, `work_type_id`, `quantity`, `unit_price`, `total_price`, `note`

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
