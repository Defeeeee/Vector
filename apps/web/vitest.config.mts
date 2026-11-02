import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Node y no jsdom a propósito: lo que se testea acá es lógica de servidor
    // —guards del copiloto, resolución de aeródromos, cálculo de tiempos— y
    // parte lee el TSV del disco.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
