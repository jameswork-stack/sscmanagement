
import { useEffect, useState } from "react";
import "./PWAInstall.css";

export default function PWAInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showPopup, setShowPopup] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const installed = window.matchMedia(
      "(display-mode: standalone)"
    ).matches || window.navigator.standalone === true;

    if (installed) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    const dismissed =
      sessionStorage.getItem("pwa-install-dismissed");

    if (ios && !dismissed) {
      setShowPopup(true);
    }

    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);

      if (!sessionStorage.getItem("pwa-install-dismissed")) {
        setShowPopup(true);
      }
    };

    const handleInstalled = () => {
      setShowPopup(false);
      setInstallPrompt(null);
      sessionStorage.removeItem("pwa-install-dismissed");
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleInstallPrompt
    );

    window.addEventListener(
      "appinstalled",
      handleInstalled
    );

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallPrompt
      );
      window.removeEventListener(
        "appinstalled",
        handleInstalled
      );
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    await installPrompt.userChoice;

    setInstallPrompt(null);
    setShowPopup(false);
  };

  const handleDismiss = () => {
    sessionStorage.setItem("pwa-install-dismissed", "true");
    setShowPopup(false);
  };

  if (!showPopup) return null;

  return (
    <div className="pwa-overlay">
      <div className="pwa-popup">
        <img
          src="/pwa-192x192.png"
          alt="SSC Management"
          className="pwa-icon"
        />

        <h2>Install SSC Management</h2>

        <p>
          Install this application on your device for
          quick and easy access.
        </p>

        {isIOS ? (
          <p className="pwa-ios-guide">
            Tap the Share button in Safari, then select
            <strong> Add to Home Screen</strong>.
          </p>
        ) : (
          <button
            className="pwa-install-btn"
            onClick={handleInstall}
            disabled={!installPrompt}
          >
            Install App
          </button>
        )}

        <button
          className="pwa-dismiss-btn"
          onClick={handleDismiss}
        >
          Not Now
        </button>
      </div>
    </div>
  );
}
