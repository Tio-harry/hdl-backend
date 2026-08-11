CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  identificador_interno TEXT UNIQUE,
  nome_contratante TEXT NOT NULL,
  local TEXT NOT NULL,
  data_evento TEXT NOT NULL,
  dia_semana TEXT,
  horario_inicio TEXT NOT NULL,
  horario_fim TEXT,
  horario_chegada TEXT,
  qtd_criancas TEXT,
  faixa_etaria TEXT,
  aniversariante TEXT,
  tema TEXT,
  espaco TEXT,
  servico_contratado TEXT NOT NULL,
  extras TEXT,
  itens_valores JSONB,
  valor_total NUMERIC(10,2),
  entrada NUMERIC(10,2),
  saldo NUMERIC(10,2),
  empresa_nome TEXT DEFAULT 'HORA DO LAZER',
  empresa_cnpj TEXT DEFAULT '17.403.980/0001-76',
  empresa_atendimento TEXT DEFAULT 'Atendimento Recife - PE',
  empresa_contato TEXT DEFAULT '(81) 99761-7476',
  cidade_emissao TEXT DEFAULT 'Recife – Pernambuco',
  data_emissao TEXT,
  texto_original TEXT,
  pdf_filename TEXT,
  data_geracao TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orcamentos (
  id TEXT PRIMARY KEY,
  nome_cliente TEXT,
  local TEXT,
  data_evento TEXT,
  horario_inicio TEXT,
  servico_contratado TEXT,
  descricao TEXT,
  observacoes TEXT,
  itens_valores JSONB,
  valor_total NUMERIC(10,2),
  entrada NUMERIC(10,2),
  saldo NUMERIC(10,2),
  status TEXT DEFAULT 'Em aberto',
  texto_original TEXT,
  dados JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eventos (
  id TEXT PRIMARY KEY,
  contract_id TEXT REFERENCES contracts(id) ON DELETE CASCADE,
  identificador_interno TEXT,
  contratante_nome TEXT NOT NULL,
  endereco_evento TEXT,
  cidade TEXT,
  bairro TEXT,
  data_evento TEXT NOT NULL,
  dia_semana TEXT,
  hora_inicio TEXT,
  hora_fim TEXT,
  servico_contratado TEXT,
  servicos_adicionais TEXT,
  qtd_recreadores INTEGER DEFAULT 0,
  detalhes_evento TEXT,
  valor_total NUMERIC(10,2),
  sinal NUMERIC(10,2) DEFAULT 0,
  sinal_confirmado BOOLEAN DEFAULT FALSE,
  metodo_pagamento_sinal TEXT,
  saldo_pago NUMERIC(10,2) DEFAULT 0,
  saldo_confirmado BOOLEAN DEFAULT FALSE,
  metodo_pagamento_saldo TEXT,
  resta NUMERIC(10,2),
  dt_pagamento_sinal TEXT,
  dt_pagamento_saldo TEXT,
  status_aceite_praca TEXT DEFAULT 'Pendente Recife',
  pagamento_colaborador NUMERIC(10,2) DEFAULT 0,
  deslocamento NUMERIC(10,2) DEFAULT 0,
  extras NUMERIC(10,2) DEFAULT 0,
  custo_total NUMERIC(10,2),
  lucro_evento NUMERIC(10,2),
  status_financeiro TEXT DEFAULT 'Em andamento',
  pagamento_pos_evento BOOLEAN DEFAULT FALSE,
  dt_prevista_pagamento TEXT,
  checklist JSONB,
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE escala_eventos (
  id TEXT PRIMARY KEY,
  evento_id TEXT REFERENCES eventos(id) ON DELETE CASCADE,
  colaborador_id TEXT NOT NULL,
  colaborador_nome TEXT,
  id_recreador TEXT,
  valor_recreador NUMERIC(10,2),
  funcao TEXT DEFAULT 'Recreador',
  status_pagamento TEXT DEFAULT 'Pendente',
  status_aceite TEXT DEFAULT 'Pendente',
  observacao_escala TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE pagamentos_escala_colaborador (
  id TEXT PRIMARY KEY,
  escala_evento_id TEXT NOT NULL REFERENCES escala_eventos(id),
  evento_id TEXT NOT NULL REFERENCES eventos(id),
  colaborador_id TEXT NOT NULL REFERENCES colaboradores(id),
  tipo_pagamento TEXT NOT NULL DEFAULT 'adiantamento',
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  data_pagamento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pagamentos_escala_colaborador_escala_evento_id ON pagamentos_escala_colaborador (escala_evento_id);
CREATE INDEX idx_pagamentos_escala_colaborador_evento_id ON pagamentos_escala_colaborador (evento_id);
CREATE INDEX idx_pagamentos_escala_colaborador_colaborador_id ON pagamentos_escala_colaborador (colaborador_id);
CREATE INDEX idx_pagamentos_escala_colaborador_status ON pagamentos_escala_colaborador (status);

CREATE TABLE servico_eventos (
  id TEXT PRIMARY KEY,
  evento_id TEXT REFERENCES eventos(id) ON DELETE CASCADE,
  servico_id TEXT NOT NULL,
  servico_nome TEXT,
  status_aceite TEXT DEFAULT 'Pendente',
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ciclos_financeiros (
  id TEXT PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  data_inicio TEXT,
  data_fim TEXT,
  status TEXT DEFAULT 'aberto',
  total_recebido NUMERIC(10,2) DEFAULT 0,
  retencao_total NUMERIC(10,2) DEFAULT 0,
  caixa_livre NUMERIC(10,2) DEFAULT 0,
  cofrinho_gestor NUMERIC(10,2) DEFAULT 0,
  cofrinho_expansao NUMERIC(10,2) DEFAULT 0,
  cofrinho_reserva NUMERIC(10,2) DEFAULT 0,
  cofrinho_custos_fixos NUMERIC(10,2) DEFAULT 0,
  cofrinho_estoque NUMERIC(10,2) DEFAULT 0,
  qtd_eventos INTEGER DEFAULT 0,
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE colaboradores (
  id TEXT PRIMARY KEY,
  nome_colaborador TEXT NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE servicos (
  id TEXT PRIMARY KEY,
  nome_servico TEXT NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Textos rápidos do Gerador de Contrato (Fase 1)
CREATE TABLE regions (
  id TEXT PRIMARY KEY,
  nome_regiao TEXT NOT NULL,
  sigla_regiao TEXT,
  ativa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE valores_referencia_regiao (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  nome_servico_funcao TEXT NOT NULL,
  valor_referencia NUMERIC(10,2) NOT NULL DEFAULT 0,
  base_duracao TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE parcerias_colaborador (
  id TEXT PRIMARY KEY,
  colaborador_id TEXT NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  titulo_parceria TEXT NOT NULL,
  nome_servico_funcao TEXT,
  valor_referencia_especifico NUMERIC(10,2) NOT NULL DEFAULT 0,
  disponibilidade TEXT,
  prioridade_envio BOOLEAN NOT NULL DEFAULT FALSE,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE textos_rapidos_contrato (
  id TEXT PRIMARY KEY,
  nome_botao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  texto TEXT NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
