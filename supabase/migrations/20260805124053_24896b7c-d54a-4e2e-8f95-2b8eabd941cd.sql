DO $$
DECLARE obj uuid; kr1 uuid; kr2 uuid; kr3 uuid;
BEGIN
INSERT INTO public.bi_okr_objectives (titulo, lider, equipes, ano, trimestre, ordem)
VALUES ('Transformar o Comercial em um motor mais eficiente, previsível e diversificado de crescimento da receita.', 'Késia Nandi', 'Comercial', 2026, 3, 1)
RETURNING id INTO obj;

INSERT INTO public.bi_okr_key_results (objective_id, titulo, meta, unidade, metrica, ordem)
VALUES (obj, 'Dobrar a conversão de FE (de 5% para 10% — ver número exato com todos os funis)', 10, '%', NULL, 1) RETURNING id INTO kr1;
INSERT INTO public.bi_okr_key_results (objective_id, titulo, meta, unidade, metrica, ordem)
VALUES (obj, 'Validar o processo comercial de high-ticket, gerando 200 oportunidades qualificadas e 10 vendas pelos novos funis no trimestre.', 10, 'vendas', 'vendas_ht', 2) RETURNING id INTO kr2;
INSERT INTO public.bi_okr_key_results (objective_id, titulo, meta, unidade, metrica, ordem)
VALUES (obj, 'Gerar 100 leads por indicação', 100, 'leads', NULL, 3) RETURNING id INTO kr3;

INSERT INTO public.bi_okr_initiatives (key_result_id, titulo, responsavel, status, ordem) VALUES
(kr1, 'Validar IA Analista de chamadas, vídeos e mensagens', 'Késia', 'pendente', 1),
(kr1, 'Criar e validar IA SDR visando aumentar taxa de resposta e agendar reuniões', 'Késia', 'pendente', 2),
(kr1, 'Validar IA Coach de vendas para treinar vendedores em contorno de objeção', 'Késia', 'pendente', 3),
(kr1, 'Criar treinamento semanal de desenvolvimento de competências (oportunidades de melhorias identificadas pela IA)', 'Késia', 'pendente', 4),
(kr1, 'Desenvolver cadência, templates e scripts comerciais assegurando que toda a equipe siga o mesmo padrão de comunicação', 'Késia', 'pendente', 5),
(kr2, 'Estruturar o funil HT via tráfego pago', 'Diego', 'pendente', 1),
(kr2, 'Definir playbook de vendas HT (pipeline, cadência, atividades)', 'Késia', 'pendente', 2),
(kr2, 'Estruturar funil de upsell para base de renovação da Mentoria', 'Késia', 'pendente', 3),
(kr2, 'Estruturar funil de upsell para novas vendas da Mentoria', 'Késia', 'pendente', 4),
(kr2, 'Implementar processo de recuperação das LDPs', 'Késia', 'pendente', 5),
(kr3, 'Estruturar e validar o programa de indicação', 'Késia', 'pendente', 1);
END $$;