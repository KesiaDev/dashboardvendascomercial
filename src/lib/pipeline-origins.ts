/**
 * IDs de origem (funil) da Clint — fonte de verdade única.
 *
 * Existiam duas listas hardcoded com conteúdos DIFERENTES:
 *
 *   data.functions.ts   4 UUIDs (V3 x2 + Sessão Estratégica x2)
 *   sync.coach-v3.ts    2 UUIDs (só os dois V3)
 *
 * O sync do Coach, portanto, nunca enxergou os funis de Sessão Estratégica.
 *
 * `docs/architecture.md` diz, em negrito, que nenhum dashboard deve filtrar
 * `clint_deals` por `origin_id` direto — a tabela `bi_pipeline_areas` existe
 * para isso. Enquanto essa migração não acontece, ao menos os IDs vivem num
 * lugar só: adicionar um funil novo passa a ser editar UMA linha, não caçar
 * cópias.
 */

/** Os dois registros que a Clint chama de "PIPELINE_COMERCIAL-V3". */
export const PIPELINE_V3_ORIGIN_IDS = [
  "8c159581-ba93-4fad-a909-f4e204d6faaf",
  "07fc7c4b-82d2-427d-b09e-04a7f90f16f1",
] as const;

/** Funis de Sessão Estratégica (o nome mudou; os dois registros seguem ativos). */
export const SESSAO_ESTRATEGICA_ORIGIN_IDS = [
  "f8b0fa1a-5f7b-4402-bb47-b0c4cbdf9090",
  "dfbc12ac-9f79-404a-82d5-83cd579e683b",
] as const;

/** Todos os funis que contam como pipeline comercial. */
export const PIPELINE_COMERCIAL_ORIGIN_IDS: readonly string[] = [
  ...PIPELINE_V3_ORIGIN_IDS,
  ...SESSAO_ESTRATEGICA_ORIGIN_IDS,
];

/** Nome do funil V3 na Clint, usado onde o filtro é por nome e não por id. */
export const PIPELINE_V3_ORIGIN_NAME = "PIPELINE_COMERCIAL-V3";
