/**
 * formula-application.ts — the backend-agnostic half of formula fields.
 *
 * Evaluating a formula field is pure math over an already-assembled node's
 * property values (formula-evaluator.ts) — nothing SQLite-specific. Only
 * DISCOVERING which fields are formulas (walking the node's supertag field
 * definitions for `field:field_type == 'formula'` + the `field:formula`
 * expression) is backend-shaped. So each backend supplies the resolved
 * `FormulaFieldSpec[]`; this function applies them identically.
 *
 * This closes DRIFT: graph-formula-evaluation (spec/tech/persistence.md) —
 * formula fields used to compute only in the SQLite assembly path.
 */

import type { AssembledNode, PropertyValue } from '../types/node.js'
import type { FieldContentName } from '../schemas/node-schema.js'
import type { JsonValue } from '../types/common.js'
import { evaluateFormulaExpression } from './formula-evaluator.js'

export interface FormulaFieldSpec {
  fieldSystemId: string | null
  fieldNodeId: string
  fieldName: string
  expression: string
}

/**
 * Mutate `assembled.properties` in place, computing each formula field from
 * the node's non-formula property values. Idempotent: overwrites any prior
 * value for the formula field. No-op when `specs` is empty.
 */
export function applyFormulaFieldsToAssembled(
  assembled: AssembledNode,
  specs: FormulaFieldSpec[],
): void {
  if (specs.length === 0) return

  const formulaFieldNames = new Set(specs.map((s) => s.fieldName))
  const values = new Map<string, JsonValue>()
  for (const [fieldName, propValues] of Object.entries(assembled.properties)) {
    if (formulaFieldNames.has(fieldName)) continue
    const sorted = [...propValues].sort((a, b) => a.order - b.order)
    const first = sorted[0]
    if (first) values.set(fieldName, first.value)
  }

  for (const spec of specs) {
    const result = evaluateFormulaExpression(spec.expression, {
      values,
      formulaFieldNames,
    })
    const pv: PropertyValue = {
      value: result,
      rawValue: JSON.stringify(result),
      fieldNodeId: spec.fieldNodeId,
      fieldName: spec.fieldName,
      fieldSystemId: spec.fieldSystemId,
      order: 0,
    }
    assembled.properties[spec.fieldName as FieldContentName] = [pv]
  }
}
