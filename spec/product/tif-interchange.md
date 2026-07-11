# TIF Interchange — Tana Intermediate Format import/export

Invalidated by: changes to the node data model (§ [data-model.md](./data-model.md)) that affect how nodes, properties, supertags, or fields are written/read, or changes to what the TIF v0.1 JSON schema covers.

Implementation: `libs/nxus-db/src/services/tif/` (`tif-types.ts`, `tif-import.ts`, `tif-export.ts`).

## Scope

Supports the JSON wire format produced/consumed by `tanainc/tana-import-tools` (`TanaIntermediateFile V0.1`) only. **Tana Paste (the plain-text outline format) is NOT parsed** — only the structured JSON `TanaIntermediateFile` shape.

- `importTanaIntermediateFile(db, tif, options?)` — parses (Zod, fail-fast) and materializes a TIF file as real nodes in one transaction.
- `exportSubtreeToTif(db, rootNodeId | null)` — walks a node's subtree (or the whole root-level graph when `rootNodeId` is `null`) and assembles a TIF file.

## Import semantics

**Two-pass, one transaction.** Pass 1 creates every non-`type:'field'` TIF node depth-first (preserving TIF child order via `field:order`), building the `uid → new node id` map. `type:'field'` nodes are field-value carriers per TIF semantics — they never become outline nodes; they are deferred. Pass 2 (after the uid map is complete, so forward references anywhere in the file resolve) rewrites inline `[[uid]]` tokens to `[[node:<id>]]`, applies `refs[]` as additional mention tokens, sets type-specific properties, and materializes deferred field carriers as properties on their owner node. The whole import runs inside `withNodeMutationTransaction` — a thrown error (Zod rejection, or a duplicate `uid` detected mid-walk) leaves the database exactly as it was.

**uid remapping.** TIF `uid` strings are never reused as node ids — every imported node gets a fresh `uuidv7`. `field:mentions` (data-model.md §3.5) is re-derived automatically from the rewritten content, same as any other content write.

**Supertags/fields become real nodes**, tagged/typed the same way `bootstrap.ts` seeds system ones: a `TanaIntermediateSupertag` becomes a node tagged `#Supertag` with systemId `supertag:tif_<slug>`; a TIF attribute becomes a node tagged `#Field` with systemId `field:tif_<slug>` and `field:field_type` set from the dataType map below. Both are **reused across imports into the same database** (looked up by the deterministic systemId before creating) and disambiguated with a numeric suffix only for a genuine within-file slug collision between two differently-named attributes/supertags.

**dataType → FieldType**: `any→text`, `url→url`, `email→email`, `number→number`, `date→date`, `checkbox→boolean`. Field values are always written with `addPropertyValue` (never `setProperty`) — TIF fields can legitimately carry more than one value, and this sidesteps the known `setProperty`-clobbers-order-0 bug (data-model.md DRIFT register) entirely rather than trying to guess single- vs multi-valued up front.

**`viewType`** maps onto the existing engine field `field:view_as` (`list→outline`, `table→table`) instead of a redundant TIF-only field — this is the one TIF construct that plugs directly into an existing nxus concept.

**`description`** reuses `field:description`. Inline `[[uid]]` tokens inside it are rewritten the same as node content.

## Known limitations (design decisions where the spec was ambiguous)

- **`todoState` maps onto the engine's canonical checkbox field** `field:todo_state` (values `'todo'|'done'` verbatim — [data-model.md](data-model.md) todo-state section). Import writes it, export reads it back, and it is excluded from ordinary field-carrier export since TIF carries it as a dedicated property. (Closed 2026-07-11 — previously an engine-internal `field:tif_todo_state` marker.)
- **No calendar/day-node mechanism exists.** `base_type: 'day'` is a declared literal (`types/base-type.ts`) but nothing in the engine creates or looks up day nodes from a date. `type:'date'` TIF nodes are imported as plain nodes — the date text is the node's `content` (no separate date-value property is needed since content already carries it) — with a marker property `field:tif_node_type = 'date'` so export can reconstruct the TIF `type`. Same marker mechanism covers `image` (`field:tif_media_url`) and `codeblock` (`field:tif_code_language`); `type:'node'` (the overwhelming common case) gets no marker at all.
- **Value nodes under a `type:'field'` carrier are not separately addressable.** They collapse straight into a property value and are never added to the uid map. If some other node's `refs`/inline mention points at a field-value's uid, it is counted as `brokenRefs`, not resolved. Tana rarely cross-references field-value nodes directly, so this is a deliberate scope cut, not an oversight.
- **`homeNodeIds` is accepted (schema-valid) but not modeled.** nxus has no "home"/workspace-root concept distinct from ordinary containment (`ownerId`), so these ids are silently ignored rather than invented into a new structure.
- **`refs[]` is merged into content as trailing inline reference tokens on import**, per the "Unified Plane" principle that a node's references are one relation, not two — there is no separate DB-level representation of "hard" vs "inline" refs. Export reconstructs `refs[]` from whatever `field:mentions` resolves to (which by construction is now the union of both).
- **Re-import into the *same* database is not idempotent for ordinary content nodes** (each run mints fresh node ids and fresh `field:order` values under the target owner) — only supertag/field *definition* nodes are deduplicated by systemId. Running the same TIF file twice under the same owner therefore duplicates the outline content, by design (matches "import" semantics, not "sync").
- Sibling order assigned during import restarts at `0` for each parent scope; importing into a container that already has children does not append after them — this is fine for the primary use case (importing into a fresh subtree) but would need continuation logic for incremental imports into a populated outline.

## Export semantics

- The exported TIF `uid` for every node/supertag **is the node's real database id** — no separate id scheme to keep in sync, and it's what makes `[[node:<id>]] → [[<id>]]` a straight prefix-strip rather than a remap.
- Ordinary field values (anything not an engine-internal/TIF-marker field) are re-emitted as synthetic `type:'field'` carrier children — the exact inverse of the deferred-field import pass.
- `summary.fields` counts field-carrier *applications* (one per field-with-value(s) per node), not distinct attribute names; `summary.totalNodes` counts every emitted `TanaIntermediateNode` object including field carriers and their value children. These are internally consistent, not a guaranteed byte-for-byte match to Tana's own proprietary counting rules (which aren't published beyond the type declarations).
- `brokenRefs` in an export counts `field:mentions` entries that no longer resolve to a live node (dangling references are legal and tolerated per data-model.md invariant I9).

## Round-trip guarantee

Import → export → re-import into a fresh database → export again produces the same node/field/supertag/type/todoState/viewType/flags shape (uids necessarily differ — see `libs/nxus-db/src/services/tif/tif.test.ts`, the round-trip test). Timestamps (`createdAt`/`editedAt`) are also round-trip stable: import overwrites the row's `createdAt`/`updatedAt` with the TIF file's own values rather than "now", so a re-export reports the original timestamps, not import time.
