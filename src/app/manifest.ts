import type { MetadataRoute } from "next";

// Installable web app. Deliberately no service worker / offline cache —
// Chrome and Safari both install from the manifest alone. Colors match the
// brand tile in the icons (#005642) and the white app chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Landscapt & Equipt",
    short_name: "Landscapt",
    description: "CRM, field service, work orders, purchasing & asset management",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
