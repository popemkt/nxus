import { createNodeAction } from './actions/create-node.js'
import { exportSubtreeAction } from './actions/export-subtree.js'
import { getDayNodeAction } from './actions/get-day-node.js'
import { getTagSchemaAction } from './actions/get-tag-schema.js'
import { importTifAction } from './actions/import-tif.js'
import { listTagsAction } from './actions/list-tags.js'
import { readNodeAction } from './actions/read-node.js'
import { searchNodesAction } from './actions/search-nodes.js'
import { setFieldAction } from './actions/set-field.js'
import { tagNodeAction } from './actions/tag-node.js'
import { untagNodeAction } from './actions/untag-node.js'

export const nxusActions = [
  searchNodesAction,
  readNodeAction,
  createNodeAction,
  setFieldAction,
  tagNodeAction,
  untagNodeAction,
  listTagsAction,
  getTagSchemaAction,
  importTifAction,
  exportSubtreeAction,
  getDayNodeAction,
] as const

export type NxusActionName = (typeof nxusActions)[number]['name']

export function getAction(name: string): (typeof nxusActions)[number] | undefined {
  return nxusActions.find((action) => action.name === name)
}
