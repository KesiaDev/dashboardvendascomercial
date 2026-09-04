import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Dados de BI vêm de syncs/imports periódicos (o mais frequente roda a cada
        // 30 min), não tempo real. 60s obrigava a rebaixar payloads grandes a cada
        // navegação; 10 min cobre a janela real de atualização dos dados.
        staleTime: 10 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Prefetch no hover/foco do link — sem isto cada clique de menu paga o chunk a
    // frio. defaultPreloadStaleTime precisa acompanhar o staleTime acima, senão o
    // resultado do preload é considerado velho e o trabalho é jogado fora.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    defaultPreloadStaleTime: 10 * 60_000,
  });

  return router;
};
