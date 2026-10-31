/**
 * The renderer side of the exe-harness image. The Image drawing tool opens the operating
 * system file chooser, which the exe harness cannot drive. In a gated harness run only (electron/image-harness.cjs decides in
 * the main process; this module never sees the environment), main hands over one SYNTHETIC PNG and arming Image imports it
 * through the same guarded path a chosen file takes. In every other run main answers null and nothing changes.
 */
export interface HarnessImage { schemaVersion: 1; synthetic: true; name: string; bytes: Uint8Array }
/** The harness image is tiny; anything larger, not a PNG, or not labelled synthetic is refused. */
export const HARNESS_IMAGE_MAX_BYTES = 64 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const NAME = /^LV-SYNTHETIC-[a-z-]{1,40}\.png$/;

export function validHarnessImage(value: unknown): value is HarnessImage {
  const row = value as HarnessImage | null;
  if (!row || typeof row !== 'object' || row.schemaVersion !== 1 || row.synthetic !== true || typeof row.name !== 'string' || !NAME.test(row.name)) return false;
  const bytes = row.bytes;
  return bytes instanceof Uint8Array && bytes.length > PNG_SIGNATURE.length && bytes.length <= HARNESS_IMAGE_MAX_BYTES && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

let injected: File | Blob | null = null;
/** Asks main once for the harness image. Any failure, a missing call or a null answer leaves the normal file chooser. */
export async function loadHarnessImage(bridge: unknown): Promise<boolean> {
  injected = null;
  const call = (bridge as { harnessImage?: () => Promise<{ ok: boolean; value?: unknown }> } | null | undefined)?.harnessImage;
  if (typeof call !== 'function') return false;
  try {
    const result = await call();
    if (!result || result.ok !== true || !validHarnessImage(result.value)) return false;
    const image = result.value, bytes = new Uint8Array(image.bytes);
    injected = typeof File === 'function' ? new File([bytes], image.name, { type: 'image/png' }) : new Blob([bytes], { type: 'image/png' });
    return true;
  } catch { return false; }
}
/** The harness image when this is a gated harness run, else null (the Image tool then opens the file chooser). */
export const harnessImageFile = (): Blob | null => injected;
/** Tests only: forget the loaded image. */
export function resetHarnessImage(): void { injected = null; }
