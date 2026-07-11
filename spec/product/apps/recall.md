# nxus-recall — learning lens

Invalidated by: product decisions about spaced repetition, learning progression, and AI question generation.

Recall (port 3004, base `/recall`) is the **learning lens**: concepts stored as nodes in the graph ([../data-model.md](../data-model.md)) are reviewed on an FSRS spaced-repetition schedule, with AI-generated questions that climb Bloom's taxonomy as mastery grows.

## Shape

- `apps/nxus-recall` (30 files) is the thickest app — unlike calendar/workbench its UI was never lib-extracted (acceptable: no second consumer). Routes: `index` (dashboard), `review.session`, `review.cram`, `explore`, `import`, `topics.$topicId`, `concepts.$conceptId.history` (`src/routes/`).
- Domain data (topics, concepts, cards, review logs) lives in the node graph via `@nxus/db/server` dynamic imports (`src/services/concepts.server.ts:8-11`); node-side domain logic in `libs/nxus-db/src/services/recall.service.ts`.
- 8 server fns in `src/services/`: concepts, topics, review, extract/generate-concepts, generate-question, evaluate-answer, explain-further.

## Scheduling (FSRS)

- Review scheduling MUST use FSRS via `ts-fsrs`: on answer, the card's next state is computed by `fsrs()` from the user's 1-4 rating (`src/services/review.server.ts:94-97`, cram variant `:179-180`). Review flow state machine (question → answer → feedback → rating) lives in `src/hooks/use-review-engine.ts` (rating mutation `:275`, keyboard rating `:342-346`).

## Bloom's taxonomy progression

- Each concept card tracks a `currentBloomsLevel` ∈ remember/understand/apply/analyze/evaluate/create; levels are themselves nodes (`BLOOM_LEVEL_NODES` mapping, `recall.service.ts:50-56`).
- On a successful review, the level MAY advance via `nextBloomsLevel(current, ceiling, rating)` from the AI lib (`review.server.ts:115-118`) — progression is capped by a per-concept ceiling. Question generation MUST target the card's current Bloom level (`src/services/generate-question.server.ts:9-10`, `BloomsLevelSchema` from `@nxus/db`).

Behavior clauses (Bloom level storage; guarded by `libs/nxus-db/src/services/recall-blooms.test.ts`):

- **RECALL-B1** — Given a concept's Bloom's level saved via `saveConcept` (stored internally as the Bloom node's UUID), when the concept is read back via `getConceptById`, then `bloomsLevel` MUST resolve to the level label (e.g. `remember`/`understand`/…), never the raw stored node id.
- **RECALL-B2** — Given a stored `bloomsLevel` value that does not resolve to any known Bloom node, when the concept is read, then `bloomsLevel` MUST be `null` — the raw unresolvable value MUST NOT leak into the assembled concept.

## AI layer (`libs/nxus-mastra`)

- All generation/evaluation (concept extraction, question generation, answer evaluation, explain-further, Bloom progression) goes through `@nxus/mastra`: schema-first agents (`src/schemas/`, `src/agents/`) behind an `AiClient` facade exposing `generateStructured({schema, system, prompt, model?, effort?})` (`src/lib/ai-client.ts:25-29`; default model claude-haiku-4-5, `:19`).
- The facade exists so the provider is swappable (`ai-client.ts:7`); recall MUST NOT import a provider SDK directly.

DRIFT: @nxus/mastra is not Mastra
- canonical: package name and docs match the implementation.
- current: the package wraps `@anthropic-ai/claude-agent-sdk` (`libs/nxus-mastra/src/lib/ai-client.ts:5`), yet the name says Mastra and `src/server.ts:4` still claims agents "require @mastra/core". It also pins zod ^3 while recall/workbench use zod 4 (dual-zod bundling risk).
- impact: every reader/agent is misled about the AI dependency; docstring contradicts code.
- closes: rename (e.g. `@nxus/ai-agents`) or at minimum fix docstrings; align zod to v4.

## Hygiene notes

- `src/components/ui/skeleton.tsx` duplicates `Skeleton` already exported by `@nxus/ui` — use the shared one.
- Client-safe vs server split is respected: `@nxus/mastra` `index.ts` (schemas) vs `server.ts` (agents), consumed only server-side via dynamic import.
