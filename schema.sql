-- Estrutura do banco do projeto Cadastro Pokemon (PostgreSQL / Neon).
--
-- Aplicar com:  npm run migrate
-- O migrate é idempotente e NÃO destrutivo: só cria o que falta, nunca apaga
-- tabelas, colunas ou dados. Ele executa cada instrução (terminada em ponto e
-- vírgula) separadamente e ignora linhas de comentário iniciadas por dois hifens.
-- Por isso, aqui não devem existir blocos $$ ... $$ nem ponto e vírgula dentro de textos.

-- Baralho de Pokémon cadastrados (limite de 12 aplicado pela aplicação).
-- combatPower sem aspas vira "combatpower" no PostgreSQL (mesmo comportamento do esquema original).
CREATE TABLE IF NOT EXISTS baralho (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(50) NOT NULL,
    combatPower INT NOT NULL CHECK (combatPower >= 100),
    img TEXT NOT NULL,
    treinador VARCHAR(50) NOT NULL,
    tipos TEXT NOT NULL DEFAULT ''
);

-- Para bancos onde a tabela já existia sem a coluna de tipos (lista separada por vírgula, ex.: fire,flying).
ALTER TABLE baralho ADD COLUMN IF NOT EXISTS tipos TEXT NOT NULL DEFAULT '';

-- Um Pokémon só pode aparecer uma vez no baralho (sem diferenciar maiúsculas/minúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS baralho_nome_unico ON baralho (lower(nome));

-- Consulta de conferência (opcional, executar manualmente):
-- SELECT COUNT(*) AS total FROM baralho
