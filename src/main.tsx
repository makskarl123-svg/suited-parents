import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CLERK_KEY } from "./auth";
import "./styles.css";

// The dev guardian picker must never reach a real family.
if (import.meta.env.PROD && !CLERK_KEY) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required for a production build of suited-parents");
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
