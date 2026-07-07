# Data Model — Nodes, Fields, Supertags, Queries

Invalidated by: product decisions about what a node is, how schema attaches to data, and what queries can express.

This is the core functional contract of nxus. Everything else in the product is a lens over this model. The spec below is stated in terms of *semantics*; SQLite is the current materialization (see [../tech/persistence.md](../tech/persistence.md) for tables, bootstrap mechanics, and modes). Reactive behavior (live queries, computed fields, automations) is specified in [../tech/reactivity.md](../tech/reactivity.md). Editor behavior over this model is in [editor.md](./editor.md).

## 1. Everything is a node

There is exactly ONE kind of entity: the **node**. Tasks, tools, inbox items, calendar events, saved queries, automations, field *definitions*, and supertag *definitions* are all nodes. What a node "is" is not encoded in its storage shape — it is determined entirely by its **properties**, specifically which supertags are assigned to it.

Consequences (normative):

- Any feature MUST be expressible as nodes + properties. Introducing a new entity kind means seeding a new supertag node, never a new storage shape.
- Schema is data. Renaming, extending, or querying schema uses the same operations as user content.
- The meta-model is self-hosting: the `#Supertag` supertag is itself tagged `#Supertag` (`libs/nxus-db/src/services/bootstrap.ts:239-247`). A reimplementation MUST reproduce this fixed point — it is what makes "list all supertags" an ordinary supertag query.

## 2. Node semantics

A node (`libs/nxus-db/src/schemas/node-schema.ts:15-36`) has:

| attribute | semantics |
|---|---|
| `id` | UUIDv7, immutable, globally unique. The ONLY stable identity of a node. Time-ordered by construction (creation order is recoverable from ids). |
| `content` | Primary display text. Mutable, nullable. MUST NOT be used as an identity or join key (see DRIFT: content-keyed assembled properties). |
| `contentPlain` | Lowercased copy of `content`, maintained on every content write (`node.service.ts:618,673`) for case-insensitive search. Derived — never authoritative. |
| `systemId` | Optional, unique, human-stable identifier for *system* nodes: `field:status`, `supertag:task`, `item:my-app`, `query:inbox-all`, `bloom:remember`. Application code MUST reference system nodes by `systemId`, never by UUID (UUIDs differ per database instance). |
| `ownerId` | Optional parent node id. Encodes the single containment hierarchy (the outline). A node has at most one owner; the owner relationship is what the editor renders as indentation. |
| `createdAt` / `updatedAt` | Timestamps, maintained by every write. |
| `deletedAt` | Soft-delete marker. Deletion sets `deletedAt` (`node.service.ts:692-708`); it never removes rows. |

**Soft-delete semantics (canonical)**: a node with `deletedAt != null` is invisible to ALL read paths — lookups, assembly, queries, backlinks — unless a caller explicitly opts into reading deleted nodes (e.g. for undelete/trash UI). Properties of a deleted node are retained so undelete restores it fully. See DRIFT: soft-delete-not-enforced-on-point-reads.

**systemId prefixes**: valid prefixes are `field:`, `supertag:`, `item:` (`VALID_SYSTEM_ID_PREFIXES`, node-schema.ts:451; `isSystemId()` :464 is the canonical discriminator between systemIds and UUIDs). Additional namespaced ids exist outside this list (`query:*` node-schema.ts:168-173, `bloom:*` :145-152); they are valid `systemId` values but are NOT recognized by `isSystemId()` — functions accepting "UUID or systemId" (e.g. `getFieldOrSupertagNode`, node.service.ts:92-108) only route `field:`/`supertag:`/`item:` to the systemId lookup.

## 3. Properties — one relation encodes everything

A **property** is a row `(nodeId, fieldNodeId, value, order)` (`node-schema.ts:52-73`). `fieldNodeId` is the UUID of a *field definition node*. `value` is a JSON-encoded scalar, UUID string, or array. `order` disambiguates multiple values of the same field on the same node.

This single relation encodes four distinct semantics, discriminated only by which field the property uses and how consumers interpret the value:

1. **Scalar field values** — `value` is JSON of a string/number/boolean/date-string/JSON blob, per the field's declared type (§4).
2. **Supertag assignment** — a property with field `field:supertag` whose `value` is the JSON-encoded UUID of a supertag node. A node MAY have multiple supertags (multiple rows, ordered). This is the *entire* typing mechanism: "node N is a #Task" ⇔ row `(N, <field:supertag node id>, JSON(<supertag:task node id>))`.
3. **Supertag inheritance** — one or more properties with field `field:extends` on a *supertag node*, each valued with a parent supertag's UUID. A supertag MAY extend multiple parents simultaneously; `extends` therefore forms a directed acyclic graph by intent, not a tree. A single parent is the degenerate one-row case and remains wire-compatible with existing data. Implementations MUST read all `field:extends` rows in property `order`, dedupe visited supertags, and treat a cycle as a truncated traversal rather than hanging (e.g. self-extension or `#A extends #B extends #A`). Bootstrap's `#Tool extends #Item` is the one-parent example (`bootstrap.ts:267-317`); the runtime read path is `getAncestorSupertags` (`node.service.ts:157-187`).
4. **Node references** — any field of type `node`/`nodes` whose value is a UUID (or UUIDs). **Backlinks are not stored**: the backlink set of node T is *defined* as all properties whose value references T's UUID, found by reverse lookup on the value (index at node-schema.ts:70). A reimplementation MUST preserve this "references are forward-only, backlinks are derived" rule.

**Write semantics (canonical)**:

- `setProperty(node, field, value, order=0)` — *replace* semantics at one `(node, field, order)` slot: updates the row if it exists, inserts otherwise (`node.service.ts:716-774`, upsert keyed at :730-738).
- `addPropertyValue(node, field, value)` — *append* semantics: inserts at `max(order)+1` (`node.service.ts:781-823`).
- `clearProperty(node, field)` — removes ALL values of that field (`node.service.ts:830-879`). Property rows are hard-deleted (properties have no soft delete; only nodes do).
- Single-valued fields MUST be written with `setProperty`; multi-valued fields with `addPropertyValue`/`clearProperty`. Callers MUST NOT use `setProperty` to mutate a multi-value field (see invariant I3).
- Every property write MUST emit a mutation event (`property:set` :765, `property:added` :815, `property:removed` :870) — the reactive layer depends on this (see [../tech/reactivity.md](../tech/reactivity.md)).

## 4. Meta-model — fields and supertags are nodes

**Field definition nodes** carry `systemId` prefix `field:` and are tagged `#Field` + `#System` at bootstrap (bootstrap.ts:583-588). A field's *type* is itself a property: `field:field_type` valued with one of the `FieldType` literals `text | number | boolean | date | select | instance | url | email | node | nodes | json | formula` (node-schema.ts:473-485). `node`/`nodes` mark reference fields (§3.4); `instance` means "options are nodes with the supertag named by `field:instance_supertag`".

**Formula fields** are derived scalar fields. A formula field definition node stores its expression in `field:formula`, a system field whose content name is `formula` and whose value is plain text seeded through the same `SYSTEM_FIELDS`/`FIELD_NAMES`/bootstrap parity contract as every other system field (`node-schema.ts:180-185,314-321`; `bootstrap.ts:214-219,262-269`; `bootstrap-parity.test.ts:1-64`). The expression is evaluated when a node is assembled, not persisted as a property on the instance node. The formula language is deterministic and intentionally tiny: number/string/boolean literals, same-node field references by display name in braces (`{Price}`), unary `!`, binary `* / % + - < <= > >= == != && ||`, and parentheses. `+` performs numeric addition when both operands are numbers and string concatenation when either operand is a string. Invalid expressions, unsupported operand types, missing references, division/modulo by zero, and references to other formula fields MUST yield a structured value `{ error: string }` as that field's assembled value; they MUST NOT crash assembly or silently produce an empty value.

**Supertag definition nodes** carry prefix `supertag:` and are tagged `#Supertag` + `#System` (user-created supertags are tagged `#Supertag` only). Bootstrap seeds ~19 system supertags (`SYSTEM_SUPERTAGS`, node-schema.ts:103-139) and ~110 system fields (`SYSTEM_FIELDS`, :180-303); the full seed list and its chicken-and-egg ordering (`field:supertag` must exist before anything can be tagged) live in [../tech/persistence.md](../tech/persistence.md).

**A supertag's own properties double as its instance schema**: a property `(supertagNode, fieldNode, JSON(null))` *declares* that instances of the supertag have that field with no default (bootstrap Step 4b, bootstrap.ts:597-721); a non-null value declares a default. `getSupertagFieldDefinitions` (node.service.ts:170-229) reads this, excluding only the meta fields `field:supertag`, `field:extends`, `field:field_type` (:193-197). Canonically, ONLY properties intended as instance schema should be interpreted this way; see invariant I7 for the current over-broad interpretation.

**Write keys vs read keys**: application code writes properties by `FieldSystemId` (`SYSTEM_FIELDS.*`, e.g. `'field:status'`) and reads assembled properties by `FieldContentName` (`FIELD_NAMES.*`, e.g. `'status'`) — branded string types enforce the separation at compile time (node-schema.ts:82-97). The two constant maps MUST stay key-for-key parallel with each other and with the bootstrap seed contents (invariant I5).

## 5. Assembly — the read model

The unit of read is the **AssembledNode** (`libs/nxus-db/src/types/node.ts:17-27`): the node's own attributes plus

- `properties: Record<FieldContentName, PropertyValue[]>` — all property rows grouped by field, each `PropertyValue` (:32-39) carrying the parsed `value`, `rawValue`, `fieldNodeId`, `fieldName`, `fieldSystemId`, and `order`;
- `supertags: {id, content, systemId}[]` — every `field:supertag` property resolved to its supertag node.

Assembly semantics (`assembleNode`, node.service.ts:292-387; batched 4-query variant `assembleNodes` :393-529 MUST be observationally identical):

- Values are JSON-parsed; unparseable values are kept as raw strings (:345-350).
- The grouping key is the field node's `content` (:343) — this is the mechanism behind DRIFT: content-keyed assembled properties. Canonically the grouping key MUST be a *stable* field identity.
- Multi-value reads (`getPropertyValues`, :995-1002) sort by `order`; single reads (`getProperty`, :980-987) return the first stored value.

**Inheritance merge** (`assembleNodeWithInheritance`, node.service.ts:683-729): for each of the node's supertags, traverse the `extends` DAG breadth-first from the child supertag's direct parents outward, reading each direct-parent list in property `order`. Each supertag is visited at most once; cycles truncate at the already-visited supertag. Field defaults are merged in deterministic first-declaration-wins order — the node's directly assigned supertag first, then ancestors in breadth-first discovery order — so own node values always win over any supertag default, the directly assigned/child supertag wins over ancestors, nearer parents win over farther ancestors, and earlier direct parents win same-field ties in a diamond. Fields declared with `null` default (pure declarations) contribute nothing to assembly — they exist for UI schema display only.

Formula fields declared by a node's supertags are the exception to the "null declarations contribute nothing" rule: when a declared field's `field:field_type` is `formula`, assembly MUST append one computed `PropertyValue` for that field using the expression stored on the field definition's `field:formula` property (`node.service.ts:535-619`). Formula declarations use the same DAG traversal and merge order as inherited defaults. The computed value participates in the same assembled `properties` map as stored values so all read surfaces see the same value. A formula field MUST read only stored, non-formula values on the same assembled node in the MVP; referencing a formula field is a cycle error even when the reference graph would be acyclic.

**Inheritance traversal depth**: ancestor and descendant traversals both follow the `extends` DAG up to 10 breadth-first levels with visited-set cycle protection (`getAncestorSupertags`, node.service.ts:157-187; `getNodeIdsBySupertagWithInheritance`, node.service.ts:1065-1117). The same effective depth and cycle semantics apply whether assembling inherited fields or expanding `includeInherited` supertag queries.

## 6. Query model

A **QueryDefinition** (`libs/nxus-db/src/types/query.ts:269-274`) is `{ filters[], sort?, limit (default 500) }`. Top-level filters are AND-combined. Filters are a discriminated union (:236-244):

| filter | semantics |
|---|---|
| `supertag` | node has the supertag; `includeInherited` (default true) also matches nodes tagged with supertags that `extends`-descend from it (:51-56) |
| `property` | compare a field's value with op ∈ `eq neq gt gte lt lte contains startsWith endsWith isEmpty isNotEmpty` (:20-33,63-69) |
| `path` | follow a chain of reference fields, compare the terminal field's value (`Hat.Color = "Red"`); unary emptiness ops allowed (:77-126) |
| `content` | substring search on node content, case-insensitive by default (:133-138) |
| `relation` | `childOf`/`ownedBy` (ownerId), `linksTo` (node references target), `linkedFrom` (backlinks) (:145-156) |
| `temporal` | `createdAt`/`updatedAt` within N days / before / after date (:163-174) |
| `hasField` | field presence, negatable (:181-186) |
| `and` / `or` / `not` | recursive logical composition (:195-211) |

**Evaluation semantics** (`services/query-evaluator.service.ts:73-112`): the candidate set starts as ALL non-deleted nodes (`getAllNonDeletedNodeIds` :1027-1035 — the only read path that enforces soft-delete today) and each filter narrows it; results are assembled, sorted, then limited. `totalCount` reflects the pre-limit match count. The full-scan strategy is an implementation choice, not contract — any evaluator producing the same result set is conforming (current O(N)-per-evaluation cost is noted in the repo map as a scaling risk, not a semantic drift).

**Saved queries are nodes**: a node tagged `supertag:query` with a `field:query_definition` property holding the `QueryDefinition` JSON, plus optional `field:query_sort`, `field:query_limit`, `field:query_result_cache`, `field:query_evaluated_at` (node-schema.ts:230-234; assembled shape `SavedQuerySchema`, query.ts:285-294). System queries (`query:inbox-*`) are seeded at bootstrap (bootstrap.ts:731-778). Because queries are nodes, they are themselves queryable, taggable, and owned — no separate query store may be introduced.

## 7. INVARIANTS

Each invariant is a testable claim. Status ✓ = holds in current code; ✗ = violated (paired DRIFT block follows in §8).

- **I1 — Property-key stability** ✗: Renaming a field node (changing its `content`) MUST NOT change how any consumer reads existing property values. *Test*: create field, set property, rename field node, re-assemble → `getProperty` with the original read key still returns the value. Currently fails (DRIFT: content-keyed assembled properties).
- **I2 — Soft-delete read semantics** ✗: For any node with `deletedAt != null`, `findNodeById`, `assembleNode`, backlink resolution, and query evaluation all exclude it by default. *Test*: create → delete → each read path returns null/omits the node. Currently only query evaluation passes (DRIFT: soft-delete-not-enforced-on-point-reads).
- **I3 — Set-vs-add semantics** ✗(edge): `setProperty` on a field with k existing values MUST either replace the whole value set or be rejected; it MUST NOT silently mutate only one row. *Test*: `addPropertyValue` ×3, then `setProperty` → resulting value set is exactly `{new value}` (or error). Currently `setProperty` overwrites only the `order=0` row and leaves orders 1..k−1 intact (node.service.ts:730-738) (DRIFT: setProperty-clobbers-order-0).
- **I4 — Inheritance symmetry** ✓: The supertag hierarchy depth and visited-set semantics honored when *assembling* inherited fields (ancestor DAG walk) and when *querying* by supertag with `includeInherited` (descendant DAG expansion) MUST be equal. *Test*: `#A ← extends ← #B ← extends ← #C`; tag node with `#C`; query for `#A` with inheritance → node matches, and the node's assembly inherits `#A`'s defaults. Diamond and cycle cases MUST visit each supertag once and must not hang.
- **I5 — FIELD_NAMES ↔ bootstrap parity** ✓: For every key K in `SYSTEM_FIELDS`, the bootstrapped field node's `content` MUST equal `FIELD_NAMES[K]`. Enforced by the loop test `libs/nxus-db/src/services/bootstrap-parity.test.ts`. Historically violated for `SUPERTAG`/`EXTENDS`/`FIELD_TYPE` (production field-type reads silently fell back to `'text'`); fixed by aligning the constants with the seeded content (commit 60d0741, node-schema.ts:317-319). The parity requirement only exists at all because assembly is content-keyed (DRIFT: content-keyed assembled properties).
- **I6 — Transaction boundaries** ✗: Multi-step logical writes (create-node-with-supertag; replace-all-supertags; multi-row reorder) MUST be atomic: either all rows are visible or none, and mutation events MUST be emitted only after the full write is durable. *Test*: force a failure between steps → no partial state persists; subscribe to the event bus → no event observes half-applied state. Currently no writes are wrapped in transactions and events emit mid-mutation (DRIFT: no-transactions).
- **I7 — Supertag schema vs supertag metadata** ✗: Only properties *declared as instance schema* on a supertag node may be inherited by instances; properties describing the supertag itself (e.g. its own `description`) MUST NOT leak into instances. Currently `getSupertagFieldDefinitions` treats every non-meta property as instance schema (node.service.ts:170-229) — there is no marker distinguishing the two. Closing this requires a product decision (explicit schema-declaration field vs. the current null-value convention).
- **I8 — systemId immutability & upsert stability** ✓(partial): Bootstrap is idempotent; re-running it MUST NOT duplicate nodes or properties (`upsertSystemNode` matches on systemId, bootstrap.ts:42-73; property upsert matches on node+field+value :78-107). Note: upsert never updates `content` of an existing node (:54-58), so a rename in the seed list silently does not propagate to existing DBs — this is what let the historical I5 violation persist across re-bootstraps; any seed-content rename requires a data migration.
- **I9 — Reference integrity is lazy** ✓: Dangling references (value UUID pointing at a missing or deleted node) are legal at the storage layer and MUST be tolerated by all readers (assembly skips unresolvable supertags, node.service.ts:376; malformed JSON values are skipped, :434-438). No cascade delete exists; deleting a node leaves inbound references pointing at a soft-deleted node.
- **I10 — Backlinks are derived, never stored** ✓: There is no backlink table or field; any backlink feature MUST compute from forward references (§3.4).

## 8. DRIFT register

DRIFT: content-keyed assembled properties
- canonical: `AssembledNode.properties` is keyed by a stable field identity (field `systemId`, falling back to field node UUID); display `content` is presentation-only.
- current: keyed by field node `content` with UUID fallback (`node.service.ts:343`, batch :489); read constants `FIELD_NAMES` mirror seeded content strings (node-schema.ts:313-438). Two fields with identical content collide into one bucket; renaming a field breaks every consumer's read key.
- impact: silent read breakage on field rename; cross-field value collision; forces the parallel `SYSTEM_FIELDS`/`FIELD_NAMES` constant maps to exist at all.
- closes: re-key assembly by `fieldSystemId ?? fieldNodeId`, migrate all `FIELD_NAMES` reads to `SYSTEM_FIELDS`, delete `FIELD_NAMES`; add I1 test.

DRIFT: soft-delete-not-enforced-on-point-reads
- canonical: invariant I2 — deleted nodes invisible to all reads by default.
- current: only the query evaluator filters `deletedAt` (query-evaluator.service.ts:1027-1035). `findNodeById` (node.service.ts:238-245), `assembleNode` (:292-296), `assembleNodes` (:400), supertag resolution, and backlink lookups all return soft-deleted nodes.
- impact: deleted nodes resurface via direct navigation, references, and inheritance; combined with the editor's cosmetic undo (see [../tech/editor-sync.md](../tech/editor-sync.md)) this produces user-visible zombie/ghost states.
- closes: default `deletedAt IS NULL` predicate in every read function with an explicit `{ includeDeleted: true }` escape hatch; I2 test per read path.

DRIFT: setProperty-clobbers-order-0
- canonical: invariant I3 — replace-whole-set or reject on multi-value fields.
- current: `setProperty` upserts on `(node, field, order)` (node.service.ts:730-738); against a field with 3 values it rewrites only the `order=0` row, leaving a hybrid value set that neither read semantics expects.
- impact: silent data corruption on any code path that calls `setProperty` against a `nodes`-typed field.
- closes: `setProperty` clears all rows for the field then writes one (in a transaction), or throws when >1 row exists; I3 test.

DRIFT: no-transactions
- canonical: invariant I6 — logical writes are atomic; events emitted post-commit.
- current: no write in `node.service.ts` uses a transaction. `createNode` + supertag assignment are separate statements (:607-655); `setNodeSupertags` is clear-then-loop-insert (:1087-1146); events emit synchronously between statements (e.g. `node:created` :627 fires before the supertag is attached), so automations/live queries can observe half-applied state.
- impact: crash mid-write leaves orphaned or half-tagged nodes; reactive consumers act on inconsistent snapshots; editor multi-step reorders can persist duplicate orders.
- closes: wrap each exported write in `db.transaction()`, buffer event emission until commit; I6 fault-injection test.
