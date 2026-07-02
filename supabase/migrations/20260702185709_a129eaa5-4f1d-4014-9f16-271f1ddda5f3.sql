
INSERT INTO public.bi_channels (id, label, tipo, sck_prefixes, clint_group_names)
VALUES
  ('front_end','Front End (agregado)','agregado','{}','{}'),
  ('high_ticket','High Ticket (agregado)','agregado','{}','{}')
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.bi_targets
 WHERE periodo >= '2026-01-01' AND periodo <= '2026-12-01'
   AND product_id IS NULL
   AND fonte = 'planilha_metas_2026';

INSERT INTO public.bi_targets (granularidade, periodo, channel_id, product_id, indicador, valor, fonte) VALUES
  ('mensal','2026-01-01','high_ticket',NULL,'vendas',79,'planilha_metas_2026'),
  ('mensal','2026-01-01','high_ticket',NULL,'faturamento',238888.13,'planilha_metas_2026'),
  ('mensal','2026-01-01',NULL,NULL,'leads',1285,'planilha_metas_2026'),
  ('mensal','2026-02-01','high_ticket',NULL,'vendas',612,'planilha_metas_2026'),
  ('mensal','2026-02-01','high_ticket',NULL,'faturamento',2314355.45,'planilha_metas_2026'),
  ('mensal','2026-02-01',NULL,NULL,'leads',19889,'planilha_metas_2026'),
  ('mensal','2026-03-01','front_end',NULL,'vendas',120,'planilha_metas_2026'),
  ('mensal','2026-03-01','front_end',NULL,'faturamento',266187.27,'planilha_metas_2026'),
  ('mensal','2026-03-01','high_ticket',NULL,'vendas',396,'planilha_metas_2026'),
  ('mensal','2026-03-01','high_ticket',NULL,'faturamento',1267914.94,'planilha_metas_2026'),
  ('mensal','2026-03-01',NULL,NULL,'leads',21486,'planilha_metas_2026'),
  ('mensal','2026-04-01','front_end',NULL,'vendas',46,'planilha_metas_2026'),
  ('mensal','2026-04-01','front_end',NULL,'faturamento',103639.04,'planilha_metas_2026'),
  ('mensal','2026-04-01','high_ticket',NULL,'vendas',209,'planilha_metas_2026'),
  ('mensal','2026-04-01','high_ticket',NULL,'faturamento',1012015.30,'planilha_metas_2026'),
  ('mensal','2026-04-01',NULL,NULL,'leads',8474,'planilha_metas_2026'),
  ('mensal','2026-05-01','front_end',NULL,'vendas',22,'planilha_metas_2026'),
  ('mensal','2026-05-01','front_end',NULL,'faturamento',49139.20,'planilha_metas_2026'),
  ('mensal','2026-05-01','high_ticket',NULL,'vendas',152,'planilha_metas_2026'),
  ('mensal','2026-05-01','high_ticket',NULL,'faturamento',505619.10,'planilha_metas_2026'),
  ('mensal','2026-05-01',NULL,NULL,'leads',6241,'planilha_metas_2026'),
  ('mensal','2026-06-01','front_end',NULL,'vendas',22,'planilha_metas_2026'),
  ('mensal','2026-06-01','front_end',NULL,'faturamento',49139.20,'planilha_metas_2026'),
  ('mensal','2026-06-01','high_ticket',NULL,'vendas',195,'planilha_metas_2026'),
  ('mensal','2026-06-01','high_ticket',NULL,'faturamento',967215.60,'planilha_metas_2026'),
  ('mensal','2026-06-01','mas',NULL,'vendas',1,'planilha_metas_2026'),
  ('mensal','2026-06-01','mas',NULL,'faturamento',11340.00,'planilha_metas_2026'),
  ('mensal','2026-06-01',NULL,NULL,'leads',7669,'planilha_metas_2026'),
  ('mensal','2026-07-01','high_ticket',NULL,'vendas',159,'planilha_metas_2026'),
  ('mensal','2026-07-01','high_ticket',NULL,'faturamento',532735.92,'planilha_metas_2026'),
  ('mensal','2026-07-01',NULL,NULL,'leads',4355,'planilha_metas_2026'),
  ('mensal','2026-08-01','high_ticket',NULL,'vendas',135,'planilha_metas_2026'),
  ('mensal','2026-08-01','high_ticket',NULL,'faturamento',436325.22,'planilha_metas_2026'),
  ('mensal','2026-08-01',NULL,NULL,'leads',4222,'planilha_metas_2026'),
  ('mensal','2026-09-01','high_ticket',NULL,'vendas',489,'planilha_metas_2026'),
  ('mensal','2026-09-01','high_ticket',NULL,'faturamento',1486334.14,'planilha_metas_2026'),
  ('mensal','2026-09-01',NULL,NULL,'leads',14089,'planilha_metas_2026'),
  ('mensal','2026-10-01','front_end',NULL,'vendas',64,'planilha_metas_2026'),
  ('mensal','2026-10-01','front_end',NULL,'faturamento',142138.18,'planilha_metas_2026'),
  ('mensal','2026-10-01','high_ticket',NULL,'vendas',152,'planilha_metas_2026'),
  ('mensal','2026-10-01','high_ticket',NULL,'faturamento',958687.46,'planilha_metas_2026'),
  ('mensal','2026-10-01','mas',NULL,'vendas',3,'planilha_metas_2026'),
  ('mensal','2026-10-01','mas',NULL,'faturamento',45360.00,'planilha_metas_2026'),
  ('mensal','2026-10-01',NULL,NULL,'leads',6494,'planilha_metas_2026'),
  ('mensal','2026-11-01','high_ticket',NULL,'vendas',488,'planilha_metas_2026'),
  ('mensal','2026-11-01','high_ticket',NULL,'faturamento',1856789.73,'planilha_metas_2026'),
  ('mensal','2026-11-01','mas',NULL,'vendas',3,'planilha_metas_2026'),
  ('mensal','2026-11-01','mas',NULL,'faturamento',45360.00,'planilha_metas_2026'),
  ('mensal','2026-11-01',NULL,NULL,'leads',17945,'planilha_metas_2026'),
  ('mensal','2026-12-01','front_end',NULL,'vendas',64,'planilha_metas_2026'),
  ('mensal','2026-12-01','front_end',NULL,'faturamento',142138.18,'planilha_metas_2026'),
  ('mensal','2026-12-01','high_ticket',NULL,'vendas',129,'planilha_metas_2026'),
  ('mensal','2026-12-01','high_ticket',NULL,'faturamento',454441.69,'planilha_metas_2026'),
  ('mensal','2026-12-01','mas',NULL,'vendas',2,'planilha_metas_2026'),
  ('mensal','2026-12-01','mas',NULL,'faturamento',34020.00,'planilha_metas_2026'),
  ('mensal','2026-12-01',NULL,NULL,'leads',6653,'planilha_metas_2026');
