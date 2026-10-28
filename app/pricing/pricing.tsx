"use client";
import { useEffect, useState } from "react";
type Props = { authenticated: boolean; isOwner: boolean; hasPro: boolean; freePass: boolean; ready: boolean; unavailable: boolean; subscription: { endsAt: number; cancelAtEnd: boolean } | null };
export default function Pricing(props: Props) {
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState("");
  const [message, setMessage] = useState("");
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "success") setMessage("Payment submitted. Pro unlocks after Stripe confirms it. If it is still pending, refresh this page shortly.");
  }, []);
  useEffect(() => { if (!retryAt) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [retryAt]);
  const locked = retryAt !== null && retryAt > now;
  async function action(path: string, body?: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/billing/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const result = await response.json();
      if (result.retryAt) setRetryAt(result.retryAt);
      if (result.code) setIssued(result.code);
      if (result.message) setMessage(result.message);
      if (result.url) { window.location.assign(result.url); return; }
      if (response.ok && path === "redeem") { window.location.assign("/pro"); return; }
      if (response.ok && path === "cancel") window.location.reload();
    } catch { setMessage("The connection was interrupted. Please try again. If you just submitted a payment, refresh your access before starting another checkout."); }
    finally { setBusy(false); }
  }
  return <main className="pricing-page">
    <nav className="pricing-nav"><a href="/">➤ Flight Lab</a><a href="/#hangar">Back to my planes</a></nav>
    <section className="pricing-card">
      <p className="pricing-eyebrow">FLIGHT LAB PRO</p>
      <h1>One small change.<br />A better next flight.</h1>
      <p>Get deeper plane inspections, flight-video analysis, Smart Walk Measure, experiments, and Pro Coach.</p>
      <div className="pricing-price">$2.99<span> USD / month</span></div>
      <p className="pricing-fine">Renews monthly until canceled. Applicable tax may be added at checkout. Cancel renewal anytime and keep Pro through your paid period.</p>
      <ul><li>Quick and six-photo plane inspections</li><li>Flight-video tracking and advanced review</li><li>Up to 7 AI reviews and 50 Coach messages per day</li><li>Your existing saved planes and throws stay intact</li></ul>
      {props.unavailable && <p role="alert">Account access is temporarily unavailable. Please try again shortly.</p>}
      {props.hasPro ? <><p className="pricing-active">{props.isOwner ? "Your free Lifetime Pro owner access is active." : props.freePass ? "Your free Pro pass is active." : "Your Pro subscription is active."}</p><a className="pricing-primary" href="/pro">Open Flight Lab Pro</a></> : !props.authenticated ? <a className="pricing-primary" href="/signin-with-chatgpt?return_to=%2Fpricing" target="_top">Sign in to get Pro</a> : <button className="pricing-primary" disabled={busy || !props.ready || props.unavailable} onClick={() => action("checkout")}>{busy ? "Please wait…" : props.ready ? "Subscribe for $2.99/month" : "Subscriptions opening soon"}</button>}
      {!props.ready && !props.hasPro && <p className="pricing-fine">Payment setup is in progress. You can still redeem a free Pro code under More.</p>}
      {props.subscription && <div className="pricing-subscription"><p>{props.subscription.cancelAtEnd ? "Renewal is canceled." : "Monthly renewal is on."} {props.subscription.endsAt > 0 && `Paid access ends ${new Date(props.subscription.endsAt).toLocaleDateString()}.`}</p>{!props.subscription.cancelAtEnd && <button disabled={busy} onClick={() => action("cancel")}>Cancel monthly renewal</button>}<p className="pricing-fine">You can also manage your Managed Payments purchase through your <a href="https://link.com" target="_blank" rel="noreferrer">Link account</a>.</p></div>}
      <button className="pricing-more" aria-expanded={more} aria-controls="pro-code-options" onClick={() => setMore(!more)}>More {more ? "−" : "+"}</button>
      {more && <section id="pro-code-options" className="pricing-code"><h2>Have a free Pro code?</h2><p>Redeem it for this account. Two incorrect attempts lock code entry for 24 hours. Refreshing the page does not reset the limit.</p>{!props.authenticated ? <a href="/signin-with-chatgpt?return_to=%2Fpricing" target="_top">Sign in to enter a code</a> : <form onSubmit={event => { event.preventDefault(); action("redeem", { code }); }}><label htmlFor="pro-code">Enter a code</label><input id="pro-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={128} disabled={busy || locked} /><button disabled={busy || locked || !code.trim()}>Unlock free Pro</button>{locked && <p role="status">Try again after {new Date(retryAt!).toLocaleString()}.</p>}</form>}</section>}
      {props.isOwner && <details className="pricing-code"><summary>Owner: free Pro pass code</summary><p>Generate a reusable code to give people free Pro. A replacement stops the old code from accepting new redemptions. Existing free accounts keep access.</p><button disabled={busy} onClick={() => action("codes")}>{issued ? "Replace this code" : "Generate a private code"}</button>{issued && <p className="pricing-issued"><strong>{issued}</strong><br />Copy and save it now; this code is shown only once.</p>}</details>}
      {message && <p role="status" className="pricing-message">{message}</p>}
      <p className="pricing-fine"><a href="/">Keep using Free</a> · No annual plan at launch.</p>
    </section>
  </main>;
}
