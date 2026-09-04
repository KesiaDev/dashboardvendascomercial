import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Só as funções puras de domínio por enquanto. Elas são onde mora o cálculo
    // de comissão e faturamento — e eram o único código sem nenhuma rede de
    // segurança num sistema que define quanto cada pessoa recebe.
    include: ["src/lib/**/*.test.ts"],
    environment: "node",
  },
});
