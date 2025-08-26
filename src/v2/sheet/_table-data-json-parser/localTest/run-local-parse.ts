//로컬 테스트 코드
//실행 명령어
// -> ./node_modules/.bin/ts-node src/v2/sheet/_table-data-json-parser/localTest/run-local-parse.ts


import { mkdir, readFile, rm, writeFile, readdir } from 'fs/promises';
import { createHash } from 'crypto';
import { join } from 'path';

const ROOT = __dirname; // current folder
const INPUT_PATH = join(ROOT, 'testFile', 'testFile.json');
const OUTPUT_DIR = join(ROOT, 'resultFile');

async function ensureCleanDir(dir: string) {
  try {
    await mkdir(dir, { recursive: true });
    // remove existing files only (keep dir)
    const files = await readdir(dir).catch(() => []);
    await Promise.all(
      files.map((f) => rm(join(dir, f), { recursive: true, force: true }))
    );
  } catch {
    // ignore
  }
}

const hash = (val: unknown) =>
  createHash('sha256').update(JSON.stringify(val)).digest('hex');

async function main() {
  await ensureCleanDir(OUTPUT_DIR);

  const raw = await readFile(INPUT_PATH, 'utf-8');
  const json = JSON.parse(raw);

  if (!json || typeof json !== 'object') throw new Error('Invalid JSON');

  const sheets = (json as any).sheets ?? {};
  const remainder = { ...(json as any) };
  delete (remainder as any).sheets;

  const now = new Date().toISOString();
  const sheetEntries = Object.entries(sheets as Record<string, unknown>);

  // write remainder
  await writeFile(
    join(OUTPUT_DIR, 'remainder.json'),
    JSON.stringify({ savedAt: now, dataHash: hash(remainder), content: remainder }, null, 2),
    'utf-8'
  );

  // write each sheet
  for (const [name, content] of sheetEntries) {
    const filename = `sheet-${name.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
    await writeFile(
      join(OUTPUT_DIR, filename),
      JSON.stringify({ sheetName: name, savedAt: now, dataHash: hash(content), content }, null, 2),
      'utf-8'
    );
  }

  // minimal manifest
  await writeFile(
    join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        sheetsSaved: sheetEntries.length,
        sheetNames: sheetEntries.map(([n]) => n),
        remainderHash: hash(remainder),
        savedAt: now,
        inputPath: INPUT_PATH,
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log(`Parsing complete. Output -> ${OUTPUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
