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
    // Rede de segurança: o build de produção rodou sem as variáveis VITE_* (o .env
    // é gitignored), e o bundle publicado subiu sem URL/chave publicável do backend
    // — o app abria direto na tela de erro. Estes valores são publicáveis (anon),
    // nunca segredos, e só entram quando a variável de ambiente não existe.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        process.env.VITE_SUPABASE_URL ?? "https://spnmnxbglztrtgtjyvyz.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbm1ueGJnbHp0cnRndGp5dnl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NDMxMTksImV4cCI6MjA5ODAxOTExOX0.7a61ASPZBM096gAu_4h3jY-6E-XAJ__Plk7nQ8J8Q6Q",
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        process.env.VITE_SUPABASE_PROJECT_ID ?? "spnmnxbglztrtgtjyvyz",
      ),
    },
    build: {
      rollupOptions: {
        output: {
          // Separa as dependências pesadas do entry para que mudanças no código do
          // produto não invalidem o cache delas, e para que rotas sem gráfico não
          // paguem recharts.
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return;
            if (/lodash/.test(id)) return "lodash";
            if (/recharts|victory-vendor|react-smooth|[\/]d3-/.test(id)) return "graficos";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("@tanstack")) return "tanstack";
            if (/react-day-picker|date-fns/.test(id)) return "dates";
          },
        },
      },
    },
  },
});
