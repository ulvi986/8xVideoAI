import fs from 'node:fs';
import path from 'node:path';
import { put, del } from '@vercel/blob';
import { config } from './config.js';

/*
 * Where generated media goes.
 *
 * Two backends behind one function, chosen by whether a Blob token is
 * present. On Vercel the filesystem is ephemeral and per-invocation, so a
 * file written during generation would not exist by the time the browser
 * asked for it. Locally, disk is simpler than requiring a cloud account to
 * run the project.
 *
 * Both return an absolute-or-rooted URL that the client can use directly, so
 * nothing downstream knows which backend ran.
 */

export const usingBlob = () => Boolean(config.blobToken);

const CONTENT_TYPES = {
  mp4: 'video/mp4',
  png: 'image/png',
  jpg: 'image/jpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

export async function save(name, buffer) {
  const ext = name.split('.').pop() ?? 'bin';
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

  if (usingBlob()) {
    const blob = await put(`media/${name}`, buffer, {
      access: 'public',
      contentType,
      token: config.blobToken,
      // The name already carries a generation UUID; a second random suffix
      // would make the URL impossible to derive from the row.
      addRandomSuffix: false,
      // Output never changes once written.
      cacheControlMaxAge: 31536000,
    });
    return blob.url;
  }

  fs.mkdirSync(config.storageDir, { recursive: true });
  fs.writeFileSync(path.join(config.storageDir, name), buffer);
  return `/files/${name}`;
}

/* Best-effort: a generation row is deleted whether or not its bytes go. */
export async function remove(url) {
  if (!url) return;
  try {
    if (/^https?:\/\//.test(url)) {
      if (usingBlob()) await del(url, { token: config.blobToken });
      return;
    }
    fs.rmSync(path.join(config.storageDir, path.basename(url)), { force: true });
  } catch {
    /* the row still goes; an orphaned object is not worth failing a request */
  }
}
