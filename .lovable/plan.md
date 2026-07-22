# Arena Comercial IA

Simulador de vendas por chat (estilo WhatsApp) com clientes gerados por IA, missão diária, XP/ligas, avaliação automática e coach. Vou entregar em fases para evitar um monolito difícil de validar.

## Fase 1 — MVP jogável (esta entrega)

Escopo mínimo que já entrega valor real e é a base de tudo:

1. **Menu lateral** novo item "Arena Comercial IA" (`/arena`), acessível para admins + vendedores whitelisted (mesma regra de `ALLOWED_SELLER_EMAILS`).
2. **Dashboard da Arena** (`/arena`):
   - Cards: Nível, XP, Liga, Sequência (dias), Simulações, Taxa de sucesso, Nota média
   - Missão diária (gerada 1x/dia por vendedor)
   - Botão "Iniciar simulação" (usa a missão) e "Simulação livre" (dificuldade escolhida)
   - Histórico das últimas simulações com nota
3. **Motor de cenários**: geração de cliente virtual (persona completa — nome, perfil DISC, dores, objeções, canal, humor inicial, dificuldade Bronze→Lenda) via Lovable AI (`google/gemini-3-flash-preview`). Persona serializada em JSON e nunca repetida por vendedor.
4. **Chat da simulação** (`/arena/sim/$id`):
   - UI estilo WhatsApp (bolhas, timestamp, "digitando…", delays realistas por perfil)
   - Conversa livre, sem botões nem opções pré-definidas
   - IA mantém memória completa da conversa e do que já foi dito
   - Estado emocional evolui (Animado, Neutro, Desconfiado, Irritado, Ocupado, Frustrado, Interessado, Seguro) baseado nas mensagens do vendedor
   - Botão "Encerrar" → dispara avaliação
5. **Avaliação automática** (Gemini): nota 0–100 + notas por competência (Rapport, Empatia, Escuta ativa, Descoberta, Objeções, Fechamento, CTA, Clareza, Tempo de resposta), 3 pontos fortes, 5 melhorias, resumo.
6. **Replay comentado**: cada mensagem do vendedor recebe comentário curto da IA (✅/⚠️/❌).
7. **XP e Liga**: XP calculado da nota + eventos (venda +120, agendou +70, tratou objeção +30, pergunta aberta +15, resposta rápida +20). Liga derivada do XP acumulado (Bronze/Prata/Ouro/Diamante/Elite/Lenda).

## Fase 2 — Adaptativo e social (próxima entrega, se aprovar Fase 1)

- Coach IA cruza avaliações e sugere exercícios / vídeos da Universidade Comercial
- Adaptativo: gerador de cenários lê competências fracas do vendedor e ataca essas lacunas
- Conquistas / medalhas
- Painel do Gestor (ranking, mapa de calor de competências, evolução, comparação)
- Multiplayer (2 vendedores, mesmo cliente) e Torneios / Temporadas
- Base de conhecimento: aprender padrões de `coach_conversations` reais (sem copiar literalmente) para enriquecer objeções

## Dados (Fase 1)

Novas tabelas Supabase, todas com RLS por `auth.uid()` + admin bypass via `has_role`:

- `arena_personas` — id, seller_user_id, persona (jsonb), difficulty, product, channel, created_at
- `arena_simulations` — id, seller_user_id, persona_id, status (open/finished), started_at, ended_at, score, xp_earned, evaluation (jsonb), mission_id
- `arena_messages` — id, simulation_id, role (seller/client), body, sent_at, ai_comment (jsonb nullable), emotion_after
- `arena_missions` — id, seller_user_id, date, spec (jsonb), completed_simulation_id
- `arena_progress` — seller_user_id (pk), xp, league, streak_days, last_played_date

Uploads (.docx/.pdf do Luciano Larrossa / MGT): vou parsear e usar como **contexto de produto** no prompt da IA quando o cenário for "Mentoria Gestor de Tráfego" — assim o cliente virtual conhece o produto real. Guardados em `arena_knowledge` (texto extraído).

## Detalhes técnicos

- Server functions em `src/lib/arena.functions.ts` (`createServerFn` + `requireSupabaseAuth`): `getArenaDashboard`, `generateDailyMission`, `startSimulation`, `sendArenaMessage` (chama Gemini com histórico + persona + emoção), `finishSimulation` (avalia + XP + comentários replay), `listSimulations`, `getSimulation`.
- Rotas: `src/routes/_app.arena.tsx` (dashboard) e `src/routes/_app.arena.sim.$id.tsx` (chat + replay).
- IA via Lovable AI Gateway (`LOVABLE_API_KEY` já existe), modelo `google/gemini-3-flash-preview`. Sem chave nova.
- UI: shadcn + Tailwind, alinhada ao restante (dark-friendly). Chat com bolhas verdes/cinza estilo WhatsApp, header com avatar do "cliente", indicador de humor discreto.
- Uploads processados 1x com `document--parse_document` e salvos em `arena_knowledge` no momento do primeiro deploy.

## Fora do escopo desta fase

Multiplayer, torneios, painel gestor completo, conquistas visuais, adaptativo por lacuna, integração com Universidade Comercial — ficam para Fase 2 para manter esta entrega revisável.

Confirma que posso seguir com a Fase 1 assim descrita?