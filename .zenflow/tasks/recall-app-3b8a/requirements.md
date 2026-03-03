# Recall Training App — Product Requirements Document

## 1. Overview

**Recall** is an AI-powered spaced repetition mini-app for the Nxus platform. Unlike traditional flashcard apps (Anki), it targets higher-order Bloom's taxonomy levels — testing understanding, application, analysis, and synthesis rather than rote memorization. It uses FSRS (Free Spaced Repetition Scheduler) for scheduling and Claude (via Anthropic SDK) for dynamic question generation and answer evaluation.

**Target user**: The Nxus user (single-user, personal productivity context).

## 2. Core Concepts

| Term | Definition |
|------|-----------|
| **Topic** | A subject area (e.g., "Distributed Systems", "TypeScript Type System"). Acts as a grouping container for concepts. |
| **Concept** | A discrete piece of knowledge within a topic. Has a title, summary, Bloom's level, and why-it-matters. Each concept gets an FSRS card for scheduling. |
| **Card** | FSRS scheduling state attached to a concept — tracks due date, stability, difficulty, reps, lapses, state (New/Learning/Review/Relearning). |
| **Review Log** | A record of one review session interaction: the AI-generated question, user's answer, AI feedback, and rating. |
| **Review Session** | A sequence of due-card reviews. For each card: AI generates a question, user answers, AI evaluates, user rates, card is rescheduled. |

## 3. User Flows

### 3.1 Onboarding / Explore Flow

This is the primary entry point for new users. The app starts empty — no topics, no cards.

1. User lands on the **Dashboard** (`/recall/`). Since there are no cards yet, the dashboard prominently shows an explore/onboarding CTA — similar to Spotify's genre selection on first launch.
2. User navigates to **Explore** (`/recall/explore`).
3. User types a topic name (or selects from AI-suggested topics) and clicks "Generate".
4. The AI generates 5-8 structured concepts for the topic. The response is returned as a batch, but concepts are revealed one-by-one with animation on the client for a polished feel.
5. Each concept card shows: title, summary, Bloom's level, why it matters.
6. Each card has **Save** / **Dismiss** actions.
   - **Save**: Creates the concept node in the DB with an FSRS card (state=New, due=now). If the topic doesn't exist yet, it is auto-created.
   - **Dismiss**: Card is removed from the UI (not persisted).
7. User can generate more concepts for the same topic, or switch to a different topic.

### 3.2 Review Session Flow

1. User clicks "Start Review" from the Dashboard or a Topic detail page.
2. The app loads a queue of due cards (FSRS `WHERE due <= now`). Can be scoped to a specific topic or all topics.
3. For each card in the queue:
   a. **Question phase**: The AI generates a dynamic question based on the concept + adjacent/related concepts. The question targets higher Bloom's levels (application, analysis, comparison, synthesis). Question is displayed to the user.
   b. **Answer phase**: User types their answer in a text area and submits.
   c. **Feedback phase**: The AI evaluates the answer against the concept's content. Returns: constructive feedback and a suggested FSRS rating (Again / Hard / Good / Easy).
   d. **Rating phase**: User sees the AI feedback and the suggested rating. Rating buttons show the next-review interval for each option (e.g., "Good - 4d", "Easy - 12d"). User can accept the suggested rating or override it.
   e. **Reschedule**: FSRS algorithm updates the card's scheduling state. A review log is created.
   f. **Next card**: Advance to the next due card, or show a "session complete" screen if the queue is empty.

### 3.3 Topic Detail Flow

1. User navigates to a topic from the Dashboard.
2. Topic detail page shows:
   - Topic name and description
   - List of concepts in this topic with their FSRS state (New, Learning, Review) and next due date
   - Aggregate stats (total concepts, due count, mastery distribution)
3. User can:
   - Start a review session scoped to this topic
   - Add a new concept manually (opens a modal/dialog — not a separate page)
   - Generate more concepts with AI (links to Explore with topic pre-filled)

### 3.4 Manual Concept Creation

- Triggered from the Topic detail page via a button that opens a modal/dialog.
- Form fields: title, summary, why it matters, Bloom's level (select), source (optional), related concepts (optional multi-select from existing concepts).
- On save: concept node is created with an FSRS card (state=New, due=now).
- Uses existing UI components from `@nxus/ui` where possible (Dialog, Input, Select, Textarea, Button).

### 3.5 Dashboard

The dashboard (`/recall/`) is the landing page. It shows:

- **Due count**: How many cards are due for review right now.
- **Topic grid**: Cards for each topic showing name, concept count, due count.
- **Start Review button**: Begins a review session across all due cards.
- **Empty state**: When no topics exist, show an onboarding prompt directing the user to Explore to add their first topic.
- **Stretch (not v1 requirement)**: Streak counter, review history chart.

## 4. Data Model

All data is stored as nodes + properties in the existing Nxus node architecture. The recall service layer in `@nxus/db` assembles these into typesafe objects. The app never interacts with raw nodes.

### 4.1 System Nodes (Bootstrap)

**Supertags:**
- `supertag:recall-topic`
- `supertag:recall-concept`
- `supertag:recall-review-log`

**Fields:**
- `field:recall-summary` — Concept summary text
- `field:recall-why-it-matters` — Why the concept is important
- `field:recall-blooms-level` — Bloom's taxonomy level (remember/understand/apply/analyze/evaluate/create)
- `field:recall-source` — Source reference (optional)
- `field:recall-related-concepts` — Links to related concept node IDs
- `field:recall-due` — ISO date string for next review
- `field:recall-stability` — FSRS stability parameter
- `field:recall-difficulty` — FSRS difficulty parameter
- `field:recall-elapsed-days` — FSRS elapsed days
- `field:recall-scheduled-days` — FSRS scheduled days
- `field:recall-reps` — FSRS repetition count
- `field:recall-lapses` — FSRS lapse count
- `field:recall-state` — FSRS card state (0=New, 1=Learning, 2=Review, 3=Relearning)
- `field:recall-last-review` — ISO date string of last review
- `field:recall-question-text` — Generated question text (review log)
- `field:recall-question-type` — Question type (review log)
- `field:recall-user-answer` — User's answer text (review log)
- `field:recall-ai-feedback` — AI evaluation feedback (review log)
- `field:recall-rating` — FSRS rating given (1=Again, 2=Hard, 3=Good, 4=Easy)

### 4.2 Assembled Types (App-facing)

```typescript
RecallTopic {
  id: string
  name: string
  description?: string
  conceptCount: number     // computed from query
  dueCount: number         // computed from query
}

RecallConcept {
  id: string
  topicId: string
  topicName: string
  title: string
  summary: string
  whyItMatters: string
  bloomsLevel: BloomsLevel
  source?: string
  relatedConceptIds: string[]
  relatedConceptTitles: string[]
  card: RecallCard          // always present (created with concept)
}

RecallCard {
  due: string               // ISO date
  state: FsrsState          // New | Learning | Review | Relearning
  reps: number
  lapses: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  lastReview?: string       // ISO date
}

ReviewLog {
  id: string
  conceptId: string
  questionText: string
  questionType: string
  userAnswer: string
  aiFeedback: string
  rating: FsrsRating        // Again | Hard | Good | Easy
  reviewedAt: string        // ISO date
}
```

## 5. AI Integration

### 5.1 Architecture

Use the **Anthropic SDK** (`@anthropic-ai/sdk`) directly with Zod-validated structured outputs. Wrap it behind a **facade/abstraction layer** so the provider can be swapped later (e.g., to Mastra or another framework).

API key source: `ANTHROPIC_API_KEY` environment variable.

The AI facade lives in a new library: `libs/nxus-recall/` (or within the app's server layer — to be decided in tech spec). It exposes three operations:

### 5.2 AI Operations

**Concept Generation**
- Input: topic name, optional context
- Output: Array of 5-8 `GeneratedConcept` objects (title, summary, whyItMatters, bloomsLevel, relatedConceptTitles)
- Batch response (not streaming). Client animates reveal.

**Question Generation**
- Input: concept (title, summary, bloomsLevel), related concepts (titles + summaries)
- Output: A single question object (questionText, questionType, expectedAnswer)
- Must target a Bloom's level equal to or higher than the concept's own level
- Question types: application scenario, comparison, analysis, synthesis, evaluation

**Answer Evaluation**
- Input: question, expected answer, user's answer, concept context
- Output: Evaluation object (feedback text, suggestedRating: Again/Hard/Good/Easy)
- Feedback should be constructive and specific, not just "correct/incorrect"

### 5.3 Structured Output

All AI responses use Zod schemas for validation. If the AI returns malformed output, retry once, then return an error to the user.

## 6. Spaced Repetition (FSRS)

Use the `ts-fsrs` library for scheduling. The app does NOT implement FSRS from scratch.

- When a concept is saved, create a card with default FSRS parameters (state=New, due=now).
- When a user rates a review, call `ts-fsrs` to compute the next scheduling state.
- Store the full FSRS state on the concept's properties (due, stability, difficulty, reps, lapses, state, elapsedDays, scheduledDays, lastReview).
- Rating buttons in the review UI should display the projected next-review date for each rating option (computed via `ts-fsrs` preview).

## 7. App Architecture

### 7.1 Mini-App Setup

- **Package**: `@nxus/recall-app`
- **Port**: 3004
- **Base path**: `/recall/`
- **Tech**: Vite + TanStack Start + Nitro (same stack as calendar/workbench)
- **Gateway**: Register in proxy config and mini-apps manifest

### 7.2 Route Structure

| Route | Purpose |
|-------|---------|
| `/recall/` | Dashboard — due count, topic grid, start review |
| `/recall/explore` | Topic search + AI concept generation |
| `/recall/topics/$topicId` | Topic detail with concept list |
| `/recall/review/session` | Active review session |

Note: Manual concept creation is a **modal/dialog** within the topic detail page, not a separate route.

### 7.3 Library

Whether to create a separate `libs/nxus-recall/` library or keep components/hooks in the app directly is a tech spec decision. The AI facade should be server-only code regardless.

## 8. UI/UX Notes

- Use existing `@nxus/ui` components (Card, Button, Dialog, Input, Textarea, Select, Badge, etc.).
- Follow the existing theme system (tokyonight + other themes from nxus-core).
- Concept cards in Explore should have a clean, animated reveal (staggered fade-in or slide-up).
- Review session should feel focused — minimal chrome, progress indicator (e.g., "3 of 12"), clear phase transitions (question -> answer -> feedback -> rate).
- Rating buttons should be color-coded (Again=red, Hard=orange, Good=green, Easy=blue) with interval preview text.
- Responsive but desktop-first (matching other Nxus apps).

## 9. Scope Boundaries

### In scope (v1)
- Topic and concept management (AI-generated + manual)
- FSRS-based spaced repetition scheduling
- AI question generation and answer evaluation
- Review session flow
- Dashboard with due counts and topic overview
- Gateway integration

### Out of scope (v1)
- Streak tracking / gamification
- Review history charts / analytics
- Import/export of decks
- Multi-user support
- Real streaming (batch + animated reveal is sufficient)
- Concept editing (can add in a follow-up)
- Topic deletion with cascade

## 10. Assumptions

1. The `ts-fsrs` library works well in a server-side context with TanStack Start's `createServerFn`.
2. The Anthropic SDK structured output (tool use with Zod schemas) is sufficient — no need for Mastra's agent framework in v1.
3. Personal scale (~10k cards max) means querying due cards by scanning properties is performant enough — no need for a separate index.
4. The existing node/property architecture in `@nxus/db` can handle the recall data model without schema changes to the underlying SQLite tables.
5. Topics are auto-created when concepts are saved from the Explore flow (no separate "create topic" form needed).
