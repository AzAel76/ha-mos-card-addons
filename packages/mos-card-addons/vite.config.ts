import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => ({
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "MosCardAddons",
      formats: ["es"],
      fileName: () => "mos-card-addons.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    minify: mode !== "development",
    sourcemap: mode === "development",
    rollupOptions: {
      output: {
        // Home Assistant loads this as a plain <script type="module"> resource,
        // so everything (including lit, and all three cards' editors) must be
        // bundled into the one file.
        inlineDynamicImports: true,
      },
    },
  },
}));
