import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SRC = join(ROOT, 'src');

export function readSource(file) {
  return readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
}

export function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(file) : [file];
  });
}

export function sourcePath(file) {
  return relative(SRC, file).split(sep).join('/');
}
