ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS codigo_operacional text;
CREATE UNIQUE INDEX IF NOT EXISTS servicos_codigo_operacional_unico
  ON public.servicos(codigo_operacional) WHERE codigo_operacional IS NOT NULL;

DO $$
DECLARE nome text; codigo text; quantidade integer;
BEGIN
  FOR nome, codigo IN SELECT * FROM (VALUES
    ('Papai Noel', 'natal_papai_noel'),
    ('Papai Noel com Duende', 'natal_papai_noel_duende'),
    ('Visita Noite de Natal', 'natal_noite_visita')
  ) AS sementes(nome, codigo)
  LOOP
    SELECT count(*) INTO quantidade FROM public.servicos WHERE lower(trim(nome_servico)) = lower(nome);
    IF quantidade <> 1 THEN
      RAISE EXCEPTION 'Catalogo ambiguo ou ausente: % (% registros)', nome, quantidade;
    END IF;
    IF EXISTS (SELECT 1 FROM public.servicos WHERE lower(trim(nome_servico)) = lower(nome)
      AND codigo_operacional IS NOT NULL AND codigo_operacional <> codigo) THEN
      RAISE EXCEPTION 'Codigo operacional conflitante: %', nome;
    END IF;
    UPDATE public.servicos SET codigo_operacional = codigo WHERE lower(trim(nome_servico)) = lower(nome);
  END LOOP;
END $$;

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS servico_principal_id text REFERENCES public.servicos(id);
ALTER TABLE public.eventos ADD COLUMN IF NOT EXISTS servico_principal_id text REFERENCES public.servicos(id);
CREATE INDEX IF NOT EXISTS eventos_servico_principal_idx ON public.eventos(servico_principal_id);

CREATE TABLE IF NOT EXISTS public.natal_operacoes (
  id text PRIMARY KEY,
  ano integer NOT NULL UNIQUE CHECK (ano BETWEEN 2000 AND 2100),
  margem_minutos integer NOT NULL DEFAULT 10 CHECK (margem_minutos BETWEEN 0 AND 1440),
  observacao text NOT NULL DEFAULT '',
  versao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.natal_rotas (
  id text PRIMARY KEY,
  operacao_id text NOT NULL REFERENCES public.natal_operacoes(id),
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 100),
  ordem integer NOT NULL CHECK (ordem >= 0),
  UNIQUE(id, operacao_id)
);
CREATE TABLE IF NOT EXISTS public.natal_visitas (
  evento_id text PRIMARY KEY REFERENCES public.eventos(id) ON DELETE CASCADE,
  operacao_id text NOT NULL REFERENCES public.natal_operacoes(id),
  rota_id text,
  posicao integer NOT NULL CHECK (posicao >= 0),
  observacao text NOT NULL DEFAULT '',
  deslocamento_minutos integer CHECK (deslocamento_minutos BETWEEN 0 AND 1440),
  margem_minutos integer CHECK (margem_minutos BETWEEN 0 AND 1440),
  FOREIGN KEY (rota_id, operacao_id) REFERENCES public.natal_rotas(id, operacao_id)
);
CREATE INDEX IF NOT EXISTS natal_visitas_operacao_idx ON public.natal_visitas(operacao_id);
