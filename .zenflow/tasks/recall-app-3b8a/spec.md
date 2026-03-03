# Recall App - Technical Specification

## 1. Technical Context

### Language & Runtime
- **TypeScript 5.9+** (strict mode, matching monorepo)
- **Node.js 18+** (server functions)
- **SQLite** via `better-sqlite3` + `drizzle-orm` (existing DB layer)

### Framework Stack (identical to `@nxus/calendar-app`)
- **Vite 7** + **TanStack Start** + **Nitro** (SSR + server functions)
- **TanStack Router** (file-based routing, `basepath: '/recall'`)
- **TanStack Query** (server state / cache invalidation)
- **React 19**
- **Tailwind CSS v4** + **shadcn/ui** components from `@nxus/ui`

### New Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `ts-fsrs` | `^4.x` | FSRS spaced repetition scheduling algorithm |
| `@anthropic-ai/sdk` | `^0.x` | Claude API for concept generation, question generation, answer evaluation |
| `date-fns` | `^4.x` | Date formatting/comparison (already used in calendar) |

### Existing Dependencies (reused)
- `@nxus/db` - Node/property DB layer, bootstrap, facade
- `@nxus/ui` - Card, Button, Badge, Input, Textarea, Select, AlertDialog, Field, Skeleton
- `@phosphor-icons/react` - Icons
- `zod` - Schema validation (v4, workspace root)
- `zustand` - Client state (if needed for session state)

---

## 2. Architecture Decision: App-Only (No Separate Library)

Unlike `@nxus/calendar` which has a separate `libs/nxus-calendar/` library, **the Recall app will keep all code within `apps/nxus-recall/`**. Rationale:

1. **No cross-app reuse** - No other app needs recall components or services
2. **Simpler structure** - Fewer packages to maintain, no dual entry point complexity
3. **AI SDK isolation** - The Anthropic SDK is server-only; keeping it app-local avoids the `googleapis`-style bundling issues that forced `@nxus/calendar` to have a `/server` export
4. **Can extract later** - If recall logic is needed elsewhere, refactoring to a lib is straightforward

Server functions using `@anthropic-ai/sdk` and `ts-fsrs` will live in `src/server/` files with dynamic imports where needed (following the Server Function Isolator Pattern from AGENTS.MD).

---

## 3. Source Code Structure

### 3.1 New App: `apps/nxus-recall/`

```
apps/nxus-recall/
├── package.json                    # @nxus/recall-app
├── vite.config.ts                  # base: '/recall/', port 3004
├── tsconfig.json
├── tsconfig.app.json
├── src/
│   ├── router.tsx                  # createRouter({ basepath: '/recall' })
│   ├── routeTree.gen.ts            # Auto-generated
│   ├── styles.css                  # Tailwind imports + app styles
│   ├── lib/
│   │   └── query-client.ts         # TanStack Query client
│   ├── types/
│   │   ├── recall.ts               # Domain types: RecallTopic, RecallConcept, RecallCard, ReviewLog
│   │   ├── ai.ts                   # AI operation types: GeneratedConcept, GeneratedQuestion, AnswerEvaluation
│   │   └── schemas.ts              # Zod schemas for server function inputs/outputs
│   ├── server/
│   │   ├── recall.server.ts        # CRUD server fns: topics, concepts, due cards
│   │   ├── ai.server.ts            # AI server fns: generate concepts, questions, evaluate answers
│   │   ├── fsrs.server.ts          # FSRS scheduling server fn: rate card, preview intervals
│   │   └── recall-logic.ts         # Pure logic: node<->domain conversion, FSRS wrappers
│   ├── hooks/
│   │   ├── use-topics.ts           # useQuery for topics list
│   │   ├── use-concepts.ts         # useQuery for concepts by topic
│   │   ├── use-due-cards.ts        # useQuery for due cards
│   │   └── use-review-session.ts   # Session state machine (current card, phase, queue)
│   ├── components/
│   │   ├── concept-card.tsx         # Generated concept display (explore flow)
│   │   ├── topic-card.tsx           # Topic summary card (dashboard grid)
│   │   ├── review-question.tsx      # Question display phase
│   │   ├── review-answer.tsx        # Answer input phase
│   │   ├── review-feedback.tsx      # AI feedback + rating phase
│   │   ├── rating-buttons.tsx       # Again/Hard/Good/Easy with interval previews
│   │   ├── blooms-badge.tsx         # Bloom's level color-coded badge
│   │   ├── create-concept-modal.tsx # Manual concept creation dialog
│   │   └── empty-state.tsx          # Onboarding CTA for empty dashboard
│   └── routes/
│       ├── __root.tsx               # Root layout (QueryProvider, theme sync, head)
│       ├── index.tsx                # Dashboard: due count, topic grid, start review
│       ├── explore.tsx              # Topic search + AI concept generation
│       ├── topics/
│       │   └── $topicId.tsx         # Topic detail: concept list, stats, scoped review
│       └── review/
│           └── session.tsx          # Active review session
```

### 3.2 Changes to Existing Code

#### `libs/nxus-db/src/schemas/node-schema.ts`
Add recall-specific constants to `SYSTEM_SUPERTAGS`, `SYSTEM_FIELDS`, and `FIELD_NAMES`:

```typescript
// SYSTEM_SUPERTAGS additions:
RECALL_TOPIC: 'supertag:recall-topic',
RECALL_CONCEPT: 'supertag:recall-concept',
RECALL_REVIEW_LOG: 'supertag:recall-review-log',

// SYSTEM_FIELDS additions (all as FieldSystemId):
RECALL_SUMMARY: 'field:recall-summary',
RECALL_WHY_IT_MATTERS: 'field:recall-why-it-matters',
RECALL_BLOOMS_LEVEL: 'field:recall-blooms-level',
RECALL_SOURCE: 'field:recall-source',
RECALL_RELATED_CONCEPTS: 'field:recall-related-concepts',
RECALL_DUE: 'field:recall-due',
RECALL_STABILITY: 'field:recall-stability',
RECALL_DIFFICULTY: 'field:recall-difficulty',
RECALL_ELAPSED_DAYS: 'field:recall-elapsed-days',
RECALL_SCHEDULED_DAYS: 'field:recall-scheduled-days',
RECALL_REPS: 'field:recall-reps',
RECALL_LAPSES: 'field:recall-lapses',
RECALL_STATE: 'field:recall-state',
RECALL_LAST_REVIEW: 'field:recall-last-review',
RECALL_QUESTION_TEXT: 'field:recall-question-text',
RECALL_QUESTION_TYPE: 'field:recall-question-type',
RECALL_USER_ANSWER: 'field:recall-user-answer',
RECALL_AI_FEEDBACK: 'field:recall-ai-feedback',
RECALL_RATING: 'field:recall-rating',

// FIELD_NAMES additions (matching content names for reads):
RECALL_SUMMARY: 'recall-summary' as FieldContentName,
RECALL_WHY_IT_MATTERS: 'recall-why-it-matters' as FieldContentName,
// ... (one for each field above)
```

#### `libs/nxus-db/src/services/bootstrap.ts`
Add a new bootstrap step (Step 6) to create recall supertags and fields:

- 3 supertags: `#RecallTopic`, `#RecallConcept`, `#RecallReviewLog`
- ~18 field definitions with appropriate `field_type` values
- Topic owns concepts via `ownerId` (concept.ownerId = topic.id)
- Review log's `ownerId` = concept.id

#### `apps/nxus-gateway/vite.config.ts`
Add proxy route:
```typescript
'/recall': { target: 'localhost', port: 3004 },
```

#### `apps/nxus-gateway/src/config/mini-apps.ts`
Add recall entry:
```typescript
{
  id: 'nxus-recall',
  name: 'nXus Recall',
  description: 'AI-powered spaced repetition for deep learning and active recall.',
  icon: 'cube', // or add 'brain' to the icon union
  path: '/recall',
}
```

#### Root `package.json`
Add dev script:
```json
"dev:recall": "nx run @nxus/recall-app:dev"
```
Update `dev` script to include `@nxus/recall-app` in `--projects`.

---

## 4. Data Model

### 4.1 Node Hierarchy

```
RecallTopic (supertag:recall-topic)
  ├── content = "Distributed Systems"           (topic name)
  ├── field:description = "..."                 (optional description)
  │
  └── RecallConcept (supertag:recall-concept, ownerId = topic.id)
        ├── content = "CAP Theorem"             (concept title)
        ├── field:recall-summary = "..."
        ├── field:recall-why-it-matters = "..."
        ├── field:recall-blooms-level = "apply"
        ├── field:recall-source = "..."         (optional)
        ├── field:recall-related-concepts = "[id1, id2]"
        ├── field:recall-due = "2026-03-05T00:00:00Z"
        ├── field:recall-stability = "4.5"
        ├── field:recall-difficulty = "5.8"
        ├── field:recall-elapsed-days = "3"
        ├── field:recall-scheduled-days = "4"
        ├── field:recall-reps = "2"
        ├── field:recall-lapses = "0"
        ├── field:recall-state = "2"            (0=New,1=Learning,2=Review,3=Relearning)
        ├── field:recall-last-review = "2026-03-02T10:00:00Z"
        │
        └── RecallReviewLog (supertag:recall-review-log, ownerId = concept.id)
              ├── field:recall-question-text = "..."
              ├── field:recall-question-type = "application"
              ├── field:recall-user-answer = "..."
              ├── field:recall-ai-feedback = "..."
              ├── field:recall-rating = "3"     (1=Again,2=Hard,3=Good,4=Easy)
              └── createdAt = review timestamp
```

### 4.2 Domain Types (TypeScript)

```typescript
// types/recall.ts

type BloomsLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create'
type FsrsState = 0 | 1 | 2 | 3  // New | Learning | Review | Relearning
type FsrsRating = 1 | 2 | 3 | 4 // Again | Hard | Good | Easy

interface RecallTopic {
  id: string
  name: string
  description?: string
  conceptCount: number   // computed
  dueCount: number       // computed
}

interface RecallConcept {
  id: string
  topicId: string
  topicName: string
  title: string
  summary: string
  whyItMatters: string
  bloomsLevel: BloomsLevel
  source?: string
  relatedConceptIds: string[]
  card: RecallCard
}

interface RecallCard {
  due: string              // ISO date
  state: FsrsState
  reps: number
  lapses: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  lastReview?: string      // ISO date
}

interface ReviewLog {
  id: string
  conceptId: string
  questionText: string
  questionType: string
  userAnswer: string
  aiFeedback: string
  rating: FsrsRating
  reviewedAt: string       // ISO date (createdAt)
}
```

### 4.3 Node <-> Domain Conversion

Conversion functions in `server/recall-logic.ts`:

- `nodeToRecallTopic(node, conceptCount, dueCount)` - Assembles a topic from its node
- `nodeToRecallConcept(node, topicName)` - Assembles a concept with its FSRS card state from properties
- `nodeToReviewLog(node)` - Assembles a review log entry
- `conceptToFsrsCard(concept)` - Converts RecallCard to ts-fsrs `Card` object for scheduling
- `fsrsCardToProperties(card)` - Converts ts-fsrs `Card` back to property values for storage

---

## 5. Server Functions (API Layer)

All server functions use `createServerFn({ method: 'POST' })` with `.inputValidator()` (Zod schemas) and return `{ success: true, data } | { success: false, error: string }`.

### 5.1 Recall CRUD (`recall.server.ts`)

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `getTopicsServerFn` | `{}` | `RecallTopic[]` | List all topics with computed counts |
| `getTopicServerFn` | `{ topicId }` | `RecallTopic` | Single topic with counts |
| `getConceptsByTopicServerFn` | `{ topicId }` | `RecallConcept[]` | All concepts for a topic |
| `getDueCardsServerFn` | `{ topicId? }` | `RecallConcept[]` | Due concepts (recall-due <= now), optionally filtered by topic |
| `saveConceptServerFn` | `{ topicName, title, summary, whyItMatters, bloomsLevel, source?, relatedConceptIds? }` | `RecallConcept` | Creates topic (if new) + concept + FSRS card (New, due=now) |
| `createManualConceptServerFn` | `{ topicId, title, summary, whyItMatters, bloomsLevel, source?, relatedConceptIds? }` | `RecallConcept` | Creates concept under existing topic |

### 5.2 AI Operations (`ai.server.ts`)

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `generateConceptsServerFn` | `{ topicName, existingConcepts?: string[] }` | `GeneratedConcept[]` | AI generates 5-8 concepts for a topic |
| `generateQuestionServerFn` | `{ conceptId }` | `GeneratedQuestion` | AI generates a question for a concept (loads concept + related from DB) |
| `evaluateAnswerServerFn` | `{ conceptId, questionText, questionType, userAnswer }` | `AnswerEvaluation` | AI evaluates answer, returns feedback + suggested rating |

**AI Facade Pattern**: A thin abstraction in `server/recall-logic.ts`:

```typescript
// Anthropic SDK structured output via zodOutputFormat + messages.parse
async function callAI<T>(schema: z.ZodType<T>, systemPrompt: string, userPrompt: string): Promise<T> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')
  const client = new Anthropic() // reads ANTHROPIC_API_KEY from env

  const message = await client.messages.parse({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
    output_config: { format: zodOutputFormat(schema) },
  })

  if (!message.parsed_output) throw new Error('AI returned no structured output')
  return message.parsed_output
}
```

Dynamic import of `@anthropic-ai/sdk` ensures it never gets bundled into the client.

### 5.3 FSRS Scheduling (`fsrs.server.ts`)

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `rateCardServerFn` | `{ conceptId, rating }` | `RecallCard` | Applies FSRS rating, updates card state, creates review log |
| `previewIntervalsServerFn` | `{ conceptId }` | `{ [Rating]: { due, scheduledDays } }` | Preview next-review for each rating option (for button labels) |

**ts-fsrs Integration**:

```typescript
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'

const f = fsrs({ request_retention: 0.9, maximum_interval: 365 })

// On save concept: createEmptyCard(new Date()) -> store all card fields
// On rate: f.next(card, now, rating) -> update card fields + create review log
// On preview: f.repeat(card, now) -> return intervals for each rating
```

---

## 6. Client-Side Hooks

### 6.1 Data Hooks (TanStack Query)

```typescript
// Query key factory
const recallKeys = {
  topics: ['recall', 'topics'] as const,
  topic: (id: string) => ['recall', 'topics', id] as const,
  concepts: (topicId: string) => ['recall', 'concepts', topicId] as const,
  dueCards: (topicId?: string) => ['recall', 'due', topicId ?? 'all'] as const,
}

function useTopics(): { topics: RecallTopic[], isLoading, error }
function useConcepts(topicId: string): { concepts: RecallConcept[], isLoading, error }
function useDueCards(topicId?: string): { cards: RecallConcept[], isLoading, error }
```

### 6.2 Review Session Hook

The review session is a client-side state machine managed by a custom hook (not Zustand — session is ephemeral):

```typescript
type ReviewPhase = 'question' | 'answer' | 'feedback' | 'complete'

interface ReviewSessionState {
  queue: RecallConcept[]
  currentIndex: number
  currentCard: RecallConcept | null
  phase: ReviewPhase
  question: GeneratedQuestion | null
  evaluation: AnswerEvaluation | null
  intervals: Record<number, { due: string, scheduledDays: number }> | null
}

function useReviewSession(topicId?: string): {
  state: ReviewSessionState
  startSession: () => Promise<void>     // Load due cards
  submitAnswer: (answer: string) => Promise<void>  // Call evaluateAnswerServerFn
  rateCard: (rating: FsrsRating) => Promise<void>  // Call rateCardServerFn, advance queue
  progress: { current: number, total: number }
}
```

---

## 7. Route Implementations

### 7.1 Dashboard (`/recall/`)
- Uses `useTopics()` and `useDueCards()`
- Empty state: large CTA linking to `/recall/explore`
- Non-empty: due count badge, topic grid (TopicCard components), "Start Review" button
- TopicCard shows: name, concept count, due count badge

### 7.2 Explore (`/recall/explore`)
- Text input for topic name
- "Generate" button calls `generateConceptsServerFn`
- Results rendered as ConceptCard components with staggered animation (CSS `animation-delay`)
- Each card: Save / Dismiss buttons
- Save calls `saveConceptServerFn`
- Can regenerate or switch topics

### 7.3 Topic Detail (`/recall/topics/$topicId`)
- Uses `useConcepts(topicId)` for concept list
- Shows topic name, description, aggregate stats
- "Start Review" scoped to this topic
- "Add Concept" button opens `CreateConceptModal` (AlertDialog)
- "Generate More" links to `/recall/explore?topic=<name>`
- Concept list shows: title, bloom's badge, FSRS state, due date

### 7.4 Review Session (`/recall/review/session`)
- URL search param: `?topicId=<id>` (optional, omit for all topics)
- Uses `useReviewSession(topicId)`
- Question phase: displays question, textarea for answer
- Feedback phase: displays AI feedback, rating buttons with interval previews
- Progress bar: "3 of 12"
- Complete phase: session summary, link back to dashboard

---

## 8. Gateway & Infrastructure Changes

### 8.1 Gateway Proxy
Add to `miniAppProxy()` routes in `apps/nxus-gateway/vite.config.ts`:
```typescript
'/recall': { target: 'localhost', port: 3004 },
```

### 8.2 Mini-App Manifest
Add entry to `apps/nxus-gateway/src/config/mini-apps.ts` with a new icon type (extend the union to include `'brain'` or reuse `'cube'`).

### 8.3 Root Scripts
- Add `"dev:recall": "nx run @nxus/recall-app:dev"` to root `package.json`
- Add `@nxus/recall-app` to the `dev` script's `--projects` list

### 8.4 Nx Configuration
No changes to `nx.json` needed - Nx auto-discovers projects via `package.json` in `apps/`.

---

## 9. Delivery Phases

### Phase 1: Foundation
- Scaffold `apps/nxus-recall/` (package.json, vite.config, router, root layout, styles)
- Add recall supertags + fields to `@nxus/db` (node-schema.ts + bootstrap.ts)
- Register in gateway (proxy + manifest)
- Add root dev scripts
- **Verify**: App starts on port 3004, accessible via gateway at `/recall/`, bootstrap creates recall system nodes

### Phase 2: Data Layer + CRUD
- Implement domain types and Zod schemas (`types/`)
- Implement node<->domain conversion functions (`server/recall-logic.ts`)
- Implement CRUD server functions (`server/recall.server.ts`)
- Implement FSRS server functions (`server/fsrs.server.ts`)
- Implement data hooks (`hooks/`)
- **Verify**: Server functions work via manual testing, FSRS scheduling produces correct intervals

### Phase 3: Dashboard + Topics
- Implement Dashboard route (empty state + topic grid)
- Implement TopicCard component
- Implement Topic Detail route (concept list, stats)
- Implement CreateConceptModal (manual concept creation)
- Implement BloomsBadge component
- **Verify**: Can navigate between dashboard and topic detail, manual concept creation works

### Phase 4: AI Integration + Explore
- Implement AI facade (`callAI` function with structured output)
- Implement concept generation server function
- Implement Explore route with animated concept reveal
- Implement ConceptCard with Save/Dismiss
- **Verify**: Can generate concepts for a topic, save them, see them in topic detail

### Phase 5: Review Session
- Implement question generation server function
- Implement answer evaluation server function
- Implement `useReviewSession` hook (state machine)
- Implement review route with all phases (question, answer, feedback, rate)
- Implement RatingButtons with interval previews
- **Verify**: Full review flow works end-to-end: generate question -> answer -> feedback -> rate -> next card

---

## 10. Verification Approach

### Lint / Type Check
```bash
# Type check the new app
npx nx typecheck @nxus/recall-app

# Type check the modified DB library
npx nx typecheck @nxus/db
```

### Unit Tests
```bash
# Run all lib tests (includes @nxus/db bootstrap changes)
pnpm test:libs
```

Key testable units:
- Node<->domain conversion functions (pure, no DB needed with mock nodes)
- FSRS wrapper functions (pure, uses ts-fsrs directly)
- Zod schemas (validation edge cases)

### Manual Verification
- Gateway landing page shows Recall app card
- Navigate to `/recall/` through gateway
- Create topic via Explore, save concepts
- View concepts in Topic Detail
- Start and complete a review session
- Verify FSRS rescheduling (card due dates update correctly)

### Integration Testing
- Server functions callable end-to-end (TanStack Start RPC through gateway proxy)
- AI operations return valid structured output (requires `ANTHROPIC_API_KEY`)
- Bootstrap idempotency (re-running bootstrap doesn't duplicate recall nodes)
