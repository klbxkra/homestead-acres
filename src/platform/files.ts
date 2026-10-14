/** Saving and opening files from the browser (save export/import). */

export function downloadTextFile(filename: string, text: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** File name safe on Windows, macOS, Android and iOS. */
export function safeFileName(name: string, fallback = 'farm'): string {
  const cleaned = [...name]
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && !'\\/:*?"<>|'.includes(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('That file is too large to be a farm save.');
  return file.text();
}
