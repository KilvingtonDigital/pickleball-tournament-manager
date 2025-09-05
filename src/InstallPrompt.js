import React, { useEffect, useState } from "react";

const isiOS = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
  !window.MSStream;

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

export default function InstallPrompt({ className = "" }) {
  const [deferred, setDeferred] = useState(null);
  const [supported, setSupported] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);       // save the event
      setSupported(true);   // Android/desktop Chrome path
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS path (no event)
    if (isiOS() && !isStandalone()) {
      setShowIOSHint(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const onInstallClick = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // outcome: 'accepted' | 'dismissed'
    setDeferred(null);
  };

  // Prefer Android/desktop native prompt if available
  if (supported && deferred) {
    return (
      <button
        className={`inline-flex items-center justify-center rounded-xl px-4 h-11 text-sm font-semibold bg-brand-secondary text-brand-primary hover:bg-brand-secondary/90 ${className}`}
        onClick={onInstallClick}
      >
        Install App
      </button>
    );
  }

  // iOS guidance fallback
  if (showIOSHint && !isStandalone()) {
    return (
      <button
        className={`inline-flex items-center justify-center rounded-xl px-4 h-11 text-sm font-semibold bg-brand-secondary text-brand-primary hover:bg-brand-secondary/90 ${className}`}
        onClick={() => alert("On iPhone: tap the Share icon, then 'Add to Home Screen' to install SmashBoard.")}
      >
        Install on iPhone
      </button>
    );
  }

  return null; // already installed or not supported
}
