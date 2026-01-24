/**
 * db-seed.ts - Unified seed script for all architecture modes
 *
 * Usage: pnpm db:seed
 *
 * Automatically detects the current architecture mode and seeds appropriately:
 * - 'table': Seeds legacy relational tables (items, commands, tags, inbox)
 * - 'node': Seeds node-based tables (nodes, nodeProperties)
 * - 'graph': (Future) Seeds graph database
 */

import { bootstrapSystemNodes } from '@nxus/db/server'
import {
  ARCHITECTURE_TYPE,
  isNodeArchitecture,
  isTableArchitecture,
} from '../src/config/feature-flags'

async function seed() {
  console.log(`\n[Architecture] Mode: ${ARCHITECTURE_TYPE}\n`)

  if (isTableArchitecture()) {
    const { seedTables } = await import('./seed-tables')
    await seedTables()
  } else if (isNodeArchitecture()) {
    // For node architecture, seed both for backwards compatibility during migration
    // This ensures legacy tables stay in sync if needed
    const { seedTables } = await import('./seed-tables')
    const { seedNodes } = await import('./seed-nodes')

    // Bootstrap system nodes first (supertags, fields)
    console.log('='.repeat(50))
    console.log('  Bootstrap: Creating System Schema')
    console.log('='.repeat(50) + '\n')
    const result = await bootstrapSystemNodes({ verbose: true })
    if (result.alreadyBootstrapped) {
      console.log('System schema already exists, proceeding to seed...\n')
    }

    await seedTables()
    await seedNodes()
  } else {
    console.log(`⚠️  Architecture mode '${ARCHITECTURE_TYPE}' not yet supported`)
    process.exit(1)
  }
}

seed().catch(console.error)
