-- =====================================================================
-- Bootstrap: cria os usuários (roles) e os bancos deste projeto dentro do
-- container PostgreSQL compartilhado com os Projetos 1 a 4.
--   :usuario, :senha        dono dos bancos (migrations e carga)
--   :banco                  banco principal (dados fictícios de vendas)
--   :banco_teste            banco dos testes (apagado e recriado pelo pytest)
--   :ia_usuario, :ia_senha  usuário SOMENTE LEITURA da IA (o que a API usa)
--
-- Roda como superusuário, uma vez (e pode rodar de novo sem quebrar nada).
-- Não use diretamente: o `python -m analista.bootstrap` lê o .env, valida os
-- valores e envia este arquivo ao psql com as variáveis já definidas.
--
-- Por que não é uma migração do Alembic: criar role e banco são operações
-- do servidor inteiro (exigem superusuário) e CREATE DATABASE não roda
-- dentro de transação. As migrações rodam depois, já como o dono, dentro
-- do banco dele.
--
-- Cada comando é montado com format(): %I cita identificadores e %L cita
-- literais (a senha), o que impede SQL injection pelas variáveis. O \gexec
-- executa cada linha resultante como um comando; o WHERE NOT EXISTS torna
-- tudo idempotente.
-- =====================================================================
\set ON_ERROR_STOP on

-- 0. Trava (container compartilhado com outros projetos): se um usuário com o nome
--    do .env já existe e é superusuário, ou é dono de bancos que não são deste
--    projeto, para tudo antes de alterar qualquer coisa. Sem isso, um nome repetido
--    trocaria a senha e os privilégios de um usuário de outro projeto.
SELECT format('DO $trava$ BEGIN RAISE EXCEPTION %L; END $trava$',
              'O usuário ' || r.rolname || ' já existe e é superusuário ou dono de outros '
              || 'bancos (' || coalesce(string_agg(d.datname, ', '), '') || '): '
              || 'escolha outro nome no .env.')
FROM pg_roles r
LEFT JOIN pg_database d
       ON d.datdba = r.oid AND d.datname NOT IN (:'banco', :'banco_teste')
WHERE r.rolname IN (:'usuario', :'ia_usuario')
GROUP BY r.rolname, r.rolsuper
HAVING r.rolsuper OR count(d.datname) > 0
\gexec

-- 1. Dono do projeto: pode logar, mas não é superusuário, não cria bancos, não
--    cria roles e não ignora regras de segurança de linha.
SELECT format('CREATE ROLE %I LOGIN', :'usuario')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'usuario')
\gexec

-- Sempre reaplica atributos e senha: se o role já existia, fica em sincronia com o
-- .env e sem privilégios extras.
SELECT format(
    'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    :'usuario', :'senha'
)
\gexec

-- 2. Bancos do projeto (principal e de testes), pertencentes ao dono.
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', b.nome, :'usuario', 'UTF8')
FROM unnest(ARRAY[:'banco', :'banco_teste']) AS b(nome)
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = b.nome)
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', b.nome, :'usuario')
FROM unnest(ARRAY[:'banco', :'banco_teste']) AS b(nome)
\gexec

-- 3. Fuso horário na origem (lição do Projeto 1): as lojas ficam em Recife. Toda
--    sessão nestes bancos enxerga datas e horas em America/Recife.
SELECT format('ALTER DATABASE %I SET timezone TO %L', b.nome, 'America/Recife')
FROM unnest(ARRAY[:'banco', :'banco_teste']) AS b(nome)
\gexec

-- 4. Por padrão o PostgreSQL deixa QUALQUER role conectar em qualquer banco e criar
--    tabelas temporárias nele (privilégios CONNECT e TEMP do PUBLIC). Aqui só o dono
--    conecta e, pelo passo 5, o grupo de leitura da IA (sem TEMP).
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', b.nome)
FROM unnest(ARRAY[:'banco', :'banco_teste']) AS b(nome)
\gexec

-- 5. Usuário da IA (menor privilégio). O grupo analista_leitura (sem login) recebe as
--    permissões nas migrações (SELECT só nas views do schema ia); o usuário de login da
--    IA é membro do grupo e não tem mais nada.
SELECT 'CREATE ROLE analista_leitura NOLOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analista_leitura')
\gexec

SELECT format('CREATE ROLE %I LOGIN', :'ia_usuario')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'ia_usuario')
\gexec

-- CONNECTION LIMIT: mesmo com um bug no pool da API, a IA nunca ocupa mais que 5
-- conexões do servidor compartilhado.
SELECT format(
    'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS '
    'CONNECTION LIMIT 5 PASSWORD %L',
    :'ia_usuario', :'ia_senha'
)
\gexec

-- Padrões de sessão do usuário da IA (camada 4 da defesa, D6). Valem em toda conexão
-- dele, mesmo que a API esqueça de configurar a sessão:
--   default_transaction_read_only: toda transação começa somente leitura;
--   statement_timeout: nenhuma consulta passa de 5 s (a API ainda baixa para 3 s);
--   idle_in_transaction_session_timeout: transação esquecida aberta cai em 10 s;
--   search_path: nomes sem schema procuram só no schema ia.
-- Atenção: o próprio usuário consegue mudar esses padrões com SET. Por isso eles são
-- uma camada a mais, e não a garantia: a garantia é ele só ter SELECT (passo 5 e
-- migrações).
SELECT format('ALTER ROLE %I SET default_transaction_read_only = on', :'ia_usuario')
\gexec
SELECT format('ALTER ROLE %I SET statement_timeout = %L', :'ia_usuario', '5s')
\gexec
SELECT format('ALTER ROLE %I SET idle_in_transaction_session_timeout = %L', :'ia_usuario', '10s')
\gexec
SELECT format('ALTER ROLE %I SET search_path = ia', :'ia_usuario')
\gexec

SELECT format('GRANT analista_leitura TO %I', :'ia_usuario')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO analista_leitura', b.nome)
FROM unnest(ARRAY[:'banco', :'banco_teste']) AS b(nome)
\gexec
