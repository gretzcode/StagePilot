import { useState, useEffect } from "react";

/**
 * Custom hook for display monitors (Audience & Confidence HUD).
 * Automatically hides mouse cursor and controls overlay after 2.5s of inactivity.
 * Re-shows cursor and controls instantly on mouse move or keypress.
 */
export function useAutoHideCursor(hideDelayMs = 2500) {
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const handleActivity = () => {
      setShowControls(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setShowControls(false);
      }, hideDelayMs);
    };

    // Initial timer launch
    timer = setTimeout(() => {
      setShowControls(false);
    }, hideDelayMs);

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [hideDelayMs]);

  return showControls;
}
