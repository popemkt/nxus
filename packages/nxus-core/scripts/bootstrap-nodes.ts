/**
 * bootstrap-nodes.ts - Insert foundational nodes for node-based architecture
 *
 * Usage: npx tsx scripts/bootstrap-nodes.ts
 *
 * Creates the meta-supertags, system supertags, and field definitions.
 * Uses simplified 2-table schema: nodes + node_properties.
 * Supertags are assigned via field:supertag property values.
 *
 * NOTE: This script is a thin wrapper around @nxus/db's bootstrapSystemNodes.
 * The core bootstrap logic lives in @nxus/db to be shared across mini-apps.
 */

import { bootstrapSystemNodes } from '@nxus/db/server'

async function bootstrap() {
  const result = await bootstrapSystemNodes({ verbose: true })

  if (result.alreadyBootstrapped) {
    console.log('\nSystem was already bootstrapped.')
  }

  console.log(`\nFinal counts: ${result.nodeCount} nodes, ${result.propertyCount} properties`)
}

bootstrap().catch(console.error)
