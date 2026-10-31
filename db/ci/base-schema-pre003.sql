-- Base do banco de teste do CI (SOMENTE ESTRUTURA, nenhum dado).
-- Origem: schema do banco hdl_db de producao ANTES da migration 003, extraido em 2026-10-30
-- do backup pre-migration com: pg_restore --schema-only --no-owner --no-privileges --no-comments.
-- Os testes aplicam as migrations 001-003 por cima, como na producao. Usado apenas em PostgreSQL descartavel.
-- Se o schema base mudar (migration futura), gere uma nova base e atualize este arquivo.

--
-- PostgreSQL database dump
--

\restrict DOcx82KT6g1S37nkIEUk7FpPv64l5q9UnHNBvclzNBKxFiAqlmD9CrDWJauOcfW

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ciclos_financeiros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ciclos_financeiros (
    id text NOT NULL,
    ano integer NOT NULL,
    mes integer NOT NULL,
    tipo text NOT NULL,
    data_inicio text,
    data_fim text,
    status text DEFAULT 'aberto'::text,
    total_recebido numeric(10,2) DEFAULT 0,
    retencao_total numeric(10,2) DEFAULT 0,
    caixa_livre numeric(10,2) DEFAULT 0,
    cofrinho_gestor numeric(10,2) DEFAULT 0,
    cofrinho_expansao numeric(10,2) DEFAULT 0,
    cofrinho_reserva numeric(10,2) DEFAULT 0,
    cofrinho_custos_fixos numeric(10,2) DEFAULT 0,
    cofrinho_estoque numeric(10,2) DEFAULT 0,
    qtd_eventos integer DEFAULT 0,
    observacoes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: cofrinhos_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cofrinhos_config (
    key text NOT NULL,
    nome text NOT NULL,
    percentual numeric(10,4) DEFAULT 0 NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: colaborador_item_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.colaborador_item_catalog (
    id text NOT NULL,
    colaborador_id text NOT NULL,
    item_catalog_id text NOT NULL,
    quantidade integer,
    descricao_complementar text,
    data_entrega date,
    status_item text,
    observacoes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    data_envio date
);


--
-- Name: colaborador_perfil_equipe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.colaborador_perfil_equipe (
    colaborador_id text NOT NULL,
    region_id text,
    id_recreador text,
    ativo_na_equipe boolean DEFAULT true,
    cpf text,
    rg text,
    telefone_contato text,
    telefone_recado text,
    instagram text,
    cep text,
    rua text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    estado text,
    endereco_completo text,
    quantidade_fardas integer,
    material_proprio boolean DEFAULT false,
    possui_materiais_extras boolean DEFAULT false,
    descricao_materiais_extras text,
    nivel_recreacao text,
    nivel_pintura_pele text,
    nivel_escultura_baloes text,
    habilidade_veste_personagem boolean DEFAULT false,
    habilidade_faz_locucao boolean DEFAULT false,
    habilidade_animador_promocional boolean DEFAULT false,
    diferenciais text,
    observacoes text,
    observacoes_gerais text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    pix_tipo text,
    pix_chave text,
    nome_completo text,
    email text
);


--
-- Name: colaboradores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.colaboradores (
    id text NOT NULL,
    nome_colaborador text NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    id_recreador text
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id text NOT NULL,
    identificador_interno text,
    nome_contratante text NOT NULL,
    local text NOT NULL,
    data_evento text NOT NULL,
    dia_semana text,
    horario_inicio text NOT NULL,
    horario_fim text,
    horario_chegada text,
    qtd_criancas text,
    faixa_etaria text,
    aniversariante text,
    tema text,
    espaco text,
    servico_contratado text NOT NULL,
    extras text,
    itens_valores jsonb,
    valor_total numeric(10,2),
    entrada numeric(10,2),
    saldo numeric(10,2),
    empresa_nome text DEFAULT 'HORA DO LAZER'::text,
    empresa_cnpj text DEFAULT '17.403.980/0001-76'::text,
    empresa_atendimento text DEFAULT 'Atendimento Recife - PE'::text,
    empresa_contato text DEFAULT '(81) 99761-7476'::text,
    cidade_emissao text DEFAULT 'Recife – Pernambuco'::text,
    data_emissao text,
    texto_original text,
    pdf_filename text,
    data_geracao text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    contato_contratante text,
    servico_principal_id text
);


--
-- Name: escala_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escala_eventos (
    id text NOT NULL,
    evento_id text,
    colaborador_id text NOT NULL,
    colaborador_nome text,
    funcao text DEFAULT 'Recreador'::text,
    status_pagamento text DEFAULT 'Pendente'::text,
    status_aceite text DEFAULT 'Pendente'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    id_recreador text,
    valor_recreador numeric(10,2),
    observacao_escala text
);


--
-- Name: evento_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evento_logs (
    id text NOT NULL,
    evento_id text NOT NULL,
    tipo text DEFAULT 'manual'::text,
    descricao text NOT NULL,
    autor text,
    created_by text,
    metadata jsonb,
    created_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos (
    id text NOT NULL,
    contract_id text,
    identificador_interno text,
    contratante_nome text NOT NULL,
    endereco_evento text,
    cidade text,
    bairro text,
    data_evento text NOT NULL,
    dia_semana text,
    hora_inicio text,
    hora_fim text,
    servico_contratado text,
    servicos_adicionais text,
    qtd_recreadores integer DEFAULT 0,
    detalhes_evento text,
    valor_total numeric(10,2),
    sinal numeric(10,2) DEFAULT 0,
    sinal_confirmado boolean DEFAULT false,
    metodo_pagamento_sinal text,
    saldo_pago numeric(10,2) DEFAULT 0,
    metodo_pagamento_saldo text,
    resta numeric(10,2),
    dt_pagamento_sinal text,
    dt_pagamento_saldo text,
    status_aceite_praca text DEFAULT 'Pendente Recife'::text,
    pagamento_colaborador numeric(10,2) DEFAULT 0,
    deslocamento numeric(10,2) DEFAULT 0,
    extras numeric(10,2) DEFAULT 0,
    custo_total numeric(10,2),
    lucro_evento numeric(10,2),
    status_financeiro text DEFAULT 'Em andamento'::text,
    checklist jsonb,
    observacoes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    pagamento_pos_evento boolean DEFAULT false,
    dt_prevista_pagamento text,
    saldo_confirmado boolean DEFAULT false,
    servico_principal_id text
);


--
-- Name: funcoes_equipe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funcoes_equipe (
    id text NOT NULL,
    nome text NOT NULL,
    nome_normalizado text GENERATED ALWAYS AS (lower(regexp_replace(TRIM(BOTH FROM nome), '\s+'::text, ' '::text, 'g'::text))) STORED,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT funcoes_equipe_nome_check CHECK ((length(TRIM(BOTH FROM nome)) >= 1)),
    CONSTRAINT funcoes_equipe_ordem_check CHECK ((ordem >= 0))
);


--
-- Name: item_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_catalog (
    id text NOT NULL,
    nome_item text NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    categoria text,
    descricao text,
    quantidade_total integer,
    natureza_item text,
    quantidade_consumida_acumulada integer DEFAULT 0 NOT NULL
);


--
-- Name: natal_operacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.natal_operacoes (
    id text NOT NULL,
    ano integer NOT NULL,
    margem_minutos integer DEFAULT 10 NOT NULL,
    observacao text DEFAULT ''::text NOT NULL,
    versao integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT natal_operacoes_ano_check CHECK (((ano >= 2000) AND (ano <= 2100))),
    CONSTRAINT natal_operacoes_margem_minutos_check CHECK (((margem_minutos >= 0) AND (margem_minutos <= 1440)))
);


--
-- Name: natal_rotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.natal_rotas (
    id text NOT NULL,
    operacao_id text NOT NULL,
    nome text NOT NULL,
    ordem integer NOT NULL,
    CONSTRAINT natal_rotas_nome_check CHECK (((length(TRIM(BOTH FROM nome)) >= 1) AND (length(TRIM(BOTH FROM nome)) <= 100))),
    CONSTRAINT natal_rotas_ordem_check CHECK ((ordem >= 0))
);


--
-- Name: natal_visitas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.natal_visitas (
    evento_id text NOT NULL,
    operacao_id text NOT NULL,
    rota_id text,
    posicao integer NOT NULL,
    observacao text DEFAULT ''::text NOT NULL,
    deslocamento_minutos integer,
    margem_minutos integer,
    CONSTRAINT natal_visitas_deslocamento_minutos_check CHECK (((deslocamento_minutos >= 0) AND (deslocamento_minutos <= 1440))),
    CONSTRAINT natal_visitas_margem_minutos_check CHECK (((margem_minutos >= 0) AND (margem_minutos <= 1440))),
    CONSTRAINT natal_visitas_posicao_check CHECK ((posicao >= 0))
);


--
-- Name: orcamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orcamentos (
    id text NOT NULL,
    nome_cliente text,
    local text,
    data_evento text,
    horario_inicio text,
    servico_contratado text,
    descricao text,
    observacoes text,
    itens_valores jsonb,
    valor_total numeric(10,2),
    entrada numeric(10,2),
    saldo numeric(10,2),
    status text DEFAULT 'Em aberto'::text,
    texto_original text,
    dados jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pagamentos_escala_colaborador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagamentos_escala_colaborador (
    id text NOT NULL,
    escala_evento_id text NOT NULL,
    evento_id text NOT NULL,
    colaborador_id text NOT NULL,
    tipo_pagamento text DEFAULT 'adiantamento'::text NOT NULL,
    valor numeric(10,2) DEFAULT 0 NOT NULL,
    data_pagamento timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    observacao text,
    status text DEFAULT 'ativo'::text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: parcerias_colaborador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parcerias_colaborador (
    id text NOT NULL,
    colaborador_id text NOT NULL,
    region_id text,
    titulo_parceria text NOT NULL,
    nome_servico_funcao text,
    valor_referencia_especifico numeric(10,2) DEFAULT 0 NOT NULL,
    disponibilidade text,
    prioridade_envio boolean DEFAULT false NOT NULL,
    observacoes text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id text NOT NULL,
    usuario_id text NOT NULL,
    token_hash text NOT NULL,
    expira_em timestamp without time zone NOT NULL,
    usado_em timestamp without time zone,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip text,
    user_agent text
);


--
-- Name: recibos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recibos (
    id text NOT NULL,
    numero_recibo integer,
    data_emissao text,
    valor numeric(10,2),
    valor_extenso text,
    forma_pagamento text,
    data_recebimento text,
    nome_pagante text,
    cpf_cnpj text,
    telefone text,
    referente text,
    data_evento text,
    cidade_emissao text,
    descricao_servico text,
    observacoes text,
    texto_original text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: recreator_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recreator_items (
    id text NOT NULL,
    recreator_id text NOT NULL,
    item_catalog_id text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: recreators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recreators (
    id text NOT NULL,
    region_id text,
    nome_recreador text NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regions (
    id text NOT NULL,
    nome_regiao text NOT NULL,
    ativa boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    sigla_regiao text
);


--
-- Name: servico_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servico_eventos (
    id text NOT NULL,
    evento_id text,
    servico_id text NOT NULL,
    servico_nome text,
    status_aceite text DEFAULT 'Pendente'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    valor numeric(10,2),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    quantidade integer DEFAULT 1 NOT NULL,
    CONSTRAINT servico_eventos_quantidade_check CHECK ((quantidade >= 1))
);


--
-- Name: servico_material_requisito; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servico_material_requisito (
    id text NOT NULL,
    servico_id text NOT NULL,
    item_catalog_id text NOT NULL,
    quantidade_min integer DEFAULT 1 NOT NULL,
    obrigatorio boolean DEFAULT true NOT NULL,
    observacao text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: servicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicos (
    id text NOT NULL,
    nome_servico text NOT NULL,
    ativo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    codigo_operacional text
);


--
-- Name: sessoes_usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessoes_usuario (
    id text NOT NULL,
    usuario_id text NOT NULL,
    token_hash text NOT NULL,
    expira_em timestamp without time zone NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ultimo_acesso_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_agent text,
    ip text,
    revogada_em timestamp without time zone
);


--
-- Name: textos_rapidos_contrato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.textos_rapidos_contrato (
    id text NOT NULL,
    nome_botao text NOT NULL,
    categoria text NOT NULL,
    texto text NOT NULL,
    ativo boolean DEFAULT true,
    ordem integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id text NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    senha_hash text NOT NULL,
    perfil text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ultimo_login_em timestamp without time zone,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT usuarios_perfil_check CHECK ((perfil = ANY (ARRAY['gestor'::text, 'operador'::text])))
);


--
-- Name: valores_referencia_regiao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.valores_referencia_regiao (
    id text NOT NULL,
    region_id text NOT NULL,
    nome_servico_funcao text NOT NULL,
    valor_referencia numeric(10,2) DEFAULT 0 NOT NULL,
    base_duracao text,
    observacoes text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: ciclos_financeiros ciclos_financeiros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciclos_financeiros
    ADD CONSTRAINT ciclos_financeiros_pkey PRIMARY KEY (id);


--
-- Name: cofrinhos_config cofrinhos_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cofrinhos_config
    ADD CONSTRAINT cofrinhos_config_pkey PRIMARY KEY (key);


--
-- Name: colaborador_item_catalog colaborador_item_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaborador_item_catalog
    ADD CONSTRAINT colaborador_item_catalog_pkey PRIMARY KEY (id);


--
-- Name: colaborador_perfil_equipe colaborador_perfil_equipe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaborador_perfil_equipe
    ADD CONSTRAINT colaborador_perfil_equipe_pkey PRIMARY KEY (colaborador_id);


--
-- Name: colaboradores colaboradores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaboradores
    ADD CONSTRAINT colaboradores_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_identificador_interno_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_identificador_interno_key UNIQUE (identificador_interno);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: escala_eventos escala_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_eventos
    ADD CONSTRAINT escala_eventos_pkey PRIMARY KEY (id);


--
-- Name: evento_logs evento_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evento_logs
    ADD CONSTRAINT evento_logs_pkey PRIMARY KEY (id);


--
-- Name: eventos eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_pkey PRIMARY KEY (id);


--
-- Name: funcoes_equipe funcoes_equipe_nome_normalizado_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcoes_equipe
    ADD CONSTRAINT funcoes_equipe_nome_normalizado_key UNIQUE (nome_normalizado);


--
-- Name: funcoes_equipe funcoes_equipe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funcoes_equipe
    ADD CONSTRAINT funcoes_equipe_pkey PRIMARY KEY (id);


--
-- Name: item_catalog item_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_catalog
    ADD CONSTRAINT item_catalog_pkey PRIMARY KEY (id);


--
-- Name: natal_operacoes natal_operacoes_ano_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.natal_operacoes
    ADD CONSTRAINT natal_operacoes_ano_key UNIQUE (ano);


--
-- Name: natal_operacoes natal_operacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.natal_operacoes
    ADD CONSTRAINT natal_operacoes_pkey PRIMARY KEY (id);


--
-- Name: natal_rotas natal_rotas_id_operacao_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.natal_rotas
    ADD CONSTRAINT natal_rotas_id_operacao_id_key UNIQUE (id, operacao_id);


--
-- Name: natal_rotas natal_rotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.natal_rotas
    ADD CONSTRAINT natal_rotas_pkey PRIMARY KEY (id);


--
-- Name: natal_visitas natal_visitas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.natal_visitas
    ADD CONSTRAINT natal_visitas_pkey PRIMARY KEY (evento_id);


--
-- Name: orcamentos orcamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orcamentos
    ADD CONSTRAINT orcamentos_pkey PRIMARY KEY (id);


--
-- Name: pagamentos_escala_colaborador pagamentos_escala_colaborador_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_escala_colaborador
    ADD CONSTRAINT pagamentos_escala_colaborador_pkey PRIMARY KEY (id);


--
-- Name: parcerias_colaborador parcerias_colaborador_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcerias_colaborador
    ADD CONSTRAINT parcerias_colaborador_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: recibos recibos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recibos
    ADD CONSTRAINT recibos_pkey PRIMARY KEY (id);


--
-- Name: recreator_items recreator_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recreator_items
    ADD CONSTRAINT recreator_items_pkey PRIMARY KEY (id);


--
-- Name: recreators recreators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recreators
    ADD CONSTRAINT recreators_pkey PRIMARY KEY (id);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);


--
-- Name: servico_eventos servico_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servico_eventos
    ADD CONSTRAINT servico_eventos_pkey PRIMARY KEY (id);


--
-- Name: servico_material_requisito servico_material_requisito_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servico_material_requisito
    ADD CONSTRAINT servico_material_requisito_pkey PRIMARY KEY (id);


--
-- Name: servicos servicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos
    ADD CONSTRAINT servicos_pkey PRIMARY KEY (id);


--
-- Name: sessoes_usuario sessoes_usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessoes_usuario
    ADD CONSTRAINT sessoes_usuario_pkey PRIMARY KEY (id);


--
-- Name: sessoes_usuario sessoes_usuario_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessoes_usuario
    ADD CONSTRAINT sessoes_usuario_token_hash_key UNIQUE (token_hash);


--
-- Name: textos_rapidos_contrato textos_rapidos_contrato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.textos_rapidos_contrato
    ADD CONSTRAINT textos_rapidos_contrato_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: valores_referencia_regiao valores_referencia_regiao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valores_referencia_regiao
    ADD CONSTRAINT valores_referencia_regiao_pkey PRIMARY KEY (id);


--
-- Name: ciclos_financeiros_ano_mes_tipo_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ciclos_financeiros_ano_mes_tipo_unique ON public.ciclos_financeiros USING btree (ano, mes, tipo);


--
-- Name: colaborador_perfil_equipe_region_id_recreador_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX colaborador_perfil_equipe_region_id_recreador_uq ON public.colaborador_perfil_equipe USING btree (region_id, id_recreador) WHERE ((id_recreador IS NOT NULL) AND (region_id IS NOT NULL));


--
-- Name: eventos_servico_principal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eventos_servico_principal_idx ON public.eventos USING btree (servico_principal_id);


--
-- Name: funcoes_equipe_ativo_ordem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX funcoes_equipe_ativo_ordem_idx ON public.funcoes_equipe USING btree (ativo, ordem, id);


--
-- Name: idx_pagamentos_escala_colaborador_colaborador_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagamentos_escala_colaborador_colaborador_id ON public.pagamentos_escala_colaborador USING btree (colaborador_id);


--
-- Name: idx_pagamentos_escala_colaborador_escala_evento_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagamentos_escala_colaborador_escala_evento_id ON public.pagamentos_escala_colaborador USING btree (escala_evento_id);


--
-- Name: idx_pagamentos_escala_colaborador_evento_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagamentos_escala_colaborador_evento_id ON public.pagamentos_escala_colaborador USING btree (evento_id);


--
-- Name: idx_pagamentos_escala_colaborador_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagamentos_escala_colaborador_status ON public.pagamentos_escala_colaborador USING btree (status);


--
-- Name: idx_parcerias_colaborador_colaborador_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parcerias_colaborador_colaborador_id ON public.parcerias_colaborador USING btree (colaborador_id);


--
-- Name: idx_parcerias_colaborador_region_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parcerias_colaborador_region_id ON public.parcerias_colaborador USING btree (region_id);


--
-- Name: idx_password_reset_tokens_expira_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_expira_em ON public.password_reset_tokens USING btree (expira_em);


--
-- Name: idx_password_reset_tokens_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_usuario_id ON public.password_reset_tokens USING btree (usuario_id);


--
-- Name: idx_sessoes_usuario_expira_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessoes_usuario_expira_em ON public.sessoes_usuario USING btree (expira_em);


--
-- Name: idx_sessoes_usuario_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessoes_usuario_usuario_id ON public.sessoes_usuario USING btree (usuario_id);


--
-- Name: idx_valores_referencia_regiao_region_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_valores_referencia_regiao_region_id ON public.valores_referencia_regiao USING btree (region_id);


--
-- Name: natal_visitas_operacao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX natal_visitas_operacao_idx ON public.natal_visitas USING btree (operacao_id);


--
-- Name: servicos_codigo_operacional_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX servicos_codigo_operacional_unico ON public.servicos USING btree (codigo_operacional) WHERE (codigo_operacional IS NOT NULL);


--
-- Name: colaborador_item_catalog colaborador_item_catalog_colaborador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaborador_item_catalog
    ADD CONSTRAINT colaborador_item_catalog_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id) ON DELETE CASCADE;


--
-- Name: colaborador_item_catalog colaborador_item_catalog_item_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaborador_item_catalog
    ADD CONSTRAINT colaborador_item_catalog_item_catalog_id_fkey FOREIGN KEY (item_catalog_id) REFERENCES public.item_catalog(id) ON DELETE CASCADE;


--
-- Name: colaborador_perfil_equipe colaborador_perfil_equipe_colaborador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaborador_perfil_equipe
    ADD CONSTRAINT colaborador_perfil_equipe_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id) ON DELETE CASCADE;


--
-- Name: colaborador_perfil_equipe colaborador_perfil_equipe_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.colaborador_perfil_equipe
    ADD CONSTRAINT colaborador_perfil_equipe_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_servico_principal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_servico_principal_id_fkey FOREIGN KEY (servico_principal_id) REFERENCES public.servicos(id);


--
-- Name: escala_eventos escala_eventos_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escala_eventos
    ADD CONSTRAINT escala_eventos_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id) ON DELETE CASCADE;


--
-- Name: eventos eventos_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: eventos eventos_servico_principal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_servico_principal_id_fkey FOREIGN KEY (servico_principal_id) REFERENCES public.servicos(id);


--
-- Name: natal_rotas natal_rotas_operacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.natal_rotas
    ADD CONSTRAINT natal_rotas_operacao_id_fkey FOREIGN KEY (operacao_id) REFERENCES public.natal_operacoes(id);


--
-- Name: natal_visitas natal_visitas_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.natal_visitas
    ADD CONSTRAINT natal_visitas_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id) ON DELETE CASCADE;


--
-- Name: natal_visitas natal_visitas_operacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.natal_visitas
    ADD CONSTRAINT natal_visitas_operacao_id_fkey FOREIGN KEY (operacao_id) REFERENCES public.natal_operacoes(id);


--
-- Name: natal_visitas natal_visitas_rota_id_operacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.natal_visitas
    ADD CONSTRAINT natal_visitas_rota_id_operacao_id_fkey FOREIGN KEY (rota_id, operacao_id) REFERENCES public.natal_rotas(id, operacao_id);


--
-- Name: pagamentos_escala_colaborador pagamentos_escala_colaborador_colaborador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_escala_colaborador
    ADD CONSTRAINT pagamentos_escala_colaborador_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id);


--
-- Name: pagamentos_escala_colaborador pagamentos_escala_colaborador_escala_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_escala_colaborador
    ADD CONSTRAINT pagamentos_escala_colaborador_escala_evento_id_fkey FOREIGN KEY (escala_evento_id) REFERENCES public.escala_eventos(id);


--
-- Name: pagamentos_escala_colaborador pagamentos_escala_colaborador_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagamentos_escala_colaborador
    ADD CONSTRAINT pagamentos_escala_colaborador_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id);


--
-- Name: parcerias_colaborador parcerias_colaborador_colaborador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcerias_colaborador
    ADD CONSTRAINT parcerias_colaborador_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id) ON DELETE CASCADE;


--
-- Name: parcerias_colaborador parcerias_colaborador_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcerias_colaborador
    ADD CONSTRAINT parcerias_colaborador_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;


--
-- Name: password_reset_tokens password_reset_tokens_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: recreator_items recreator_items_item_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recreator_items
    ADD CONSTRAINT recreator_items_item_catalog_id_fkey FOREIGN KEY (item_catalog_id) REFERENCES public.item_catalog(id) ON DELETE CASCADE;


--
-- Name: recreator_items recreator_items_recreator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recreator_items
    ADD CONSTRAINT recreator_items_recreator_id_fkey FOREIGN KEY (recreator_id) REFERENCES public.recreators(id) ON DELETE CASCADE;


--
-- Name: recreators recreators_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recreators
    ADD CONSTRAINT recreators_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;


--
-- Name: servico_eventos servico_eventos_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servico_eventos
    ADD CONSTRAINT servico_eventos_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.eventos(id) ON DELETE CASCADE;


--
-- Name: servico_material_requisito servico_material_requisito_item_catalog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servico_material_requisito
    ADD CONSTRAINT servico_material_requisito_item_catalog_id_fkey FOREIGN KEY (item_catalog_id) REFERENCES public.item_catalog(id) ON DELETE CASCADE;


--
-- Name: servico_material_requisito servico_material_requisito_servico_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servico_material_requisito
    ADD CONSTRAINT servico_material_requisito_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES public.servicos(id) ON DELETE CASCADE;


--
-- Name: sessoes_usuario sessoes_usuario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessoes_usuario
    ADD CONSTRAINT sessoes_usuario_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: valores_referencia_regiao valores_referencia_regiao_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.valores_referencia_regiao
    ADD CONSTRAINT valores_referencia_regiao_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict DOcx82KT6g1S37nkIEUk7FpPv64l5q9UnHNBvclzNBKxFiAqlmD9CrDWJauOcfW
