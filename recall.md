# Recall Training App — Implementation Plan

## Context

Build an AI-powered recall training app (like Anki but for higher-order Bloom's taxonomy). Instead of showing flashcards directly, it generates dynamic questions that test understanding, application, analysis, and relational thinking between concepts. Uses FSRS for spaced repetition scheduling and Mastra + Claude for AI question generation.

**Key constraint from user**: The app consumes typesafe assembled objects from the DB service layer — it doesn't know about the underlying node/property architecture. The service layer in `@nxus/db` handles assembly.

## Architecture Overview

```
apps/nxus-recall/          — TanStack Start app (port 3004, base: /recall/)
libs/nxus-mastra/          — Mastra agents lib (concept gen, question gen, answer eval)
libs/nxus-db/              — New recall service + FSRS card tables (existing lib, extended)
```

## Storage Strategy

Everything stored as **nodes + properties** in the existing architecture. The recall service layer in `@nxus/db` handles assembly into typesafe objects — the app never touches raw nodes.

- **Topics, Concepts** → nodes with supertags (e.g., `supertag:recall-topic`, `supertag:recall-concept`)
- **FSRS Card State** → properties on concept nodes (field nodes for `due`, `stability`, `difficulty`, `reps`, `lapses`, `state`, etc.)
- **Review Logs** → nodes with supertag `supertag:recall-review-log`, linked to concept via property

The due-cards query joins `node_properties` filtering by the `due` field — fine at personal scale (<10k cards).

### New system nodes needed (bootstrap)

```
Supertags:  recall-topic, recall-concept, recall-review-log
Fields:     recall-summary, recall-why-it-matters, recall-blooms-level, recall-source,
            recall-related-concepts, recall-due, recall-stability, recall-difficulty,
            recall-elapsed-days, recall-scheduled-days, recall-reps, recall-lapses,
            recall-state, recall-last-review, recall-question-text, recall-question-type,
            recall-user-answer, recall-ai-feedback, recall-rating
```

### Assembled types the app sees

```typescript
RecallTopic     { id, name, description, conceptCount, dueCount }
RecallConcept   { id, topicId, topicName, title, summary, whyItMatters, bloomsLevel, source, relatedConceptTitles, card? }
RecallCard      { id, conceptId, due, state, reps, lapses, stability, difficulty }
ReviewLog       { id, conceptId, questionText, questionType, userAnswer, aiFeedback, rating, reviewedAt }
```

## Mastra Agents (`libs/nxus-mastra/`)

Three agents, all using Claude as model provider:

1. **Concept Generator** — Takes a topic → returns 5-8 structured concepts with titles, summaries, bloom levels, and related concept links
2. **Question Generator** — Takes a concept + adjacent concepts → returns ONE dynamic question at a higher Bloom's level (application, analysis, comparison, synthesis)
3. **Answer Evaluator** — Takes question + model answer + user answer → returns score mapping to FSRS rating (again/hard/good/easy) + constructive feedback

Schemas defined with Zod for structured AI output. Server-only via dynamic imports.

## Route Structure

```
/                    — Dashboard (due count, streak, topic cards)
/explore             — Topic search + AI concept generation (streaming)
/topics/$topicId     — Topic detail with concept list
/review/session      — Active review session (question → answer → feedback → rate → next)
/concepts/new        — Manual concept creation
```

## Core UX Flows

### Explore Flow
1. User types a topic → clicks "Generate"
2. Concepts stream in one-by-one (animated cards)
3. Each card has [Save] / [Dismiss] — save adds to deck with FSRS card (state=New, due=now)

### Review Session
1. Load due cards queue (FSRS `WHERE due <= now`)
2. For each card: fetch concept + adjacent concepts → AI generates question
3. User types answer → AI evaluates → shows feedback with suggested rating
4. User confirms/overrides rating → FSRS reschedules → next card
5. Rating buttons show next-review intervals (e.g., "Good → 4d")

## Implementation Sequence

### Step 1: Database service layer
- Add recall system nodes (supertags + fields) to bootstrap in `libs/nxus-db/src/services/bootstrap.ts`
- Add `recall.service.ts` to `libs/nxus-db/src/services/` — pure functions that create/query nodes and assemble them into typesafe `RecallTopic`, `RecallConcept`, `RecallCard`, `ReviewLog` objects
- Key functions: `getTopics()`, `getConceptsByTopic()`, `getDueCards()`, `saveConcept()`, `updateCardFsrs()`, `createReviewLog()`
- Files: `libs/nxus-db/src/services/recall.service.ts`, `libs/nxus-db/src/services/bootstrap.ts`

### Step 2: Mastra library
- Create `libs/nxus-mastra/` with package.json, tsconfig, agents, Zod schemas
- `index.ts` = client-safe types/schemas, `server.ts` = agents (requires `@mastra/core`)
- Add path aliases to `tsconfig.base.json`
- Files: `libs/nxus-mastra/src/index.ts`, `libs/nxus-mastra/src/server.ts`, `libs/nxus-mastra/src/agents/*.ts`, `libs/nxus-mastra/src/schemas/*.ts`

### Step 3: App scaffold
- Copy `apps/nxus-core` structure → `apps/nxus-recall`
- Update package.json (`@nxus/recall-app`, port 3004), vite.config (`base: '/recall/'`), router (`basepath: '/recall/'`)
- Add `@nxus/mastra` + `ts-fsrs` deps, Mastra exclusions in vite config
- Register in gateway proxy + mini-apps config
- Files: `apps/nxus-recall/package.json`, `apps/nxus-recall/vite.config.ts`, `apps/nxus-recall/src/router.tsx`, `apps/nxus-recall/src/routes/__root.tsx`

### Step 4: Server functions
- `topics.server.ts` — CRUD for topics
- `concepts.server.ts` — CRUD + save-from-AI
- `generate-concepts.server.ts` — streaming concept generation via Mastra
- `generate-question.server.ts` — question generation for review
- `evaluate-answer.server.ts` — answer evaluation
- `review.server.ts` — due card queue + FSRS submit (using `ts-fsrs`)

### Step 5: UI pages + components
- Dashboard with due count, streak, topic grid
- Explore page with streaming concept cards
- Review session with question → answer → feedback → rate flow
- Topic detail page
- Manual concept creation form

### Step 6: Gateway integration
- Add `/recall` route to `apps/nxus-gateway/vite.config.ts` proxy
- Add app card to `apps/nxus-gateway/src/config/mini-apps.ts`
- Add `dev:recall` script to root `package.json`

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@mastra/core` | AI agent framework |
| `ts-fsrs` | Spaced repetition scheduling |
| `@anthropic-ai/sdk` | Claude provider (peer dep of Mastra) |

## Verification

1. `pnpm dev` — all apps start, gateway proxies `/recall/` to port 3004
2. Navigate to `/recall/explore` — type a topic, see concepts stream in
3. Save concepts → appear in topic view with FSRS cards
4. Navigate to `/recall/review/session` — get AI-generated questions, submit answers, see feedback
5. After rating, card's next due date updates correctly per FSRS algorithm