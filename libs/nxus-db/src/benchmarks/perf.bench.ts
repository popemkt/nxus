import { bench, describe } from 'vitest'
import {
  SYSTEM_FIELDS,
} from '../schemas/node-schema.js'
import {
  assembleNodes,
  createAssemblyCache,
  createNode,
  deleteNode,
  getDistinctPropertyValues,
  getFieldUsageStats,
  getSystemNode,
  restoreNode,
  setProperty,
} from '../services/node.service.js'
import { evaluateQuery } from '../services/query-evaluator.service.js'
import { exportSubtreeToTif } from '../services/tif/tif-export.js'
import { importTanaIntermediateFile } from '../services/tif/tif-import.js'
import type { QueryDefinition } from '../types/query.js'
import type { TanaIntermediateFile, TanaIntermediateNode } from '../services/tif/tif-types.js'
import { seedGraph, type SeededGraph } from './seed-graph.js'
import { readTreeBFS } from './tree-read.js'

const scale = Number.parseInt(process.env.NXUS_BENCH_N ?? '10000', 10)
const graph: SeededGraph = seedGraph({ nodeCount: scale })
const rootId = graph.rootIds[0]!
const textFieldSystemId = graph.fieldSystemIds[0]!
const textField = getSystemNode(graph.db, textFieldSystemId)
if (!textField) throw new Error(`missing benchmark field: ${textFieldSystemId}`)
const textFieldNodeId = textField.id
const sampleIds = (await readTreeBFS(graph.db, rootId, 2)).nodes.slice(0, 100).map((node) => node.id)
const mutationNodeId = sampleIds[sampleIds.length - 1] ?? rootId
const importDoc = makeImportDoc(1_000)
let cleanupDone = false
function cleanupBenchmarkGraph(): void {
  if (cleanupDone) return
  cleanupDone = true
  graph.cleanup()
}
process.once('exit', cleanupBenchmarkGraph)
console.info(
  `seeded ${graph.counts.outlineNodeCount} outline nodes in ${graph.counts.seedMs.toFixed(1)}ms at ${graph.dir}`,
)

function makeImportDoc(nodeCount: number): TanaIntermediateFile {
  const children: TanaIntermediateNode[] = []
  for (let index = 1; index < nodeCount; index++) {
    children.push({
      uid: `import-${index}`,
      name: `import node ${index}`,
      type: 'node',
      createdAt: 1_767_225_600_000 + index,
      editedAt: 1_767_225_600_000 + index,
    })
  }
  return {
    version: 'TanaIntermediateFile V0.1',
    summary: {
      leafNodes: nodeCount - 1,
      topLevelNodes: 1,
      totalNodes: nodeCount,
      calendarNodes: 0,
      fields: 0,
      brokenRefs: 0,
    },
    nodes: [{
      uid: 'import-root',
      name: 'import root',
      type: 'node',
      createdAt: 1_767_225_600_000,
      editedAt: 1_767_225_600_000,
      children,
    }],
  }
}

describe(`@nxus/db API performance (${scale.toLocaleString()} nodes)`, () => {
  bench('tree full read BFS from workspace root', async () => {
    await readTreeBFS(graph.db, rootId)
  }, { iterations: 5, warmupIterations: 1 })

  bench('tree depth-2 read BFS from workspace root', async () => {
    await readTreeBFS(graph.db, rootId, 2)
  }, { iterations: 20, warmupIterations: 2 })

  bench('assembleNodes batch 100 cold cache', () => {
    assembleNodes(graph.db, sampleIds, createAssemblyCache())
  }, { iterations: 20, warmupIterations: 2 })

  bench('assembleNodes batch 100 warm cache', () => {
    const cache = createAssemblyCache()
    assembleNodes(graph.db, sampleIds, cache)
    assembleNodes(graph.db, sampleIds, cache)
  }, { iterations: 20, warmupIterations: 2 })

  bench('query evaluator supertag filter', () => {
    evaluateQuery(graph.db, {
      filters: [{ type: 'supertag', supertagId: graph.supertagSystemIds[0]!, includeInherited: true }],
      limit: 500,
    })
  }, { iterations: 10, warmupIterations: 1 })

  bench('query evaluator supertag + field value', () => {
    evaluateQuery(graph.db, {
      filters: [
        { type: 'supertag', supertagId: graph.supertagSystemIds[0]!, includeInherited: true },
        { type: 'property', fieldId: textFieldSystemId, op: 'contains', value: 'value' },
      ],
      limit: 500,
    })
  }, { iterations: 10, warmupIterations: 1 })

  bench('query evaluator temporal relative today', () => {
    evaluateQuery(graph.db, {
      filters: [{
        type: 'temporal',
        field: 'createdAt',
        op: 'relative',
        relative: { kind: 'keyword', keyword: 'today' },
      }],
      limit: 500,
    } satisfies QueryDefinition)
  }, { iterations: 10, warmupIterations: 1 })

  bench('query evaluator content search', () => {
    evaluateQuery(graph.db, {
      filters: [{ type: 'content', query: 'needle', caseSensitive: false }],
      limit: 500,
    })
  }, { iterations: 10, warmupIterations: 1 })

  bench('mutation createNode leaf append', () => {
    const nodeId = createNode(graph.db, {
      content: 'bench mutation leaf',
      ownerId: rootId,
    })
    setProperty(graph.db, nodeId, SYSTEM_FIELDS.ORDER, Number.MAX_SAFE_INTEGER)
  }, { iterations: 20, warmupIterations: 2 })

  bench('mutation setProperty update', () => {
    setProperty(graph.db, mutationNodeId, textFieldSystemId, `updated-${performance.now()}`)
  }, { iterations: 20, warmupIterations: 2 })

  bench('mutation delete + restore cycle', () => {
    deleteNode(graph.db, mutationNodeId)
    restoreNode(graph.db, mutationNodeId)
  }, { iterations: 20, warmupIterations: 2 })

  bench('TIF export full workspace', () => {
    exportSubtreeToTif(graph.db, rootId)
  }, { iterations: 3, warmupIterations: 1 })

  bench('TIF import 1k-node document', () => {
    importTanaIntermediateFile(graph.db, importDoc, { ownerId: rootId })
  }, { iterations: 3, warmupIterations: 1 })

  bench('getFieldUsageStats', () => {
    getFieldUsageStats(graph.db, textFieldNodeId)
  }, { iterations: 20, warmupIterations: 2 })

  bench('getDistinctPropertyValues', () => {
    getDistinctPropertyValues(graph.db, textFieldNodeId)
  }, {
    iterations: 20,
    warmupIterations: 2,
    teardown: (_task: unknown, mode: 'warmup' | 'run') => {
      if (mode === 'run') cleanupBenchmarkGraph()
    },
  })
})
