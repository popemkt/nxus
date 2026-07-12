import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CreateNodeOptions } from '../../libs/nxus-db/src/types/node.js'
import type { FieldSystemId } from '../../libs/nxus-db/src/schemas/node-schema.js'

export interface SeedBackend {
  createNode(options: CreateNodeOptions): Promise<string>
  addNodeSupertag(nodeId: string, supertagSystemId: string): Promise<boolean>
  setProperty(
    nodeId: string,
    fieldId: FieldSystemId,
    value: unknown,
    order?: number,
  ): Promise<void>
  addPropertyValue(
    nodeId: string,
    fieldId: FieldSystemId,
    value: unknown,
  ): Promise<void>
  /** Read-only: ids of nodes carrying any of the given supertags (seed-readiness polling). */
  getNodesBySupertags(supertagSystemIds: string[]): Promise<Array<{ id: string }>>
  SYSTEM_FIELDS: typeof import('../../libs/nxus-db/src/server.js')['SYSTEM_FIELDS']
  SYSTEM_SUPERTAGS: typeof import('../../libs/nxus-db/src/server.js')['SYSTEM_SUPERTAGS']
}

let backendPromise: Promise<SeedBackend> | undefined

async function retryTransient<T>(operation: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      return await operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (
        Date.now() >= deadline ||
        !/database is locked|SQLITE_BUSY|Transaction conflict|Write conflict/i.test(message)
      ) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}

/**
 * Opens the same backend used by the e2e app servers.
 *
 * Node mode keeps using the shared SQLite e2e file. Graph mode lets NodeFacade
 * honor SURREAL_EMBEDDED/SURREAL_URL, so all ids pass through SurrealBackend's
 * HTTP RecordID normalization instead of fixture-specific SurQL.
 */
export function openSeedBackend(): Promise<SeedBackend> {
  if (backendPromise) return backendPromise

  backendPromise = (async () => {
    process.env.NXUS_DB_PATH ??= join(tmpdir(), 'nxus-e2e.db')
    const mod = await import('../../libs/nxus-db/src/server.js')

    const initDeadline = Date.now() + 30_000
    for (;;) {
      try {
        await mod.nodeFacade.init()
        break
      } catch (error) {
        if (Date.now() >= initDeadline) throw error
        await new Promise((resolve) => setTimeout(resolve, 1_000))
      }
    }

    return {
      createNode: (options) => retryTransient(() => mod.nodeFacade.createNode(options)),
      addNodeSupertag: (nodeId, supertagSystemId) =>
        retryTransient(() => mod.nodeFacade.addNodeSupertag(nodeId, supertagSystemId)),
      setProperty: (nodeId, fieldId, value, order) =>
        retryTransient(() => mod.nodeFacade.setProperty(nodeId, fieldId, value, order)),
      addPropertyValue: (nodeId, fieldId, value) =>
        retryTransient(() => mod.nodeFacade.addPropertyValue(nodeId, fieldId, value)),
      getNodesBySupertags: (supertagSystemIds) =>
        retryTransient(() => mod.nodeFacade.getNodesBySupertags(supertagSystemIds)),
      SYSTEM_FIELDS: mod.SYSTEM_FIELDS,
      SYSTEM_SUPERTAGS: mod.SYSTEM_SUPERTAGS,
    }
  })()

  return backendPromise
}
