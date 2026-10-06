"use client";
import { useRef, useState } from "react";
import { createBackup, parseBackup, planRestore, applyRestore, type Backup } from "./backup-data";

const contextKey = "flight-lab-pro-ai-context-v3";
const storageFor = (key: string) => key === contextKey ? sessionStorage : localStorage;
const backupStorage = { getItem: (key: string) => storageFor(key).getItem(key), setItem: (key: string, raw: string) => storageFor(key).setItem(key, raw), removeItem: (key: string) => storageFor(key).removeItem(key) };
export default function ProBackup() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function download() {
    try {
      const backup = createBackup(backupStorage);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `flight-lab-backup-${backup.createdAt.slice(0, 10)}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Backup downloaded. Keep it somewhere safe; it includes your saved photos and Coach conversations.");
    } catch { setMessage("This browser could not read your saved data. Try again with browser storage enabled."); }
  }
  async function choose(file?: File) {
    setPending(null); setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("Choose a backup smaller than 30 MB.");
      const backup = parseBackup(await file.text());
      planRestore(backup, backupStorage);
      setPending(backup);
    } catch (error) { setMessage(error instanceof Error ? error.message : "This backup could not be read."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  function restore() {
    if (!pending) return;
    try {
      applyRestore(pending, backupStorage);
      setPending(null); setMessage("Restore complete. Reloading your saved Flight Lab…");
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Restore failed. Your previous records were kept."); }
  }

  const planes = pending ? JSON.parse(pending.data["flight-lab-v2-planes"] ?? "[]").length : 0;
  const throws = pending ? JSON.parse(pending.data["flight-lab-v2-throws"] ?? "[]").length : 0;
  return <section className="pro-tool-section pro-backup" id="backup" aria-label="Backup and restore">
    <div className="pro-tool-heading"><div><p>Your saved work</p><h2>Take Flight Lab with you</h2></div><p>Download your planes, throws, saved reports, Coach history and preferences. Restore them in another browser or on a new phone. Original photo and video files selected for an unfinished scan are not included.</p></div>
    <div className="pro-backup-actions"><button type="button" onClick={download}>Download backup</button><button type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Reading backup…" : "Choose backup to restore"}</button></div>
    <input className="sr-only" ref={input} type="file" accept="application/json,.json" aria-label="Choose a Flight Lab backup" onChange={(event) => void choose(event.target.files?.[0])} />
    {pending && <div className="pro-backup-preview"><h3>Ready to restore</h3><p>{planes} planes · {throws} throws · saved {new Date(pending.createdAt).toLocaleDateString()}</p><p>New records will be added. Existing records and preferences on this device are kept when they conflict.</p><button type="button" onClick={restore}>Merge backup and reload</button><button type="button" onClick={() => setPending(null)}>Cancel</button></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
