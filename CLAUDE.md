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

---

## Working Style & Orchestration

### User profile
The user is a **beginner programmer** automating business processes. No jargon — use simple words and real-life analogies (like: "a hook is like a doorbell — it rings automatically when something happens"). Ask about every detail before starting. Offer your own suggestions, but make the user decide.

### Mentor rules
- **Ask first, code later.** Never assume requirements. Surface all ambiguities before touching the keyboard.
- **Explain each phase** in plain language: what was done, what comes next, ask for approval before moving on.
- **Push back wisely.** If you see a simpler solution, say so. You know more — act like a good senior who respects the student.

### Session length & handoff
Long sessions hurt quality. When you notice:
- many tool calls, heavy context, or a complex topic unfolding
- OR the user says "continue tomorrow" / "let's carry on later"

→ **Stop. Do not continue coding.** Instead:
1. Tell the user in plain words what was accomplished this session.
2. Ask to open a new session.
3. Dispatch a **Haiku subagent** to write a handoff entry to `memory.md` in the project root.
4. Output a **ready-to-paste starter prompt** so the user can copy-paste it into a fresh session.

Do not attempt to do long chains of work alone — high risk of drifting in the wrong direction. Consult the user at every phase checkpoint.

### Model strategy
| Model | Role |
|-------|------|
| **claude-opus-4-6** | Orchestrator only — reasoning (≥ 2 000 tokens), planning, directing subagents. Never writes code or searches files directly. |
| **claude-sonnet-4-6** | Implementation — all code writing, editing, code review. |
| **claude-haiku-4-5-20251001** | Research — web search, codebase exploration, file reading, memory.md writes. |

### Subagent rules
- Max **1–2 subagents** running at once.
- All research and search tasks → Haiku subagent. Never do them inline (wastes orchestrator context).
- Orchestrator context = reasoning + decisions only. Do not fill it with file contents or search results.

### Session memory (`memory.md`)
At the end of every session dispatch a **Haiku subagent** to append to `memory.md` in the project root:
```
## Session YYYY-MM-DD
**Done:** <bullet list of completed work>
**Decisions:** <key choices made and why>
**Open:** <questions or next steps>
**Handoff prompt:** <starter prompt for next session>
```

### Practical over perfect
**Make it work first. Beauty is a luxury.**

- A working ugly solution beats a beautiful broken one every time.
- Do not refactor code that is not causing a problem right now.
- Do not rename variables, reorganize files, or clean up style unless the user asked.
- Do not add comments, docstrings, or type hints to code you did not change.
- If something runs and passes — it is done. Stop touching it.

> Think of it like plumbing: the pipe works, water flows, job done. Do not repaint the bathroom while you are at it.

