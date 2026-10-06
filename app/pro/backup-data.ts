export const BACKUP_KEYS = [
  "flight-lab-v2-planes", "flight-lab-v2-throws", "flight-lab-v2-active-plane-id",
  "flight-lab-v3-height", "flight-lab-pro-stride", "flight-lab-pro-plane-reports-v1",
  "flight-lab-pro-coach-tests-v1", "flight-lab-pro-ai-context-v3",
  "flight-lab-coach-conversation", "flight-lab-coach-lessons", "flight-lab-coach-model",
  "flight-lab-coach-model-group", "flight-lab-coach-thinking-mode", "flight-lab-pro-interface-level",
] as const;
export type Backup = { format: "flight-lab-backup"; version: 1; createdAt: string; data: Record<string, string> };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const safeId = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
export function parseBackup(text: string): Backup {
  const value: unknown = JSON.parse(text);
  if (!record(value) || value.format !== "flight-lab-backup" || value.version !== 1 || typeof value.createdAt !== "string" || !record(value.data)) throw new Error("Choose a Flight Lab backup file.");
  const data: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value.data)) {
    if (!BACKUP_KEYS.includes(key as typeof BACKUP_KEYS[number]) || typeof raw !== "string") throw new Error("This backup contains an unsupported record.");
    if (key === "flight-lab-v2-planes" || key === "flight-lab-v2-throws") {
      const entries: unknown = JSON.parse(raw);
      if (!Array.isArray(entries) || entries.some((item) => !record(item) || !safeId(item.id) || (key.endsWith("planes") ? typeof item.name !== "string" || !item.name.trim() : !safeId(item.planeId) || typeof item.distance !== "number" || !Number.isFinite(item.distance) || item.distance <= 0))) throw new Error("The backup has invalid planes or throws. Nothing was restored.");
      if (entries.some((item) => (item.createdAt !== undefined && typeof item.createdAt !== "string") || (key.endsWith("planes") && ((item.image !== undefined && typeof item.image !== "string") || (item.preset !== undefined && !["dart", "glider", "custom"].includes(item.preset)))))) throw new Error("Invalid saved record details.");
      if (new Set(entries.map((item) => item.id)).size !== entries.length) throw new Error("This backup has duplicate record IDs.");
    }
    if (["flight-lab-pro-coach-tests-v1", "flight-lab-coach-conversation", "flight-lab-coach-lessons"].includes(key)) {
      const items: unknown = JSON.parse(raw);
      if (!Array.isArray(items) || items.some((item) => !record(item))) throw new Error("Invalid saved Coach records.");
      if (key.endsWith("tests-v1") && items.some((item) => typeof item.action !== "string" || typeof item.recommendationId !== "string" || !["better", "same", "worse"].includes(String(item.result)))) throw new Error("Invalid saved test results.");
      if (key.endsWith("conversation") && items.some((item) => typeof item.text !== "string" || !["user", "assistant"].includes(String(item.role)))) throw new Error("Invalid Coach conversation.");
      if (key.endsWith("lessons") && items.some((item) => typeof item.reason !== "string" || typeof item.cue !== "string" || typeof item.createdAt !== "number")) throw new Error("Invalid Coach feedback.");
    }
    if (["flight-lab-pro-plane-reports-v1", "flight-lab-pro-ai-context-v3"].includes(key) && !record(JSON.parse(raw))) throw new Error("Invalid saved analysis records.");
    data[key] = raw;
  }
  return { format: "flight-lab-backup", version: 1, createdAt: value.createdAt, data };
}
export function createBackup(storage: Pick<Storage, "getItem">): Backup {
  const data: Record<string, string> = {};
  for (const key of BACKUP_KEYS) { const raw = storage.getItem(key); if (raw !== null) data[key] = raw; }
  return { format: "flight-lab-backup", version: 1, createdAt: new Date().toISOString(), data };
}
/** Plan the entire merge before touching storage. Local values win conflicts. */
export function planRestore(backup: Backup, storage: Pick<Storage, "getItem">): Record<string, string> {
  const writes: Record<string, string> = {};
  for (const [key, incoming] of Object.entries(backup.data)) {
    const existing = storage.getItem(key);
    if (existing === null) { writes[key] = incoming; continue; }
    if (existing === incoming) continue;
    let local: unknown, saved: unknown;
    try { local = JSON.parse(existing); saved = JSON.parse(incoming); } catch { continue; }
    if (Array.isArray(local) && Array.isArray(saved)) {
      if (key === "flight-lab-v2-planes") {
        for (const plane of saved) {
          const same = local.find((item) => item.id === plane.id);
          if (same && (same.name !== plane.name || same.preset !== plane.preset || same.image !== plane.image)) throw new Error("A saved plane ID belongs to a different plane on this device. Restore in an empty browser profile to keep both planes safe.");
        }
      }
      const identity = (item: unknown) => record(item) && item.id !== undefined ? String(item.id) : JSON.stringify(item);
      const seen = new Set(local.map(identity));
      writes[key] = JSON.stringify([...local, ...saved.filter((item) => { const id = identity(item); if (seen.has(id)) return false; seen.add(id); return true; })]);
    } else if (record(local) && record(saved)) {
      writes[key] = JSON.stringify({ ...saved, ...local });
    }
  }
  const planes = JSON.parse(writes["flight-lab-v2-planes"] ?? storage.getItem("flight-lab-v2-planes") ?? "[]") as Array<{ id: number }>;
  const throws = JSON.parse(writes["flight-lab-v2-throws"] ?? storage.getItem("flight-lab-v2-throws") ?? "[]") as Array<{ planeId: number }>;
  if (!Array.isArray(planes) || !Array.isArray(throws) || throws.some((item) => !planes.some((plane) => plane.id === item.planeId))) throw new Error("Some throws do not have a matching plane. Nothing was restored.");
  return writes;
}

export function applyRestore(backup: Backup, storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): void {
  const writes = planRestore(backup, storage);
  const previous = new Map<string, string | null>();
  for (const key of Object.keys(writes)) previous.set(key, storage.getItem(key));
  try { for (const [key, raw] of Object.entries(writes)) storage.setItem(key, raw); }
  catch (error) {
    try { for (const [key, raw] of previous) { if (raw === null) storage.removeItem(key); else storage.setItem(key, raw); } }
    catch { throw new Error("Storage ran out and recovery could not finish. Keep your backup and download the current data before trying again."); }
    throw new Error(error instanceof Error ? `${error.message} Your previous records were kept.` : "Restore failed. Your previous records were kept.");
  }
}
