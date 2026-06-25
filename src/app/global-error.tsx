"use client";

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "32px", textAlign: "center", fontFamily: "sans-serif" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Something went wrong</h2>
          <p style={{ fontSize: "14px", color: "#64748b", maxWidth: "360px" }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            style={{ padding: "6px 16px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "14px", cursor: "pointer", background: "white" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
