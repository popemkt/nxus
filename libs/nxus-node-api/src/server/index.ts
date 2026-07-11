/**
 * @nxus/workbench - Server exports
 *
 * TanStack Server functions for node workbench operations.
 */

// Node server functions (generic CRUD)
export {
  getNodeServerFn,
  getNodesBySupertagServerFn,
  updateNodeContentServerFn,
  createNodeServerFn,
  deleteNodeServerFn,
  setNodePropertiesServerFn,
} from './nodes.server.js'

// Search server functions
export {
  searchNodesServerFn,
  getSupertagsServerFn,
  getAllNodesServerFn,
  getBacklinksServerFn,
  getOwnerChainServerFn,
  getChildNodesServerFn,
} from './search-nodes.server.js'

// Query server functions
export {
  evaluateQueryServerFn,
  createQueryServerFn,
  updateQueryServerFn,
  deleteQueryServerFn,
  getSavedQueriesServerFn,
  executeSavedQueryServerFn,
  getQuerySupertagsServerFn,
  getQueryFieldsServerFn,
} from './query.server.js'

export {
  createNode,
  createOutlineNode,
  deleteNode,
  evaluateQuery,
  evaluateEditorQuery,
  exportSubtree,
  getAllNodes,
  getBacklinks,
  getChildNodes,
  getGroupedBacklinks,
  getOrCreateDayNode,
  getNode,
  getNodesBySupertag,
  getOwnerChain,
  getSupertags,
  importTif,
  searchNodes,
  setNodeProperties,
  swapOrder,
  updateNodeContent,
} from './operations.js'

export type {
  BacklinksResult,
  BacklinkGroup,
  BacklinkNodeSummary,
  BacklinkOriginKind,
  ChildNodesResult,
  CreateNodeInput,
  CreateOutlineNodeInput,
  CreateOutlineNodeResult,
  CreateNodeResult,
  EditorQueryResultNode,
  EvaluateEditorQueryResult,
  EvaluateQueryInput,
  EvaluateQueryResult,
  ExportSubtreeInput,
  GroupedBacklinksResult,
  GetAllNodesInput,
  GetOrCreateDayNodeInput,
  GetOrCreateDayNodeResult,
  GetNodeInput,
  GetNodesBySupertagInput,
  GetOwnerChainInput,
  GetOwnerChainResult,
  ImportTifInput,
  SearchNodesInput,
  SearchNodesResult,
  SetNodePropertiesInput,
  SetNodePropertiesResult,
  SwapOrderInput,
  SwapOrderResult,
  OutlineAppliedField,
  OutlineAppliedSupertag,
  SupertagsResult,
  UpdateNodeContentInput,
  UpdateNodeContentResult,
} from './operations.js'
