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

    await seedTables()
    await seedNodes()
  } else {
    console.log(`⚠️  Architecture mode '${ARCHITECTURE_TYPE}' not yet supported`)
    process.exit(1)
  }
}

seed().catch(console.error)
