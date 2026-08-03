-- Adiciona coluna de tags de contato em clint_deals para filtrar por origem (ebook, minicurso, WGT, etc.)
ALTER TABLE clint_deals
  ADD COLUMN IF NOT EXISTS contact_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_clint_deals_contact_tags
  ON clint_deals USING GIN (contact_tags);
