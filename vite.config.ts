import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the app talks to the Money service through this proxy, so
// there is no CORS and the x-guardian-id dev header works. In production the
// app calls VITE_MONEY_API_URL directly with a Clerk token.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    host: true,
    proxy: {
      "/api": { target: process.env["MONEY_API_URL"] ?? "http://localhost:3100", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
      // The invite link resolves and accepts against the learning API (it knows who the child is).
      "/learning": { target: process.env["LEARNING_API_URL"] ?? "http://localhost:3001", changeOrigin: true, rewrite: (p) => p.replace(/^\/learning/, "/api") },
    },
  },
  test: { environment: "jsdom", globals: false },
});
