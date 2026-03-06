import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const appRoot = path.resolve(scriptsDir, '..');
const appsDataDir = path.join(appRoot, 'src', 'data', 'apps');
const thumbnailsDir = path.join(appRoot, 'public', 'thumbnails');

const args = new Set(process.argv.slice(2));
const forceRegenerate = args.has('--force');
const showHelp = args.has('--help') || args.has('-h');

async function main() {
  if (showHelp) {
    console.log('Usage: pnpm generate-thumbnails [-- --force]');
    console.log('Generate missing SVG thumbnails for app manifests in nxus-core.');
    return;
  }

  console.log('Thumbnail Generator for Nxus Core');
  console.log('================================\n');

  const manifestPaths = await findManifestPaths(appsDataDir);
  console.log(`Found ${manifestPaths.length} app manifests\n`);

  await mkdir(thumbnailsDir, { recursive: true });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const manifestPath of manifestPaths) {
    const manifest = await readManifest(manifestPath);
    const hasThumbnail = Boolean(manifest.thumbnail) && !forceRegenerate;

    if (hasThumbnail) {
      console.log(`skip ${manifest.name}: already has thumbnail`);
      skipped += 1;
      continue;
    }

    console.log(`generate ${manifest.name}`);

    try {
      const thumbnailFilename = `${manifest.id}.svg`;
      const prompt = buildPrompt(manifest, thumbnailFilename);

      const { stderr } = await execFileAsync('gemini', ['-y', prompt], {
        timeout: 120_000,
        env: {
          ...process.env,
          GEMINI_APPROVAL_MODE: 'yolo',
        },
      });

      if (stderr && !stderr.includes('Saved')) {
        console.error(`warning ${manifest.name}: ${stderr}`);
      }

      manifest.thumbnail = `/thumbnails/${thumbnailFilename}`;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`, 'utf8');
      console.log(`ok ${manifest.thumbnail}\n`);
      generated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed ${manifest.name}: ${message}\n`);
      failed += 1;
    }
  }

  console.log('================================');
  console.log(`generated: ${generated}`);
  console.log(`skipped: ${skipped}`);
  console.log(`failed: ${failed}`);
}

async function findManifestPaths(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const manifestPaths = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(rootDir, entry.name, 'manifest.json');
    try {
      await readFile(manifestPath, 'utf8');
      manifestPaths.push(manifestPath);
    } catch {
      continue;
    }
  }

  return manifestPaths.sort();
}

async function readManifest(manifestPath) {
  const content = await readFile(manifestPath, 'utf8');
  return JSON.parse(content);
}

function buildPrompt(manifest, thumbnailFilename) {
  const safeDescription = manifest.description
    .replace(/[()]/g, '')
    .replace(/"/g, '')
    .replace(/'/g, '');

  return [
    `Generate SVG image for app ${manifest.name}. ${safeDescription}.`,
    'Style: Modern vibrant colors, simple iconic design, 800x450 aspect ratio, no text labels.',
    `Save it as SVG file named ${thumbnailFilename} in directory ${thumbnailsDir}.`,
  ].join(' ');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
