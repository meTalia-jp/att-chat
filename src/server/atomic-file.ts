import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function writeFileAtomically(path: string, data: string, replace = rename) {
  await mkdir(dirname(path), { recursive:true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(data, 'utf8'); await file.sync(); } finally { await file.close(); }
    await replace(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
}
