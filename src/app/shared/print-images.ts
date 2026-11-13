/** Captured PNG history is independent of print outcome. No reconstruction or
 * print operation exists in this read-only feature. URLs are transient blobs.
 */
export interface PrintImage {
  artifactId: string; localJobId: number; attempt: number; copyIndex: number; copyCount: number;
  reprintOfJobId: number | null; capturedAtUtc: string; widthMm: number; heightMm: number;
  dpiX: number; dpiY: number; pixelWidth: number; pixelHeight: number;
  templateCode: string; sha256: string; byteLength: number;
}
export interface PrintImagesResponse { items: PrintImage[]; nextCursor: string | null; state: 'available' | 'unavailable'; }

export function imageFailureMessage(status: number): string {
  if (status === 404) return 'Η εικόνα δεν είναι πλέον διαθέσιμη.';
  if (status === 401 || status === 403) return 'Δεν έχετε πρόσβαση σε αυτή την εικόνα.';
  if (status === 503) return 'Η αποθήκευση εικόνων δεν έχει ενεργοποιηθεί για αυτή τη σύνδεση.';
  return 'Η εικόνα δεν φορτώθηκε. Μπορείτε να δοκιμάσετε ξανά.';
}

export async function verifyImageBlob(blob: Blob, image: PrintImage): Promise<void> {
  if (blob.type !== 'image/png' || blob.size !== image.byteLength || blob.size > 1024 * 1024 || !/^[0-9a-f]{64}$/.test(image.sha256))
    throw new Error('image_content_mismatch');
  const bytes = await blob.arrayBuffer();
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => new Uint8Array(bytes)[index] === value)) throw new Error('image_content_mismatch');
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  if (sha !== image.sha256) throw new Error('image_content_mismatch');
}

export function mergeImages(current: PrintImage[], incoming: PrintImage[]): PrintImage[] {
  const byId = new Map(current.map(image => [image.artifactId, image]));
  for (const image of incoming) {
    const old = byId.get(image.artifactId);
    if (old && old.sha256 !== image.sha256) throw new Error('image_identity_conflict');
    byId.set(image.artifactId, image);
  }
  return [...byId.values()].sort((a, b) => a.attempt - b.attempt || a.copyIndex - b.copyIndex || a.artifactId.localeCompare(b.artifactId));
}
