let loadPromise: Promise<void> | null = null;

/** Loads the Google Maps JS API (geometry library) once and caches the promise. */
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only be loaded in the browser"));
  }
  // Don't key "already loaded" on maps.drawing — Google removed the Drawing library (v3.65+),
  // so it's always undefined and a second call would wait forever on a script whose load event
  // already fired, leaving the map blank.
  if (window.google?.maps?.Map && window.google.maps.geometry) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("google-maps-js-api") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => {
        loadPromise = null;
        reject(new Error("Failed to load Google Maps"));
      });
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-js-api";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
