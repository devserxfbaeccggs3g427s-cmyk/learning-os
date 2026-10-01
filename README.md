# Learning OS

An AI-powered personal Learning OS for backend engineering research. Roadmap → Task → Study → Notes → AI Tutor → Flashcards → Quiz → Interview → Review → Mastery.

## What it is

A Next.js 15 / React 19 / TypeScript / Tailwind web application that:

- Imports roadmaps (JSON) and schedules (JSON).
- Manages Roadmap → Track → Module → Task hierarchy.
- Provides a "Today" command center with study blocks.
- Supports rich Markdown notes per task with auto-save, revisions, and custom semantic blocks.
- Integrates AI (OpenRouter) as Tutor, Interviewer, Failure / Debug Drill, Knowledge Gap Analyzer.
- Generates Flashcard decks and Quizzes with structured JSON output validated by Zod.
- Schedules flashcard reviews with an SM-2-inspired spaced repetition algorithm.
- Works offline for read-only views (PWA-ready).
- Stores everything in a local SQLite database.

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
# (edit APP_ENCRYPTION_KEY — generate with: openssl rand -base64 48)

# 3. Apply database migrations
DATABASE_URL='./data/learning-os.db' npm run db:migrate

# 4. (Optional) Seed a sample roadmap + today's schedule
DATABASE_URL='./data/learning-os.db' npm run db:seed

# 5. Run the dev server
DATABASE_URL='./data/learning-os.db' npm run dev
```

Open http://localhost:3000.

## Configuration

Configure AI provider at runtime via **Settings → AI provider** — your API key is encrypted at rest with AES-256-GCM.

Environment variables live in `.env.example`. The most important are:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Path to the SQLite file |
| `APP_ENCRYPTION_KEY` | 32+ chars; used to encrypt AI provider API keys |
| `AI_DEFAULT_*` | Fallback AI provider/model when user has none configured |
| `FEATURE_*` | Feature flags (PWA, knowledge gap, debug drill, etc.) |

## Architecture

```
app/                 # Pages (Next.js App Router)
  page.tsx           # Today (home / command center)
  roadmap/           # Roadmap tree view
  tasks/[id]/        # Task workspace (multi-tab)
  calendar/          # Calendar (4-week)
  review/            # Spaced repetition dashboard
  ai/                # Global AI chat
  settings/          # Settings (general, AI, appearance, import, data)
  api/               # HTTP API (chat, generate-flashcards, generate-quiz, …)

components/
  layout/AppShell.tsx   # Sidebar (desktop) + bottom nav (mobile)
  ui/                   # Primitive components (Button, Card, Tabs, ...)
  markdown/             # Renderer + custom :::concept / :::important blocks
  tasks/                # TaskWorkspace, NoteEditor, AITutor, FlashcardPanel, QuizPanel
  today/                # TodayView
  ai/                   # GlobalAIChat
  settings/             # AIConfigForm, ImportForm
  providers/            # ThemeProvider

lib/
  db/                   # Drizzle ORM schema (one file per domain area) + client
  ai/                   # AI provider abstraction
    provider.ts         # AIProvider interface
    openrouter.ts       # OpenRouter implementation
    registry.ts         # Provider registry
    prompts/            # PromptRegistry (single source of truth)
    context.ts          # Source-aware context builder
    schemas.ts          # Zod schemas for structured AI output
    service.ts          # ResolveAIConfig + per-user provider
  srs/scheduler.ts      # Pure SM-2-inspired SRS scheduler
  markdown/blocks.ts    # Parser for :::concept-style semantic blocks
  security/crypto.ts    # AES-256-GCM helpers
  utils/                # IDs, time, classNames
  ai/service.ts         # Provider resolution
  ai/registry.ts        # Provider lookup

config/
  app.ts                # Env + feature flags
  domain.ts             # Status enums, SRS defaults, mastery weights

scripts/
  migrate.ts            # Apply migrations
  seed.ts               # Insert sample roadmap + schedule
```

### Config-first principle

- All tunables live in `/config` (env-driven) or in the database (user-driven).
- Domain code reads from those files — never hard-codes a status, model name, or threshold.
- To onboard Anthropic: implement `AIProvider` in `lib/ai/anthropic.ts` and register in `lib/ai/registry.ts`. Business logic is unaffected.

### AI architecture

The Request pipeline:

```
User Action
   ↓
Feature Service (e.g. /api/ai/generate-flashcards)
   ↓
PromptRegistry (lib/ai/prompts)
   ↓
Context Builder (lib/ai/context)
   ↓
AIProvider (via resolveAIConfig + getProvider)
   ↓
Structured Output → Zod schema validation
   ↓
Persist + audit log
```

### Storage at a glance

| Domain | Tables |
|--------|--------|
| Roadmap | `roadmaps`, `tracks`, `modules`, `tasks`, `task_dependencies`, `tags`, `task_tags` |
| Notes | `task_notes`, `note_revisions` |
| Schedule | `schedules`, `study_blocks` |
| Sessions | `study_sessions`, `task_progress` |
| AI | `ai_configurations`, `prompt_templates`, `ai_conversations`, `ai_messages`, `ai_artifact_records` |
| Flashcards | `flashcard_decks`, `flashcards`, `review_history`, `review_sessions` |
| Quiz | `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_answers` |
| Mastery | `mastery_records` |
| Settings | `application_settings`, `audit_log`, `users` |

## Markdown blocks

Notes and AI output support GitHub-Flavored Markdown plus custom semantic blocks:

```
:::concept
A short explanation of a concept.
:::

:::important
Don't skip this.
:::

:::failure
What happens when the commit succeeds but the response is lost.
:::

:::interview
How would you explain MVCC in 60 seconds?
:::
```

Available kinds: `concept`, `important`, `example`, `failure`, `interview`, `lab`, `question`, `answer`, `flashcard`, `quiz`, `warning`, `section`.

Each block can take an optional title: `:::concept[Definition]`.

## Daily schedule

Today's blocks render on `/`. Each block can be **Start**ed (creates a study session), **Finished**, or **Skipped**. Sessions track actual minutes; task progress is rolled up automatically.

## Import / Export

- **Import Roadmap**: `Settings → Import` → paste a JSON matching `RoadmapImportSchema`.
- **Import Schedule**: same place, JSON matching `ScheduleImportSchema`.

Schemas are versioned (`schemaVersion`). Sample JSON is pre-filled in the import UI for quick experimentation.

## Roadmap import schema (excerpt)

```json
{
  "schemaVersion": 1,
  "title": "Backend Engineering",
  "tracks": [
    {
      "title": "Database Engineering",
      "modules": [
        {
          "title": "Transactions",
          "tasks": [
            {
              "code": "DB-TX-01",
              "title": "ACID & isolation levels",
              "priority": "P0",
              "difficulty": "ADVANCED",
              "estimatedMinutes": 75,
              "concepts": ["MVCC", "isolation", "dirty read"],
              "failureScenarios": [
                {"id": "FS-1", "title": "Phantom read", "body": "..."}
              ],
              "interviewQuestions": ["Repeatable read vs Serializable?"],
              "dependencies": ["DB-LOCK-01"],
              "tags": ["db", "transactions"]
            }
          ]
        }
      ]
    }
  ]
}
```

## Backup / restore

Coming soon — the schema is designed for full snapshot export via `ApplicationSetting` + per-table dumps.

## Security

- API keys are encrypted at rest with AES-256-GCM, derived from `APP_ENCRYPTION_KEY`.
- The key is never logged.
- AI requests go through server-side providers; the client never holds the API key.
- Markdown is rendered through `react-markdown`; user-supplied HTML is sanitized (no `rehype-raw` by default).
- All inputs are validated with Zod.

## Limitations & roadmap

- Search and command palette are stubbed for now.
- Knowledge gap analysis prompt is wired but the page UI is not yet built.
- Debug drill + failure drill prompts are wired but live drills UI is not yet built.
- No multi-user auth yet — single user, single device. Architecture is ready.
- Postgres migration is one Drizzle config flip away; SQLite is the default for zero-setup local dev.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Run production build |
| `npm run typecheck` | TypeScript strict check |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:seed` | Seed sample roadmap + today |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run test` | Run Vitest |

## License

Private, do not distribute.