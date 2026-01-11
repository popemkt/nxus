import { initDatabase, getDatabase } from '../src/db/client'
import { apps, tags, appTags } from '../src/db/schema'
import { eq } from 'drizzle-orm'

async function sync() {
  console.log('Starting tag sync...')
  await initDatabase()
  const db = getDatabase()

  // 1. Get all current tags
  const currentTags = await db.select().from(tags).all()
  const slugToId = new Map(currentTags.map((t) => [t.slug, t.id]))
  console.log(`Found ${currentTags.length} tags in database`)

  // 2. Restore hierarchy (AI Provider child of AI)
  const aiTag = currentTags.find((t) => t.slug === 'ai')
  const aiProviderTag = currentTags.find((t) => t.slug === 'ai-provider')
  if (aiTag && aiProviderTag) {
    await db
      .update(tags)
      .set({ parentId: aiTag.id })
      .where(eq(tags.id, aiProviderTag.id))
    console.log(
      `Restored hierarchy: ai-provider (id: ${aiProviderTag.id}) -> ai (id: ${aiTag.id})`,
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
    const appTagSlugs = metadata.tags || []

    for (const slug of appTagSlugs) {
      if (!slug) continue

      let tagId = slugToId.get(slug)

      if (!tagId) {
        // Create missing tag
        const name = slug
          .split('-')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ')

        try {
          const res = await db
            .insert(tags)
            .values({
              slug,
              name,
              order: 0,
            })
            .returning({ id: tags.id })

          tagId = res[0].id
          slugToId.set(slug, tagId)
          createdCount++
          console.log(`Created missing tag: ${slug} (id: ${tagId})`)
        } catch (err) {
          console.error(`Failed to create tag ${slug}:`, err)
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
