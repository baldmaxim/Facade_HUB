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
- **xlsx** for Excel file parsing and import
- **Chart.js + react-chartjs-2** for data visualization
- **ESLint 9** with React hooks plugin
- CSS files with CSS variables for theming

## Architecture

FacadeHub is an SPA for analyzing facade costs in residential construction projects. Uses Supabase for data persistence.

### Routing Structure

```
/                           → HomePage (landing with ObjectsPreview, TasksPreview, StatsPreview, LandingCharts)
/objects                    → ObjectsPage (list of objects from Supabase)
/objects/:id                → ObjectPage (object profile with tabs)
/objects/:id/checklist      → ChecklistPage
/objects/:id/info           → ObjectInfoPage
/objects/:id/calculation    → CalculationPage (editable table with image upload)
/objects/:id/work-prices    → WorkPricesPage (tender work prices)
/objects/:id/work-prices-fact → WorkPricesFactPage (actual work prices)
/objects/:id/tasks          → TasksPage (task management with team assignment)
/about                      → AboutPage
/questions                  → QuestionsPage
/prompts                    → PromptsPage
/contractors                → ContractorsPage
/work-analysis              → WorkTypeAnalyticsPage (tender price analysis by work types)
/materials-analysis         → MaterialsAnalysisPage
/analytics/total            → CostAnalyticsPage
/analytics/plan-fact        → PlanFactAnalysisPage (plan vs fact analysis)
/login                      → LoginPage (no InnerLayout wrapper)
/admin                      → AdminPage
```

### Directory Structure

```
src/
├── api/            # API layer for Supabase calls (objects.js, calculations.js, checklists.js, works.js, workPrices.js, workPricesFact.js, storage.js)
├── components/     # Reusable UI components (Header, Footer, ProjectCard, modals)
├── pages/          # Route page components (ObjectsPage, ObjectPage, etc.)
├── data/           # Static data and constants (projects.js, workTypes.js, checklistItems.js)
├── lib/            # External service clients (supabase.js, checklistParser.js, excelParser.js)
└── index.css       # Global styles and CSS variables
```

### Component Layout

- **HomePage**: Uses Header + landing sections (ObjectsPreview, StatsPreview, LandingCharts) + Footer
- **Inner pages**: Wrapped in `InnerLayout` (Header + children + Footer)

### Key Patterns

- **Co-located CSS**: Each component/page has a matching `.css` file
- **API layer**: All Supabase calls are in `src/api/` directory, components import from there
- **Supabase client**: Initialized in `src/lib/supabase.js`, uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars
- **Local state**: Uses React useState/useEffect hooks for data fetching and state management
- **Russian localization**: All UI text is in Russian, dates formatted with `toLocaleDateString('ru-RU')`
- **Debounced saves**: Form inputs use debounced updates (500ms) to reduce API calls during typing
- **Auto-resize textareas**: Use `handleAutoResize` pattern with `overflow: hidden` and `resize: none` CSS

### Data Sources

- **Static data**: Sample project data in `src/data/projects.js`, work types in `src/data/workTypes.js`, checklist items in `src/data/checklistItems.js`
- **Database tables**: `objects`, `calculation_items`, `checklists`, `work_types`, `object_works`, `work_price_tender`, `work_price_fact`, `unit`, `team_members`, `tasks`, `task_statuses` (fetched via Supabase)

### Data Models

**projects.js (static)**: `id`, `name`, `developer`, `class` (business|premium), `facadeType`, `material`, `pricePerSqm`, `totalArea`, `year`, `location`

**Supabase tables**:
- `objects`: `id`, `name`, `address`, `developer`, `image_url`, `created_at`
- `calculation_items`: `id`, `object_id`, `svor_code`, `work_type`, `note`, `image_url`, `created_at`
- `checklists`: `id`, `object_id`, `item_id`, `status`, `note`, `custom_value`
- `work_types`: `id`, `name`, `unit_id` (references `unit`)
- `object_works`: `id`, `object_id`, `work_type_id`, `volume`, `work_per_unit`, `materials_per_unit`, `note`
- `work_price_tender`: `id`, `object_id`, `work_type_id`, `price`, `order_number`, `created_at`, `updated_at`
- `work_price_fact`: `id`, `object_id`, `work_type_id`, `price`, `order_number`, `created_at`, `updated_at`
- `unit`: `id`, `name`
- `team_members`: `id`, `name`, `role`, `color`, `sort_order`, `created_at`
- `tasks`: `id`, `object_id`, `name`, `team_member_id`, `order_number`, `is_high_priority`, `created_at`, `deadline`, `note`, `status_id`, `is_completed`
- `task_statuses`: `id`, `status`, `created_at`

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=<supabase-project-url>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
```

## Code Constraints

- **Max file length**: ESLint enforces 600 lines max per file (`max-lines` rule)
- **Unused vars**: Must match `^[A-Z_]` pattern or be used

## Supabase SQL Guidelines

При создании таблиц в Supabase **обязательно** добавлять комментарии к таблице и каждому столбцу:

```sql
-- Пример создания таблицы с комментариями
CREATE TABLE objects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  developer TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Комментарий к таблице
COMMENT ON TABLE objects IS 'Объекты строительства для анализа фасадов';

-- Комментарии к столбцам
COMMENT ON COLUMN objects.id IS 'Уникальный идентификатор объекта';
COMMENT ON COLUMN objects.name IS 'Название объекта/ЖК';
COMMENT ON COLUMN objects.address IS 'Адрес объекта';
COMMENT ON COLUMN objects.developer IS 'Название застройщика';
COMMENT ON COLUMN objects.image_url IS 'URL изображения объекта в Supabase Storage';
COMMENT ON COLUMN objects.created_at IS 'Дата и время создания записи';
```

Это помогает понимать назначение таблиц и полей при работе с базой данных.

## CSS Variables

Defined in `src/index.css`:
- `--color-bg`, `--color-bg-secondary` for backgrounds
- `--color-business` (blue), `--color-premium` (purple) for class badges
- `--color-text`, `--color-text-secondary`, `--color-border`, `--color-accent`
- `--font-family` for typography (Inter font with system fallbacks)

## SQL Migrations

SQL migration files are stored in `supabase/` directory with numeric prefixes (001_, 002_, etc.). Always include table and column comments in Russian when creating new tables.
