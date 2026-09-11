/*
 * Reads a File to bare base64 (no data: prefix).
 *
 * Deliberately not `btoa(String.fromCharCode(...new Uint8Array(buf)))`:
 * spreading a typed array passes one argument per byte, which overflows the
 * call stack on anything bigger than a thumbnail. FileReader has no such limit.
 */
export function fileToBase64(file: File): Promise<{ base64: string; mime: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve({
        base64: comma === -1 ? result : result.slice(comma + 1),
        mime: file.type || 'image/png',
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  });
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
