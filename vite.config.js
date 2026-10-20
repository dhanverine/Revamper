import { defineConfig } from "vite";
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/vendor/**"] },
  },
  build: {
    rollupOptions: { input: { main: "index.html", settings: "settings.html", toast: "toast.html", options: "options.html" } },
  },
});
