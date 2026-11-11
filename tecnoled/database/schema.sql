-- =====================================================================
-- TECNO LED — Esquema do banco de dados (MySQL 8.0+)
-- Uso:  npm run db:init      (ou)   mysql -u USUARIO -p NOME_DO_BANCO < database/schema.sql
-- O script é idempotente: pode ser executado novamente sem apagar dados.
-- Todos os horários são gravados em UTC (a aplicação força time_zone = '+00:00').
-- =====================================================================
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------
-- usuarios: clientes (CLIENTE) e administradores (ADMIN)
-- O primeiro ADMIN é criado apenas por "npm run criar-admin", nunca por cadastro público.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome              VARCHAR(120)    NOT NULL,
  empresa           VARCHAR(120)    NULL,
  documento         VARCHAR(14)     NULL COMMENT 'CPF (11) ou CNPJ (14), somente dígitos',
  email             VARCHAR(254)    NOT NULL COMMENT 'sempre em minúsculas',
  telefone          VARCHAR(13)    NOT NULL COMMENT 'somente dígitos, com DDD',
  senha_hash        VARCHAR(255)    NOT NULL COMMENT 'bcrypt',
  tipo_usuario      ENUM('ADMIN','CLIENTE') NOT NULL DEFAULT 'CLIENTE',
  ativo             TINYINT(1)      NOT NULL DEFAULT 1,
  aceite_termos_em  DATETIME        NULL,
  data_cadastro     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_atualizacao  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  KEY idx_usuarios_tipo (tipo_usuario),
  KEY idx_usuarios_documento (documento),
  KEY idx_usuarios_data_cadastro (data_cadastro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- sessoes: sessões de login persistidas no banco.
-- O cookie guarda um token aleatório; aqui fica somente o SHA-256 dele.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessoes (
  id            CHAR(64)        NOT NULL COMMENT 'SHA-256 (hex) do token do cookie',
  usuario_id    BIGINT UNSIGNED NOT NULL,
  csrf_token    CHAR(43)        NOT NULL,
  persistente   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1 = "permanecer conectado"',
  ip            VARCHAR(45)     NULL,
  user_agent    VARCHAR(255)    NULL,
  expiracao     DATETIME        NOT NULL,
  data_criacao  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sessoes_usuario (usuario_id),
  KEY idx_sessoes_expiracao (expiracao),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- recuperacao_senha: tokens de redefinição (somente o hash é armazenado)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recuperacao_senha (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id    BIGINT UNSIGNED NOT NULL,
  token_hash    CHAR(64)        NOT NULL COMMENT 'SHA-256 (hex) do token enviado por e-mail',
  expiracao     DATETIME        NOT NULL,
  utilizado     TINYINT(1)      NOT NULL DEFAULT 0,
  ip            VARCHAR(45)     NULL,
  data_criacao  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recuperacao_token (token_hash),
  KEY idx_recuperacao_usuario (usuario_id),
  KEY idx_recuperacao_expiracao (expiracao),
  CONSTRAINT fk_recuperacao_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- tentativas_login: base da proteção contra força bruta
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tentativas_login (
  id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254)    NOT NULL,
  ip    VARCHAR(45)     NOT NULL,
  data  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tentativas_email (email, data),
  KEY idx_tentativas_ip (ip, data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- categorias e produtos (gerenciados no painel administrativo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug   VARCHAR(60)  NOT NULL,
  nome   VARCHAR(80)  NOT NULL,
  ordem  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS produtos (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug              VARCHAR(80)     NOT NULL COMMENT 'identificador usado na URL do site',
  nome              VARCHAR(120)    NOT NULL,
  descricao         TEXT            NOT NULL,
  categoria_id      INT UNSIGNED    NOT NULL,
  imagem            VARCHAR(255)    NULL COMMENT 'caminho (images/...) ou URL https',
  vantagens         JSON            NULL,
  aplicacoes        JSON            NULL,
  fotos_descricao   JSON            NULL,
  palavras_chave    VARCHAR(500)    NULL,
  ativo             TINYINT(1)      NOT NULL DEFAULT 1,
  data_cadastro     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_atualizacao  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_produtos_slug (slug),
  KEY idx_produtos_categoria (categoria_id),
  KEY idx_produtos_ativo (ativo),
  CONSTRAINT fk_produtos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- orcamentos: solicitações (usuario_id NULL = visitante sem conta)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orcamentos (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id         BIGINT UNSIGNED NULL,
  produto_id         BIGINT UNSIGNED NULL,
  produto_nome       VARCHAR(120)    NOT NULL COMMENT 'cópia do nome na data do pedido',
  mensagem           TEXT            NOT NULL,
  quantidade         INT UNSIGNED    NULL,
  status             ENUM('AGUARDANDO_ANALISE','EM_ANALISE','AGUARDANDO_CONTATO','ORCAMENTO_ENVIADO','APROVADO','RECUSADO')
                     NOT NULL DEFAULT 'AGUARDANDO_ANALISE',
  contato_nome       VARCHAR(120)    NOT NULL,
  contato_empresa    VARCHAR(120)    NULL,
  contato_email      VARCHAR(254)    NULL,
  contato_telefone   VARCHAR(13)     NOT NULL,
  contato_cidade     VARCHAR(80)     NOT NULL,
  nota_interna       TEXT            NULL COMMENT 'visível somente para administradores',
  data_solicitacao   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_atualizacao  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_orcamentos_usuario (usuario_id, data_solicitacao),
  KEY idx_orcamentos_produto (produto_id),
  KEY idx_orcamentos_status (status, data_solicitacao),
  CONSTRAINT fk_orcamentos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_orcamentos_produto FOREIGN KEY (produto_id) REFERENCES produtos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- orcamento_historico: linha do tempo de status (o cliente vê o campo "nota")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orcamento_historico (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orcamento_id     BIGINT UNSIGNED NOT NULL,
  status_anterior  VARCHAR(30)     NULL,
  status_novo      VARCHAR(30)     NOT NULL,
  nota             VARCHAR(1000)   NULL COMMENT 'mensagem da equipe, visível ao cliente',
  alterado_por     BIGINT UNSIGNED NULL,
  data             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_historico_orcamento (orcamento_id, data),
  CONSTRAINT fk_historico_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_historico_usuario   FOREIGN KEY (alterado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- configuracoes: informações comerciais editáveis no painel (WhatsApp, e-mail...)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracoes (
  chave             VARCHAR(40)  NOT NULL,
  valor             VARCHAR(500) NOT NULL DEFAULT '',
  data_atualizacao  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;