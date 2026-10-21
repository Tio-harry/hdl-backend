-- Catalog only: escala_eventos.funcao remains the historical snapshot.
CREATE TABLE IF NOT EXISTS public.funcoes_equipe (
  id text PRIMARY KEY,
  nome text NOT NULL CHECK (length(trim(nome)) >= 1),
  nome_normalizado text GENERATED ALWAYS AS (lower(regexp_replace(trim(nome), '\s+', ' ', 'g'))) STORED,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0 CHECK (ordem >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(nome_normalizado)
);
CREATE INDEX IF NOT EXISTS funcoes_equipe_ativo_ordem_idx ON public.funcoes_equipe(ativo, ordem, id);
INSERT INTO public.funcoes_equipe(id,nome,ordem)
SELECT 'funcao-' || ordem, nome, ordem FROM (VALUES
  ('Recreador',1), ('Personagem',2), ('Promotor',3), ('Staff',4),
  ('Papai Noel',5), ('Assistente/Duende',6), ('Motorista',7)
) AS seeds(nome,ordem) ON CONFLICT DO NOTHING;
INSERT INTO public.funcoes_equipe(id,nome,ordem)
SELECT 'historica-' || md5(normalizado), nome,
  7 + row_number() OVER (ORDER BY normalizado)::integer
FROM (
  SELECT lower(regexp_replace(trim(funcao), '\s+', ' ', 'g')) AS normalizado, min(trim(funcao)) AS nome
  FROM public.escala_eventos WHERE length(trim(funcao)) >= 1
  GROUP BY lower(regexp_replace(trim(funcao), '\s+', ' ', 'g'))
) AS historicas ON CONFLICT DO NOTHING;
