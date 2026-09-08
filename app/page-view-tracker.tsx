"use client";

import { useEffect } from "react";

const countedKey = "flight-lab-anonymous-view-counted-v1";

export default function PageViewTracker() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(countedKey)) return;
      window.sessionStorage.setItem(countedKey, "1");
    } catch { /* Count the view when session storage is unavailable. */ }

    fetch("/api/views", { method: "POST", cache: "no-store", keepalive: true }).catch(() => undefined);
  }, []);

  return null;
}
