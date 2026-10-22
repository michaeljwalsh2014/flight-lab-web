export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const SAVE_ERROR_EVENT = "flight-lab-save-error";
export function reportSaveError(message = "Your changes could not be saved. Keep this page open and download a backup before trying again.") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SAVE_ERROR_EVENT, { detail: message }));
}
export function readRecords<T>(storage: Pick<Storage, "getItem">, key: string): T[] {
  const value: unknown = JSON.parse(storage.getItem(key) ?? "[]");
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || !Number.isSafeInteger(item.id) || item.id <= 0 ||
    (key === "flight-lab-v2-planes" ? typeof item.name !== "string" : !Number.isSafeInteger(item.planeId) || typeof item.distance !== "number" || !Number.isFinite(item.distance) || item.distance <= 0))) {
    throw new Error("Saved records could not be read. They have been preserved; restore a backup before editing.");
  }
  return value as T[];
}
/** Restore original values of successful writes if any later write fails. */
export function writeAtomically(storage: StorageLike, writes: Record<string, string>) {
  const previous = new Map(Object.keys(writes).map(key => [key, storage.getItem(key)]));
  const written: string[] = [];
  try {
    for (const [key, value] of Object.entries(writes)) { storage.setItem(key, value); written.push(key); }
  } catch {
    try {
      for (const key of written.reverse()) {
        const value = previous.get(key)!;
        if (value === null) storage.removeItem(key); else storage.setItem(key, value);
      }
    } catch { throw new Error("Saving and recovery could not finish. Keep this page open and download a backup."); }
    throw new Error("Changes were not saved. Your previous records were kept. Download a backup or free browser storage, then retry.");
  }
}
export function saveValue(key: string, value: string) {
  try { window.localStorage.setItem(key, value); return true; }
  catch { reportSaveError(); return false; }
}
export function readValue(key: string) {
  try { return window.localStorage.getItem(key); }
  catch { reportSaveError("Browser storage is unavailable. Changes in this session may not survive a reload."); return null; }
}
