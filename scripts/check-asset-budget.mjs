import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function parseArgs(argv) {
  const args = { dir: 'dist', limitMb: 15 };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dir') {
      args.dir = argv[i + 1];
      i += 1;
    } else if (token === '--limit-mb') {
      args.limitMb = Number(argv[i + 1]);
      i += 1;
    }
  }

  return args;
}

function walkFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

const { dir, limitMb } = parseArgs(process.argv.slice(2));
const limitBytes = Math.floor(limitMb * 1024 * 1024);
const compressedFiles = walkFiles(dir).filter((file) => file.endsWith('.gz') || file.endsWith('.br'));

const totalBytes = compressedFiles.reduce((sum, file) => sum + statSync(file).size, 0);

if (totalBytes > limitBytes) {
  console.error(
    `Asset budget exceeded: ${totalBytes} bytes > ${limitBytes} bytes (${limitMb} MB limit).`,
  );
  process.exit(1);
}

console.log(`Asset budget OK: ${totalBytes} bytes <= ${limitBytes} bytes (${limitMb} MB limit).`);
