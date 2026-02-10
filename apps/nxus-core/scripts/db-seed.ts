/**
 * db-seed.ts - Unified seed script for all architecture modes
 *
 * Usage: pnpm db:seed
 *
 * Automatically detects the current architecture mode and seeds appropriately:
 * - 'node': Seeds node-based tables (nodes, nodeProperties)
 * - 'graph': Seeds graph database (SurrealDB)
 */

import { bootstrapSystemNodes } from '@nxus/db/server'
import {
  ARCHITECTURE_TYPE,
  isGraphArchitecture,
} from '../src/config/feature-flags'

async function seed() {
  console.log(`\n[Architecture] Mode: ${ARCHITECTURE_TYPE}\n`)

  if (isGraphArchitecture()) {
    // Graph architecture: seed SurrealDB via embedded surrealkv://
    const { seedGraph } = await import('./seed-graph')
    await seedGraph()
  } else {
    // Node architecture (default)
    const { seedNodes } = await import('./seed-nodes')

    // Bootstrap system nodes first (supertags, fields)
    console.log('='.repeat(50))
    console.log('  Bootstrap: Creating System Schema')
    console.log('='.repeat(50) + '\n')
    const result = await bootstrapSystemNodes({ verbose: true })
    if (result.alreadyBootstrapped) {
      console.log('System schema already exists, proceeding to seed...\n')
    }

    await seedNodes()
  }
}

seed().catch(console.error)
