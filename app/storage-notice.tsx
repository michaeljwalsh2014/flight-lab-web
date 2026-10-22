"use client";
import { useEffect, useState } from "react";
import { SAVE_ERROR_EVENT } from "./storage-safety";
export default function StorageNotice() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const receive = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener(SAVE_ERROR_EVENT, receive);
    return () => window.removeEventListener(SAVE_ERROR_EVENT, receive);
  }, []);
  return message ? <div role="alert" className="storage-notice"><p>{message}</p><button type="button" onClick={() => setMessage("")}>Dismiss</button></div> : null;
}
