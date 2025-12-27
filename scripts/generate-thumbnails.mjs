#!/usr/bin/env node

/**
 * Thumbnail Generator CLI
 *
 * A command-line tool to generate thumbnails for all apps in the registry
 * that don't have thumbnails yet.
 *
 * Usage:
 *   npm run generate-thumbnails
 *   npm run generate-thumbnails -- --force  # Regenerate all thumbnails
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const args = process.argv.slice(2);
const forceRegenerate = args.includes('--force');

async function main() {
  console.log('🎨 Thumbnail Generator for nXus');
  console.log('================================\n');

  // Read the app registry
  const registryPath = resolve(
    process.cwd(),
    'packages/nxus-core/src/data/app-registry.json',
  );
  const registryContent = await readFile(registryPath, 'utf-8');
  const registry = JSON.parse(registryContent);

  const apps = registry.apps;
  console.log(`Found ${apps.length} apps in registry\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const app of apps) {
    const appName = app.name;
    const hasThumbnail = app.thumbnail && !forceRegenerate;

    if (hasThumbnail) {
      console.log(`⏭️  ${appName}: Already has thumbnail, skipping`);
      skipped++;
      continue;
    }

    console.log(`🖼️  Generating thumbnail for: ${appName}`);

    try {
      // Sanitize description for shell safety
      const safeDescription = app.description
        .replace(/[()]/g, '')
        .replace(/"/g, '')
        .replace(/'/g, '');

      // Build the prompt
      const prompt = `Generate SVG image for app ${appName}. ${safeDescription}. Style: Modern vibrant colors, simple iconic design, 800x450 aspect ratio, no text labels.`;

      const thumbnailFilename = `${app.id}.svg`;
      const thumbnailsDir = resolve(
        process.cwd(),
        'packages/nxus-core/public/thumbnails',
      );

      // Create thumbnails directory if it doesn't exist
      await execAsync(`mkdir -p ${thumbnailsDir}`);

      // Call Gemini CLI with -y (auto-approve) and positional prompt
      const geminiCommand = `gemini -y "${prompt} Save it as SVG file named ${thumbnailFilename} in directory ${thumbnailsDir}."`;

      console.log(`   Calling Gemini CLI...`);
      const { stdout, stderr } = await execAsync(geminiCommand, {
        timeout: 120000,
        env: {
          ...process.env,
          GEMINI_APPROVAL_MODE: 'yolo',
        },
      });

      if (stderr && !stderr.includes('Saved')) {
        console.error(`   ⚠️  Warning: ${stderr}`);
      }

      // Update the app registry with the new thumbnail path
      app.thumbnail = `/thumbnails/${thumbnailFilename}`;

      console.log(`   ✅ Generated: /thumbnails/${thumbnailFilename}\n`);
      generated++;
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}\n`);
      failed++;
    }
  }

  // Write the updated registry back
  if (generated > 0) {
    await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
    console.log('\n📝 Updated app-registry.json with new thumbnail paths');
  }

  // Summary
  console.log('\n================================');
  console.log('📊 Summary:');
  console.log(`   ✅ Generated: ${generated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('================================\n');
}

main().catch(console.error);
