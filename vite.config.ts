// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Divide cada rota em chunk próprio carregado sob demanda. Sem isto, abrir
    // /fechamento (uma tela de formulário, zero gráficos) baixava também recharts,
    // as 26 rotas e os ícones de todas elas.
    router: { autoCodeSplitting: true },
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          // Separa as dependências pesadas do entry para que mudanças no código do
          // produto não invalidem o cache delas, e para que rotas sem gráfico não
          // paguem recharts.
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return;
            if (/recharts|victory-vendor|[\/]d3-/.test(id)) return "charts";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("@tanstack")) return "tanstack";
            if (/react-day-picker|date-fns/.test(id)) return "dates";
          },
        },
      },
    },
  },
});
