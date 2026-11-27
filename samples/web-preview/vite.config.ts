import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  base: "./",
  build: {
    target: "es2022",
    // Two pages: the preview and its API reference
    rollupOptions: { input: { main: "index.html", reference: "reference.html" } },
  },
});
