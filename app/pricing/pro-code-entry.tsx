"use client";
import { useEffect, useState } from "react";
export default function ProCodeEntry({ hasPro }: { hasPro: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!retryAt) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [retryAt]);
  const locked = retryAt > now;
  async function redeem(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/billing/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json();
      if (response.ok && result.ok) { window.location.assign("/pro"); return; }
      setMessage(result.message ?? "That code could not be checked. Try again shortly.");
      if (result.retryAt) setRetryAt(result.retryAt);
    } catch { setMessage("Could not connect. Please try again shortly."); }
    finally { setBusy(false); }
  }
  return <main className="pricing-page"><nav className="pricing-nav"><a href="/">➤ Flight Lab</a><a href="/">Back to my planes</a></nav><section className="pricing-card"><p className="pricing-eyebrow">FLIGHT LAB PRO</p><h1>Enter your Pro code.</h1><p>Use your access code to open Pro. No sign-in or payment is needed.</p>{hasPro ? <><p className="pricing-active">Pro is already unlocked on this browser.</p><a className="pricing-primary" href="/pro">Open Flight Lab Pro</a></> : <form className="pricing-code" onSubmit={redeem}><label htmlFor="pro-access-code">Pro access code</label><input id="pro-access-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={128} disabled={busy || locked} required /><button className="pricing-primary" disabled={busy || locked || !code.trim()}>{busy ? "Checking code…" : "Unlock Pro"}</button><p className="pricing-fine">Two incorrect attempts lock code entry for 24 hours. Access stays unlocked on this browser for 30 days; you can enter the code again afterward.</p></form>}{message && <p className="pricing-message" role="status">{message}</p>}{locked && <p role="status">Try again after {new Date(retryAt).toLocaleString()}.</p>}<p className="pricing-fine">Paid subscriptions are paused. Your saved planes and throws stay intact.</p></section></main>;
}
