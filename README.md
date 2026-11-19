node -v
npm -v

npm init              --> inicia o node no projeto
npm install           --> inicia os pacotes
npm install dotenv    --> instala o pacote .env
npm start             --> inicia o servidor


npm run migrate       --> cria/confere a estrutura do banco (idempotente, não destrutivo)
npm test              --> testes automatizados (não usam o seu banco real)


BANCO DE DADOS (PostgreSQL no Neon, via HTTP)

Variáveis de ambiente (definir no arquivo .env, que não deve ser versionado):
  DATABASE_URL         obrigatória   string de conexão do banco (postgresql://...)
  PORT                 opcional      porta do servidor (padrão 3002)
  NEON_HTTP_ENDPOINT   opcional      só para testes/proxy local; normalmente não definir

Primeira execução:
  1. npm install
  2. definir DATABASE_URL no .env
  3. npm run migrate
  4. npm start   e abrir http://localhost:3002
  5. conferir a conexão: http://localhost:3002/api/saude

API (JSON)
  GET    /api/saude          estado da conexão com o banco
  GET    /api/baralho        lista o baralho (maior poder primeiro)
  POST   /api/baralho        cadastra {nome, treinador, poder, tipos, imagem} (limite de 12, sem nomes repetidos)
  GET    /api/baralho/:id    consulta um Pokémon
  PUT    /api/baralho/:id    atualiza treinador e/ou poder (PATCH também aceito)
  DELETE /api/baralho/:id    remove um Pokémon
