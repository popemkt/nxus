# nxus-recall

Spaced repetition learning app built on the nxus node-based architecture. Generate concepts from any topic, then review them with adaptive questions powered by Bloom's taxonomy and FSRS scheduling.

## Architecture

```
apps/nxus-recall/          TanStack Start app (routes, server functions)
libs/nxus-db/              Node-based SQLite database (recall.service.ts)
libs/nxus-mastra/          AI agents (concept-generator, question-generator, answer-evaluator)
```

### Data Model (Node-Based)

Everything is a node with properties, following Tana's "everything is a node" philosophy.

| Supertag | Description |
|---|---|
| `#RecallTopic` | A learning topic (e.g., "Distributed Systems") |
| `#RecallConcept` | An atomic concept within a topic, with FSRS card state |
| `#RecallReviewLog` | A log entry for each review interaction |
| `#BloomLevel` | System nodes for Bloom's taxonomy levels (6 seeded nodes) |

**Key design decisions:**
- Bloom's levels are stored as **node references** (not strings) → `bloom:remember` through `bloom:create`
- Related concepts are stored as **`nodes` field type** (not title strings) → enables cross-linking
- Generated questions are **cached on concept nodes** as JSON → survives page refresh, enables prefetching

### AI Model Sizing

| Agent | Model | Rationale |
|---|---|---|
| Concept generation | `claude-sonnet-4-5-20250514` | Creative task, needs quality output for 5-8 structured concepts |
| Question generation | `claude-haiku-4-5-20251001` | Structured output, simple schema conformance |
| Answer evaluation | `claude-haiku-4-5-20251001` | Only used for free-response; MC/TF/fill-blank are deterministic |

All AI calls include **automatic retry with exponential backoff** (3 attempts, 1s/2s/4s base + jitter).

## Features

### Explore Page (`/explore`)
- Enter a topic → AI generates 5-8 structured learning concepts
- **Auto-saves** all concepts immediately after generation (no manual save step needed)
- Concepts are linked with related concept node references
- Remove unwanted concepts with the trash button (deletes from DB)

### Topic Detail Page (`/topics/$topicId`)
- View all concepts for a topic with Bloom's level badges and FSRS card state
- Related concept pills are **clickable** (scrolls to the concept card)
- Start a review session for due cards

### Review Session (`/review/session`)
- Loads due cards and generates questions based on Bloom's level
- **4 question types** via discriminated union schema:
  - Multiple Choice (remember/understand levels)
  - True/False (remember level)
  - Fill-in-the-Blank (understand/apply levels)
  - Free Response (apply+ levels)

**Performance optimizations:**
- **Deterministic evaluation**: MC, T/F, and fill-blank are evaluated client-side instantly — no AI round-trip
- **Question prefetching**: While answering card N, card N+1's question is pre-generated in the background
- **Question caching**: Generated questions are persisted on concept nodes — survives page refresh
- **Cached question cleanup**: Questions are cleared after review submission so fresh ones generate next time

**Keyboard shortcuts:**
- `Enter` — Submit answer (works in text inputs too)
- `1`/`2`/`3`/`4` — Rate card (Again/Hard/Good/Easy) in feedback phase

### Bloom's Taxonomy Progression
Each concept has a ceiling Bloom's level (set at generation). Learners start at `remember` and progress:
- **Good/Easy** rating → bump up one level (capped at ceiling)
- **Hard** rating → stay at current level
- **Again** rating → drop down one level (floor at `remember`)

The current Bloom's level determines which question types are generated:
```
remember    → MC, T/F
understand  → MC, fill-blank
apply       → free-response, fill-blank
analyze+    → free-response only
```

### FSRS Scheduling
Uses [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) for optimal review scheduling. After each review, interval preview shows projected next review date for each rating option.

## Server Functions

All server functions follow the pattern in `.claude/rules/codebase-rules.md`:
- Dynamic imports inside handlers to avoid bundling `better-sqlite3` into client
- Result type: `{ success: true; data } | { success: false; error: string }`
- Zod input validation

| Function | File | Purpose |
|---|---|---|
| `generateConceptsServerFn` | `generate-concepts.server.ts` | Generate concepts via AI |
| `saveConceptsBatchServerFn` | `concepts.server.ts` | Save batch + link related concepts |
| `generateQuestionServerFn` | `generate-question.server.ts` | Generate or retrieve cached question |
| `prefetchQuestionServerFn` | `generate-question.server.ts` | Pre-generate + cache (fire-and-forget) |
| `evaluateAnswerServerFn` | `evaluate-answer.server.ts` | AI evaluation (free-response only) |
| `submitReviewServerFn` | `review.server.ts` | FSRS update + Bloom's progression + clear cache |

## Development

```bash
# From repo root
pnpm nx dev nxus-recall

# Run mastra tests
cd libs/nxus-mastra && npx vitest run
```
