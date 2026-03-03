# Full SDD workflow

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

If you are blocked and need user clarification, mark the current step with `[!]` in plan.md before stopping.

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: 01bc4410-ffa1-468b-8efe-36aa3f55f809 -->

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `{@artifacts_path}/requirements.md`.

### [x] Step: Technical Specification
<!-- chat-id: 3d4a09ca-fc3d-4874-b118-84fc5578bdf4 -->

Create a technical specification based on the PRD in `{@artifacts_path}/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning
<!-- chat-id: 23323b34-1d0f-4fa2-a64b-73c844412d9f -->

Create a detailed implementation plan based on `{@artifacts_path}/spec.md`.

1. Break down the work into concrete tasks
2. Each task should reference relevant contracts and include verification steps
3. Replace the Implementation step below with the planned tasks

### [x] Step 1: App Scaffold & Gateway Integration
<!-- chat-id: ec6af9b6-0f10-4a8a-b01f-47428fa12f04 -->

Scaffold the `apps/nxus-recall/` app and register it in the gateway. This establishes the foundational project structure that all subsequent steps build on.

**Files to create:**
- `apps/nxus-recall/package.json` — `@nxus/recall-app`, port 3004, deps: `@nxus/db`, `@nxus/ui`, `ts-fsrs`, `@anthropic-ai/sdk`, `date-fns`, `@tanstack/react-query`, `@tanstack/react-router`, `@tanstack/react-start`, `react`, `react-dom`, `shadcn`, `tailwindcss`, `zustand`, `nitro`, etc. (mirror `@nxus/calendar-app` deps)
- `apps/nxus-recall/vite.config.ts` — `base: '/recall/'`, port 3004, `optimizeDeps.exclude: ['better-sqlite3', 'drizzle-orm/better-sqlite3', '@nxus/db']`, `ssr.noExternal: ['@nxus/db']`, `build.rollupOptions.external: ['better-sqlite3']`
- `apps/nxus-recall/tsconfig.json` — mirror calendar's tsconfig with `paths: { "@/*": ["./src/*"] }`, references to `../../libs/nxus-ui` and `../../libs/nxus-db`
- `apps/nxus-recall/src/router.tsx` — `createRouter({ basepath: '/recall' })`, NotFound component
- `apps/nxus-recall/src/routes/__root.tsx` — theme provider (localStorage `nxus-theme`), `QueryClientProvider`, `ScrollRestoration`, head with CSS link
- `apps/nxus-recall/src/routes/index.tsx` — placeholder Dashboard route (just renders "Recall Dashboard" text)
- `apps/nxus-recall/src/styles.css` — `@import 'tailwindcss'`, `@import 'tw-animate-css'`, `@import 'shadcn/tailwind.css'`, `@source` directives for `@nxus/ui`, theme imports from `nxus-core/src/styles/themes/`
- `apps/nxus-recall/src/lib/query-client.ts` — `QueryClient` with `staleTime: 60_000`

**Files to modify:**
- `apps/nxus-gateway/vite.config.ts` — add `'/recall': { target: 'localhost', port: 3004 }` to `miniAppProxy()` routes
- `apps/nxus-gateway/src/config/mini-apps.ts` — add recall entry (extend icon union if needed for `'brain'`, or use `'cube'`)
- Root `package.json` — add `"dev:recall"` script, add `@nxus/recall-app` to `dev` script's `--projects` list, bump `--parallel` count

**Verification:**
- `pnpm install` succeeds
- `pnpm dev:recall` starts the app on port 3004
- Navigating to `http://localhost:3004/recall/` shows the placeholder page
- Gateway proxy at `http://localhost:3001/recall/` routes to the app

### [x] Step 2: DB Schema — Recall Supertags & Fields
<!-- chat-id: f85a04fe-d929-410e-ba48-8609a3047750 -->

Add recall-specific system constants and bootstrap logic to `@nxus/db` so the database knows about topics, concepts, and review logs.

**Files to modify:**
- `libs/nxus-db/src/schemas/node-schema.ts`:
  - Add to `SYSTEM_SUPERTAGS`: `RECALL_TOPIC`, `RECALL_CONCEPT`, `RECALL_REVIEW_LOG`
  - Add to `SYSTEM_FIELDS` (all as `FieldSystemId`): `RECALL_SUMMARY`, `RECALL_WHY_IT_MATTERS`, `RECALL_BLOOMS_LEVEL`, `RECALL_SOURCE`, `RECALL_RELATED_CONCEPTS`, `RECALL_DUE`, `RECALL_STABILITY`, `RECALL_DIFFICULTY`, `RECALL_ELAPSED_DAYS`, `RECALL_SCHEDULED_DAYS`, `RECALL_REPS`, `RECALL_LAPSES`, `RECALL_STATE`, `RECALL_LAST_REVIEW`, `RECALL_QUESTION_TEXT`, `RECALL_QUESTION_TYPE`, `RECALL_USER_ANSWER`, `RECALL_AI_FEEDBACK`, `RECALL_RATING`
  - Add to `FIELD_NAMES` (as `FieldContentName`): matching content names for each field above
- `libs/nxus-db/src/services/bootstrap.ts`:
  - Add recall supertags to `entitySupertags` array in Step 3: `#RecallTopic`, `#RecallConcept`, `#RecallReviewLog` (independent, no extends)
  - Add recall field definitions to `commonFields` array in Step 4 with appropriate `fieldType` values (`text`, `number`, `json`)

**Verification:**
- `pnpm test:libs` passes (bootstrap tests still work)
- App starts and bootstrap creates the recall system nodes (check console logs or DB inspection)

### [x] Step 3: Domain Types, Zod Schemas & Node Conversion
<!-- chat-id: c7f59ddc-57c3-4396-b56a-7ec9c7d71ccf -->

Create the TypeScript types, Zod validation schemas, and pure conversion functions that form the data layer contract.

**Files to create:**
- `apps/nxus-recall/src/types/recall.ts` — `BloomsLevel`, `FsrsState`, `FsrsRating`, `RecallTopic`, `RecallConcept`, `RecallCard`, `ReviewLog` interfaces
- `apps/nxus-recall/src/types/ai.ts` — `GeneratedConcept`, `GeneratedQuestion`, `AnswerEvaluation` interfaces
- `apps/nxus-recall/src/types/schemas.ts` — Zod schemas for all server function inputs/outputs: `SaveConceptInputSchema`, `CreateManualConceptInputSchema`, `GenerateConceptsInputSchema`, `GenerateQuestionInputSchema`, `EvaluateAnswerInputSchema`, `RateCardInputSchema`, `PreviewIntervalsInputSchema`, etc.
- `apps/nxus-recall/src/server/recall-logic.ts` — Pure conversion functions:
  - `nodeToRecallTopic(node, conceptCount, dueCount)` — assembles `RecallTopic` from `AssembledNode`
  - `nodeToRecallConcept(node, topicName)` — assembles `RecallConcept` with FSRS card from node properties (reads fields via `getProperty` + `FIELD_NAMES`)
  - `nodeToReviewLog(node)` — assembles `ReviewLog`
  - `conceptToFsrsCard(concept)` — converts `RecallCard` to `ts-fsrs` `Card` object
  - `fsrsCardToProperties(card)` — converts `ts-fsrs` `Card` back to property map for storage
  - `createEmptyRecallCard()` — returns default FSRS card (state=New, due=now) using `ts-fsrs` `createEmptyCard`

**Verification:**
- Type-check passes: `npx nx typecheck @nxus/recall-app`
- Unit tests for conversion functions (create `apps/nxus-recall/src/server/recall-logic.test.ts`): test round-trip nodeToRecallConcept and fsrsCardToProperties, test createEmptyRecallCard produces valid defaults

### [x] Step 4: CRUD Server Functions
<!-- chat-id: 41bc6de7-3863-4f12-9790-3678ace25ad5 -->

Implement the core data access server functions for topics, concepts, and due cards.

**Files to create:**
- `apps/nxus-recall/src/server/recall.server.ts` — Server functions using `createServerFn({ method: 'POST' })` + `.inputValidator()`:
  - `getTopicsServerFn` — query all nodes with `supertag:recall-topic`, for each compute conceptCount and dueCount by querying child concepts
  - `getTopicServerFn({ topicId })` — single topic with counts
  - `getConceptsByTopicServerFn({ topicId })` — query concepts where `ownerId = topicId`, assemble with `nodeToRecallConcept`
  - `getDueCardsServerFn({ topicId? })` — query concepts where `recall-due <= now`, optionally filtered by topic ownerId
  - `saveConceptServerFn({ topicName, title, summary, whyItMatters, bloomsLevel, source?, relatedConceptIds? })` — find-or-create topic by name (query by supertag + content match), create concept node with ownerId=topic.id, set all properties including FSRS defaults
  - `createManualConceptServerFn({ topicId, title, summary, whyItMatters, bloomsLevel, source?, relatedConceptIds? })` — create concept under existing topic

  All functions follow the pattern: `await nodeFacade.init()`, create/query nodes, `await nodeFacade.save()`, return `{ success: true, data }` or `{ success: false, error }`.

**Verification:**
- Type-check passes
- Manual testing: call server functions via the app's dev server to create a topic + concept, query them back

### [x] Step 5: FSRS Scheduling Server Functions
<!-- chat-id: 2af0a88d-715a-40a8-b609-dcb961bcbfab -->

Implement the spaced repetition scheduling layer using `ts-fsrs`.

**Files to create:**
- `apps/nxus-recall/src/server/fsrs.server.ts`:
  - `rateCardServerFn({ conceptId, rating, questionText, questionType, userAnswer, aiFeedback })` — loads concept from DB, converts to `ts-fsrs` Card, calls `f.next(card, now, rating)`, updates all FSRS properties on the concept node, creates a ReviewLog child node with question/answer/feedback/rating, returns updated `RecallCard`
  - `previewIntervalsServerFn({ conceptId })` — loads concept, converts to Card, calls `f.repeat(card, now)`, returns `{ [Rating]: { due, scheduledDays } }` for each of Again/Hard/Good/Easy

  Uses `ts-fsrs`: `import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'`, configured with `request_retention: 0.9, maximum_interval: 365`.

**Verification:**
- Type-check passes
- Unit test (`apps/nxus-recall/src/server/fsrs.server.test.ts` or test the pure logic in `recall-logic.test.ts`): test that rateCard with Rating.Good on a New card transitions it to Learning/Review state with a future due date; test previewIntervals returns 4 entries with increasing intervals

### [x] Step 6: Data Hooks (TanStack Query)
<!-- chat-id: acba8c43-1994-40e5-8aa4-0b15982d3e0e -->

Create the client-side data hooks that components will use to fetch and mutate data.

**Files to create:**
- `apps/nxus-recall/src/hooks/use-topics.ts` — `useTopics()` returns `{ topics: RecallTopic[], isLoading, error, refetch }`, queryKey: `['recall', 'topics']`
- `apps/nxus-recall/src/hooks/use-concepts.ts` — `useConcepts(topicId)` returns `{ concepts: RecallConcept[], isLoading, error }`, queryKey: `['recall', 'concepts', topicId]`
- `apps/nxus-recall/src/hooks/use-due-cards.ts` — `useDueCards(topicId?)` returns `{ cards: RecallConcept[], count, isLoading, error }`, queryKey: `['recall', 'due', topicId ?? 'all']`
- `apps/nxus-recall/src/hooks/use-recall-mutations.ts` — `useSaveConcept()`, `useCreateManualConcept()`, `useRateCard()` — mutation hooks that invalidate relevant query keys on success

Each hook calls the corresponding server function and maps the response. Follow the calendar pattern: `useQuery({ queryKey, queryFn: async () => { const result = await serverFn({ data }); if (!result.success) throw new Error(result.error); return result.data } })`.

**Verification:**
- Type-check passes

### [x] Step 7: Dashboard & Topic Card Components
<!-- chat-id: afd140a3-a469-4847-bd2e-e95b91a7fd89 -->

Build the main landing page with topic grid and empty state.

**Files to create/modify:**
- `apps/nxus-recall/src/components/topic-card.tsx` — displays topic name, concept count, due count badge (using `@nxus/ui` Card, Badge). Clicking navigates to `/recall/topics/$topicId`.
- `apps/nxus-recall/src/components/empty-state.tsx` — onboarding CTA when no topics exist. Large centered layout with message + button linking to `/recall/explore`.
- `apps/nxus-recall/src/components/blooms-badge.tsx` — color-coded badge for Bloom's taxonomy level (remember=gray, understand=blue, apply=green, analyze=yellow, evaluate=orange, create=red).
- `apps/nxus-recall/src/routes/index.tsx` — replace placeholder with real Dashboard:
  - Uses `useTopics()` and `useDueCards()`
  - Empty state when no topics
  - Otherwise: global due count, topic grid (TopicCard), "Start Review" button linking to `/recall/review/session`

**Verification:**
- App renders Dashboard at `/recall/`
- Empty state shows when no topics exist
- After creating topics (via later steps or direct DB), topic cards appear with correct counts

### [x] Step 8: AI Facade & Concept Generation
<!-- chat-id: 2bd7a228-560c-4e44-be0f-34676ef3dc60 -->

Implement the AI integration layer and the Explore page for generating concepts.

**Files to create:**
- `apps/nxus-recall/src/server/ai.server.ts`:
  - `callAI<T>(schema, systemPrompt, userPrompt)` — thin facade: dynamically imports `@anthropic-ai/sdk`, uses `client.messages.create` with tool use for structured output via Zod schema. Retries once on malformed output.
  - `generateConceptsServerFn({ topicName, existingConcepts? })` — system prompt instructs Claude to generate 5-8 concepts at varied Bloom's levels, avoiding duplicates of existingConcepts. Returns `GeneratedConcept[]`.
  - `generateQuestionServerFn({ conceptId })` — loads concept + related concepts from DB, generates a higher-order question. Returns `GeneratedQuestion`.
  - `evaluateAnswerServerFn({ conceptId, questionText, questionType, userAnswer })` — loads concept context, evaluates answer. Returns `AnswerEvaluation` with feedback + suggestedRating.

- `apps/nxus-recall/src/components/concept-card.tsx` — generated concept display for Explore: title, summary, bloomsBadge, whyItMatters. Save / Dismiss buttons. Staggered fade-in animation via CSS `animation-delay`.
- `apps/nxus-recall/src/routes/explore.tsx` — Explore route:
  - Text input for topic name (pre-filled from `?topic=` search param)
  - "Generate" button calls `generateConceptsServerFn` (shows loading skeleton)
  - Results as ConceptCard list with staggered animation
  - Save calls `saveConceptServerFn` (via `useSaveConcept` mutation), dismiss removes from local state
  - Can regenerate or switch topics

**Verification:**
- Type-check passes
- Navigate to `/recall/explore`, enter a topic, click Generate
- AI returns structured concepts (requires `ANTHROPIC_API_KEY` env var)
- Saving a concept creates topic + concept in DB, appears on Dashboard

### [x] Step 9: Topic Detail Page & Manual Concept Creation
<!-- chat-id: c2742fdc-c6e2-4fa6-a020-2f8b7b8b6bd0 -->

Build the topic detail view with concept list and manual concept creation dialog.

**Files to create:**
- `apps/nxus-recall/src/components/create-concept-modal.tsx` — AlertDialog (from `@nxus/ui` or Base UI) with form fields: title (Input), summary (Textarea), whyItMatters (Textarea), bloomsLevel (Select), source (Input, optional). On submit calls `useCreateManualConcept` mutation.
- `apps/nxus-recall/src/routes/topics/$topicId.tsx` — Topic Detail route:
  - Uses `useConcepts(topicId)` for concept list
  - Header: topic name, aggregate stats (total concepts, due count, mastery distribution by FSRS state)
  - "Start Review" button links to `/recall/review/session?topicId=$topicId`
  - "Add Concept" button opens `CreateConceptModal`
  - "Generate More" links to `/recall/explore?topic=<topicName>`
  - Concept list table/cards: title, BloomsBadge, FSRS state label (New/Learning/Review/Relearning), due date

**Verification:**
- Navigate from Dashboard topic card to topic detail
- Concept list shows saved concepts with correct data
- Manual concept creation via modal works
- "Generate More" links to Explore with topic pre-filled

### [x] Step 10: Review Session
<!-- chat-id: a89c69a3-2e0a-482a-9228-1f0ec2760bd8 -->

Implement the full review session flow — the core learning experience.

**Files to create:**
- `apps/nxus-recall/src/hooks/use-review-session.ts` — state machine hook:
  - State: `{ queue, currentIndex, phase: 'loading'|'question'|'answer'|'feedback'|'complete', question, evaluation, intervals }`
  - `startSession()` — calls `getDueCardsServerFn`, populates queue, generates first question
  - `submitAnswer(answer)` — calls `evaluateAnswerServerFn`, calls `previewIntervalsServerFn`, transitions to feedback phase
  - `rateCard(rating)` — calls `rateCardServerFn`, advances to next card or complete
  - `progress` — `{ current, total }`
- `apps/nxus-recall/src/components/review-question.tsx` — question display: shows concept title context, question text, Bloom's badge for question type
- `apps/nxus-recall/src/components/review-answer.tsx` — answer input: Textarea with submit button
- `apps/nxus-recall/src/components/review-feedback.tsx` — AI feedback display: feedback text, suggested rating highlight
- `apps/nxus-recall/src/components/rating-buttons.tsx` — 4 buttons (Again/Hard/Good/Easy), color-coded (red/orange/green/blue), each showing interval preview text (e.g., "Good — 4d"). Suggested rating gets visual emphasis.
- `apps/nxus-recall/src/routes/review/session.tsx` — Review Session route:
  - Reads `?topicId` from search params (optional)
  - Uses `useReviewSession(topicId)`
  - Progress indicator: "3 of 12"
  - Renders phase-appropriate component (question → answer → feedback)
  - Complete phase: session summary (cards reviewed, ratings given), link back to dashboard

**Verification:**
- Start review from Dashboard or Topic Detail
- Full flow works: see question → type answer → see feedback + ratings → rate → next card → session complete
- FSRS state updates correctly (card due dates advance, state transitions from New → Learning → Review)
- Review logs are created in DB

### [ ] Step 11: Polish & Final Verification

Final integration testing and cleanup.

**Tasks:**
- [ ] Verify gateway proxy works end-to-end (all routes accessible via `localhost:3001/recall/...`)
- [ ] Verify theme sync works (change theme in nxus-core, recall app reflects it)
- [ ] Test empty states: no topics, no due cards, session with 0 due cards
- [ ] Test error states: AI API key missing, AI returns malformed output, network errors
- [ ] Run type-check: `npx nx typecheck @nxus/recall-app` and `npx nx typecheck @nxus/db`
- [ ] Run lib tests: `pnpm test:libs`
- [ ] Verify bootstrap idempotency (restart app, no duplicate system nodes)
- [ ] Review for security: no API key leakage to client, server functions properly isolated
