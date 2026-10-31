"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export default function ProCodeEntry({ hasPro, initialRetryAt = 0, initialStatusUnavailable = false }: { hasPro: boolean; initialRetryAt?: number; initialStatusUnavailable?: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(!hasPro);
  const [statusUnavailable, setStatusUnavailable] = useState(initialStatusUnavailable);
  const [message, setMessage] = useState("");
  const [retryAt, setRetryAt] = useState(initialRetryAt);
  const [serverNow, setServerNow] = useState(0);
  const requestVersion = useRef(0);
  const submitting = useRef(false);
  const locked = retryAt > 0;
  const checkStatus = useCallback(async () => {
    if (hasPro || submitting.current) return;
    const version = ++requestVersion.current;
    setChecking(true);
    try {
      const response = await fetch("/api/billing/redeem", { cache: "no-store" });
      if (!response.ok) throw new Error("Status unavailable");
      const result = await response.json();
      if (!Number.isFinite(result.retryAt) || !Number.isFinite(result.serverNow)) throw new Error("Invalid status");
      if (version !== requestVersion.current) return;
      setRetryAt(result.retryAt);
      setServerNow(result.serverNow);
      setStatusUnavailable(false);
      if (result.retryAt) setCode("");
    } catch {
      if (version === requestVersion.current) setStatusUnavailable(true);
    } finally {
      if (version === requestVersion.current) setChecking(false);
    }
  }, [hasPro]);
  useEffect(() => {
    void checkStatus();
    const onVisible = () => { if (document.visibilityState === "visible") void checkStatus(); };
    window.addEventListener("focus", checkStatus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { ++requestVersion.current; window.removeEventListener("focus", checkStatus); document.removeEventListener("visibilitychange", onVisible); };
  }, [checkStatus]);
  useEffect(() => {
    if (!locked || !serverNow) return;
    // Only a fresh server check can enable entry, regardless of the device clock.
    const timer = setTimeout(() => void checkStatus(), Math.max(1000, retryAt - serverNow + 100));
    return () => clearTimeout(timer);
  }, [locked, retryAt, serverNow, checkStatus]);
  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    if (busy || checking || statusUnavailable || locked || !code.trim()) return;
    ++requestVersion.current;
    submitting.current = true;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/billing/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json();
      if (response.ok && result.ok) { window.location.assign("/pro"); return; }
      setMessage(result.retryAt ? "" : result.message ?? "That code could not be checked. Try again shortly.");
      if (result.retryAt) { setRetryAt(result.retryAt); setCode(""); setServerNow(result.serverNow ?? 0); }
    } catch { setMessage("Could not connect. Please try again shortly."); }
    finally { submitting.current = false; setBusy(false); }
  }
  const disabled = busy || checking || statusUnavailable || locked;
  return <main className="pricing-page"><nav className="pricing-nav"><a href="/">➤ Flight Lab</a><a href="/">Back to my planes</a></nav><section className="pricing-card"><p className="pricing-eyebrow">FLIGHT LAB PRO</p><h1>Enter code.</h1><p>Use your access code to open Pro. No sign-in or payment is needed.</p>{hasPro ? <><p className="pricing-active">Pro is already unlocked on this browser.</p><a className="pricing-primary" href="/pro">Open Flight Lab Pro</a></> : <form className="pricing-code" onSubmit={redeem}><label htmlFor="pro-access-code">Enter code</label><input id="pro-access-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={128} disabled={disabled} required /><button className="pricing-primary" disabled={disabled || !code.trim()}>{busy ? "Checking code…" : "Unlock Pro"}</button></form>}{message && <p className="pricing-message" role="status">{message}</p>}{locked && <p role="status">Code entry is temporarily unavailable. Try again after {new Date(retryAt).toLocaleString("en-US", { timeZone: "America/Chicago" })} Central.</p>}{statusUnavailable && <p role="status">Code entry could not be checked. <button type="button" onClick={() => void checkStatus()} disabled={checking}>Try again</button></p>}</section></main>;
}
