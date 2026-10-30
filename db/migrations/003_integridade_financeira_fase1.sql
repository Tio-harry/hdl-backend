-- Fase 1 da integridade financeira.
-- Deslocamento e extras continuam tendo o valor previsto em eventos.
-- Esta tabela registra somente a situacao de quitacao; equipe permanece em escala_eventos.
CREATE TABLE IF NOT EXISTS public.custos_operacionais_evento (
  id text PRIMARY KEY,
  evento_id text NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('deslocamento', 'extras')),
  situacao text NOT NULL DEFAULT 'LEGADO'
    CHECK (situacao IN ('NAO_INFORMADO', 'LEGADO', 'PENDENTE', 'PARCIAL', 'PAGO')),
  valor_quitado numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_quitado >= 0),
  data_quitacao date,
  origem text NOT NULL DEFAULT 'migration_legado',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, tipo),
  CHECK (
    (situacao IN ('NAO_INFORMADO', 'LEGADO', 'PENDENTE') AND valor_quitado = 0 AND data_quitacao IS NULL)
    OR (situacao = 'PARCIAL' AND valor_quitado > 0)
    OR (situacao = 'PAGO' AND valor_quitado > 0)
  )
);

CREATE INDEX IF NOT EXISTS custos_operacionais_evento_evento_idx
  ON public.custos_operacionais_evento (evento_id);
CREATE INDEX IF NOT EXISTS custos_operacionais_evento_situacao_idx
  ON public.custos_operacionais_evento (situacao, tipo);
CREATE INDEX IF NOT EXISTS custos_operacionais_evento_data_quitacao_idx
  ON public.custos_operacionais_evento (data_quitacao)
  WHERE data_quitacao IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.custos_operacionais_historico (
  id text PRIMARY KEY,
  obrigacao_id text NOT NULL REFERENCES public.custos_operacionais_evento(id) ON DELETE CASCADE,
  evento_id text NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('deslocamento', 'extras')),
  acao text NOT NULL,
  situacao_anterior text,
  situacao_nova text NOT NULL,
  valor_previsto_snapshot numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_previsto_snapshot >= 0),
  valor_quitado_anterior numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_quitado_anterior >= 0),
  valor_quitado_novo numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_quitado_novo >= 0),
  data_quitacao_anterior date,
  data_quitacao_nova date,
  observacao text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custos_operacionais_historico_evento_idx
  ON public.custos_operacionais_historico (evento_id, created_at DESC);
CREATE INDEX IF NOT EXISTS custos_operacionais_historico_obrigacao_idx
  ON public.custos_operacionais_historico (obrigacao_id, created_at DESC);

-- Dados existentes nao recebem quitacao nem data inventada.
INSERT INTO public.custos_operacionais_evento (
  id, evento_id, tipo, situacao, valor_quitado, data_quitacao, origem
)
SELECT
  'custo-op-' || md5(e.id || ':deslocamento'),
  e.id,
  'deslocamento',
  'LEGADO',
  0,
  NULL,
  'migration_legado'
FROM public.eventos e
WHERE COALESCE(e.deslocamento, 0) > 0
ON CONFLICT (evento_id, tipo) DO NOTHING;

INSERT INTO public.custos_operacionais_evento (
  id, evento_id, tipo, situacao, valor_quitado, data_quitacao, origem
)
SELECT
  'custo-op-' || md5(e.id || ':extras'),
  e.id,
  'extras',
  'LEGADO',
  0,
  NULL,
  'migration_legado'
FROM public.eventos e
WHERE COALESCE(e.extras, 0) > 0
ON CONFLICT (evento_id, tipo) DO NOTHING;

INSERT INTO public.custos_operacionais_historico (
  id, obrigacao_id, evento_id, tipo, acao, situacao_anterior, situacao_nova,
  valor_previsto_snapshot, valor_quitado_anterior, valor_quitado_novo,
  observacao
)
SELECT
  'custo-op-hist-' || md5(c.evento_id || ':' || c.tipo || ':legado'),
  c.id,
  c.evento_id,
  c.tipo,
  'IMPORTACAO_LEGADO',
  NULL,
  'LEGADO',
  CASE c.tipo
    WHEN 'deslocamento' THEN COALESCE(e.deslocamento, 0)
    ELSE COALESCE(e.extras, 0)
  END,
  0,
  0,
  'Valor historico preservado sem inferir quitacao ou data.'
FROM public.custos_operacionais_evento c
JOIN public.eventos e ON e.id = c.evento_id
WHERE c.origem = 'migration_legado'
ON CONFLICT (id) DO NOTHING;

-- Quitacoes de deslocamento/extras sao movimentos acumulaveis; valor_quitado e a soma dos ativos.
CREATE TABLE IF NOT EXISTS public.custos_operacionais_movimentos (
  id text PRIMARY KEY,
  obrigacao_id text NOT NULL REFERENCES public.custos_operacionais_evento(id) ON DELETE CASCADE,
  evento_id text NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('deslocamento', 'extras')),
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  data_quitacao date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'estornado')),
  observacao text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  estornado_em timestamptz,
  estornado_por text,
  CHECK ((status = 'estornado') = (estornado_em IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS custos_operacionais_movimentos_obrigacao_idx
  ON public.custos_operacionais_movimentos (obrigacao_id, status);
CREATE INDEX IF NOT EXISTS custos_operacionais_movimentos_data_idx
  ON public.custos_operacionais_movimentos (data_quitacao)
  WHERE status = 'ativo';

-- Evento criado depois da migration nunca nasce LEGADO, qualquer que seja o caminho de criacao.
CREATE OR REPLACE FUNCTION public.custos_operacionais_inicializar_evento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  item record;
  obrigacao text;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('deslocamento', COALESCE(NEW.deslocamento, 0)),
      ('extras', COALESCE(NEW.extras, 0))
    ) AS custos(tipo, valor)
  LOOP
    obrigacao := 'custo-op-' || md5(NEW.id || ':' || item.tipo);
    INSERT INTO public.custos_operacionais_evento (id, evento_id, tipo, situacao, valor_quitado, data_quitacao, origem)
    VALUES (
      obrigacao, NEW.id, item.tipo,
      CASE WHEN item.valor > 0 THEN 'PENDENTE' ELSE 'NAO_INFORMADO' END,
      0, NULL, 'evento_novo'
    )
    ON CONFLICT (evento_id, tipo) DO NOTHING;
    INSERT INTO public.custos_operacionais_historico (
      id, obrigacao_id, evento_id, tipo, acao, situacao_anterior, situacao_nova, valor_previsto_snapshot
    ) VALUES (
      'custo-op-hist-' || md5(NEW.id || ':' || item.tipo || ':novo'), obrigacao, NEW.id, item.tipo,
      CASE WHEN item.valor > 0 THEN 'CADASTRO' ELSE 'INICIALIZACAO' END, NULL,
      CASE WHEN item.valor > 0 THEN 'PENDENTE' ELSE 'NAO_INFORMADO' END,
      GREATEST(item.valor, 0)
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eventos_inicializar_custos_operacionais ON public.eventos;
CREATE TRIGGER eventos_inicializar_custos_operacionais
  AFTER INSERT ON public.eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.custos_operacionais_inicializar_evento();

-- status_pagamento e o estado oficial; pagamentos_escala_colaborador e a movimentacao com data civil.
ALTER TABLE public.pagamentos_escala_colaborador
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por text;
ALTER TABLE public.pagamentos_escala_colaborador
  ALTER COLUMN data_pagamento SET DEFAULT ((now() AT TIME ZONE 'America/Recife')::date::timestamp);

CREATE TABLE IF NOT EXISTS public.escala_pagamento_historico (
  id text PRIMARY KEY,
  escala_evento_id text NOT NULL,
  evento_id text,
  acao text NOT NULL,
  status_anterior text,
  status_novo text,
  pagamento_id text,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  data_pagamento date,
  origem text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS escala_pagamento_historico_escala_idx
  ON public.escala_pagamento_historico (escala_evento_id, created_at DESC);

-- Ciclo travado e fotografia historica: o snapshot guarda a composicao usada no fechamento.
ALTER TABLE public.ciclos_financeiros
  ADD COLUMN IF NOT EXISTS custo_quitado numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_versao integer,
  ADD COLUMN IF NOT EXISTS travado_em timestamptz,
  ADD COLUMN IF NOT EXISTS travado_por text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.ciclos_financeiros
  DROP CONSTRAINT IF EXISTS ciclos_financeiros_snapshot_versao_check;
ALTER TABLE public.ciclos_financeiros
  ADD CONSTRAINT ciclos_financeiros_snapshot_versao_check
  CHECK (snapshot IS NULL OR snapshot_versao IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.ciclos_financeiros_historico (
  id text PRIMARY KEY,
  ciclo_id text NOT NULL,
  ano integer NOT NULL,
  mes integer NOT NULL,
  tipo text NOT NULL,
  acao text NOT NULL CHECK (acao IN ('TRAVAMENTO', 'DESTRAVAMENTO')),
  registro jsonb NOT NULL,
  motivo text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ciclos_financeiros_historico_ciclo_idx
  ON public.ciclos_financeiros_historico (ciclo_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.ciclos_financeiros_proteger_travado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'travado' THEN
      RAISE EXCEPTION 'Ciclo financeiro travado nao pode ser excluido' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'travado' AND NEW.status = 'travado'
    AND (to_jsonb(OLD) - 'updated_at') IS DISTINCT FROM (to_jsonb(NEW) - 'updated_at') THEN
    RAISE EXCEPTION 'Ciclo financeiro travado e imutavel' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ciclos_financeiros_proteger_travado ON public.ciclos_financeiros;
CREATE TRIGGER ciclos_financeiros_proteger_travado
  BEFORE UPDATE OR DELETE ON public.ciclos_financeiros
  FOR EACH ROW
  EXECUTE FUNCTION public.ciclos_financeiros_proteger_travado();

-- Leitura financeira sem edicao usa o mesmo cadastro de usuarios.
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_perfil_check;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_perfil_check
  CHECK (perfil IN ('gestor', 'operador', 'financeiro_leitura'));
