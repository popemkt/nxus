import { initDatabase, getDatabase, saveDatabase } from '../src/db/client'
import { apps, tags, appTags } from '../src/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Sync app_tags junction table from app metadata
 * This script handles the new format where metadata.tags is {id, name}[]
 */
async function sync() {
  console.log('Starting tag sync...')
  await initDatabase()
  const db = getDatabase()

  // 1. Get all current tags
  const currentTags = await db.select().from(tags).all()
  const nameToId = new Map(currentTags.map((t) => [t.name.toLowerCase(), t.id]))
  console.log(`Found ${currentTags.length} tags in database`)

  // 2. Restore hierarchy (AI Provider child of AI)
  const aiTag = currentTags.find((t) => t.name.toLowerCase() === 'ai')
  const aiProviderTag = currentTags.find((t) =>
    t.name.toLowerCase().includes('ai provider'),
  )
  if (aiTag && aiProviderTag) {
    await db
      .update(tags)
      .set({ parentId: aiTag.id })
      .where(eq(tags.id, aiProviderTag.id))
    console.log(
      `Restored hierarchy: AI Provider (id: ${aiProviderTag.id}) -> AI (id: ${aiTag.id})`,
    )
  }

  // 3. Get all apps
  const allApps = await db.select().from(apps).all()
  console.log(`Found ${allApps.length} apps in database`)

  let junctionCount = 0
  let createdCount = 0

  for (const app of allApps) {
    if (!app.metadata) continue
    const metadata = JSON.parse(app.metadata)
    const appTagRefs = metadata.tags || []

    // Handle both old format (string[]) and new format ({id, name}[])
    for (const tagRef of appTagRefs) {
      let tagId: number | undefined
      let tagName: string

      if (typeof tagRef === 'string') {
        // Old format: slug string
        tagName = tagRef
          .split('-')
          .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ')
        tagId =
          nameToId.get(tagRef.toLowerCase()) ||
          nameToId.get(tagName.toLowerCase())
      } else if (tagRef && typeof tagRef === 'object') {
        // New format: {id, name}
        tagId = tagRef.id
        tagName = tagRef.name
      } else {
        continue
      }

      if (!tagId) {
        // Create missing tag
        try {
          const res = await db
            .insert(tags)
            .values({
              name: tagName,
              order: 0,
            })
            .returning({ id: tags.id })

          tagId = res[0].id
          nameToId.set(tagName.toLowerCase(), tagId)
          createdCount++
          console.log(`Created missing tag: ${tagName} (id: ${tagId})`)
        } catch (err) {
          console.error(`Failed to create tag ${tagName}:`, err)
          continue
        }
      }

      // Link in junction table
      try {
        await db.insert(appTags).values({
          appId: app.id,
          tagId: tagId,
        })
        junctionCount++
      } catch (err) {
        // Ignore duplicates
      }
    }
  }

  console.log(`Sync complete!`)
  console.log(`- Created ${createdCount} missing tags`)
  console.log(`- Added ${junctionCount} links in app_tags table`)

  saveDatabase()
  console.log('Database changes persisted ✅')
}

sync()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Sync failed:', err)
    process.exit(1)
  })
