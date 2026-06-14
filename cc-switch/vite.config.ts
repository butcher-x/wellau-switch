import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";

export default defineConfig(({ command }) => ({
  root: "src",
  plugins: [
    command === "serve" &&
      codeInspectorPlugin({
        bundler: "vite",
      }),
    react(),
  ].filter(Boolean),
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@wellau": path.resolve(__dirname, "../wellau"),
      "@tanstack/react-query": path.resolve(
        __dirname,
        "./node_modules/@tanstack/react-query",
      ),
      "@tauri-apps/api": path.resolve(
        __dirname,
        "./node_modules/@tauri-apps/api",
      ),
      "@tauri-apps/plugin-dialog": path.resolve(
        __dirname,
        "./node_modules/@tauri-apps/plugin-dialog",
      ),
      "lucide-react": path.resolve(__dirname, "./node_modules/lucide-react"),
      sonner: path.resolve(__dirname, "./node_modules/sonner"),
      "react-i18next": path.resolve(
        __dirname,
        "./node_modules/react-i18next",
      ),
    },
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
}));

