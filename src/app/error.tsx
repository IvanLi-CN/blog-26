"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <h1
          style={{ fontSize: "4rem", fontWeight: "bold", marginBottom: "1rem", color: "#dc2626" }}
        >
          错误
        </h1>
        <h2
          style={{ fontSize: "1.5rem", fontWeight: "600", marginBottom: "1rem", color: "#374151" }}
        >
          出现了一些问题
        </h2>
        <p style={{ marginBottom: "2rem", opacity: 0.7, color: "#6b7280" }}>
          抱歉，页面加载时出现了错误。
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "500",
            }}
          >
            重试
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            style={{
              padding: "0.75rem 1.5rem",
              border: "1px solid #3b82f6",
              backgroundColor: "transparent",
              color: "#3b82f6",
              borderRadius: "0.375rem",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "500",
            }}
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
