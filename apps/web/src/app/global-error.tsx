"use client";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  console.error(error);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "sans-serif",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#555", maxWidth: "30rem" }}>
            An unexpected error occurred. Please try refreshing the page. If the
            problem persists, contact support and mention code{" "}
            <code>{error.digest ?? "N/A"}</code>.
          </p>
        </main>
      </body>
    </html>
  );
}
