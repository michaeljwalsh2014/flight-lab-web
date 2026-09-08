"use client";

import { useEffect, useState } from "react";

export default function ProViewCounter() {
  const [totalViews, setTotalViews] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => fetch("/api/views", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result: unknown) => {
        if (active && result && typeof result === "object" && "totalViews" in result && typeof result.totalViews === "number") setTotalViews(result.totalViews);
      })
      .catch(() => undefined);
    refresh();
    const interval = window.setInterval(refresh, 10_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  return <aside className="pro-view-counter" aria-live="polite" aria-label="Anonymous website views">
    <span>Live site views</span>
    <b>{totalViews === null ? "—" : totalViews.toLocaleString()}</b>
    <small>anonymous visits</small>
  </aside>;
}
