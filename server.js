'use strict'

require('dotenv').config({ quiet: true })

const http = require('http');
const fs = require('fs');
const path = require('path');

const db = require('./script_db.js');
const { ErroValidacao, validarId, validarNovoPokemon, validarAtualizacao } = require('./validacao.js');

const PORTA = process.env.PORT || 3002;
const LIMITE_CORPO_BYTES = 100 * 1024;

const arquivos = {
    '/': { arquivo: 'index.html', tipo: 'text/html; charset=utf-8' },
    '/index.html': { arquivo: 'index.html', tipo: 'text/html; charset=utf-8' },
    '/style.css': { arquivo: 'style.css', tipo: 'text/css; charset=utf-8' },
    '/script.js': { arquivo: 'script.js', tipo: 'text/javascript; charset=utf-8' }
};

class ErroRequisicao extends Error {
    constructor(status, mensagem) {
        super(mensagem);
        this.name = 'ErroRequisicao';
        this.status = status;
    }
}

function responderJSON(res, status, dados, cabecalhos = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...cabecalhos
    });
    res.end(JSON.stringify(dados));
}

function lerCorpo(req) {
    return new Promise((resolve, reject) => {
        const pedacos = [];
        let tamanho = 0;
        let excedeu = false;

        req.on('data', (pedaco) => {
            if (excedeu) {
                return;
            }
            tamanho += pedaco.length;
            if (tamanho > LIMITE_CORPO_BYTES) {
                excedeu = true;
                reject(new ErroRequisicao(413, 'Corpo da requisição grande demais.'));
                return;
            }
            pedacos.push(pedaco);
        });

        req.on('end', () => {
            if (excedeu) {
                return;
            }
            try {
                resolve(JSON.parse(Buffer.concat(pedacos).toString('utf8') || '{}'));
            } catch (erro) {
                reject(new ErroRequisicao(400, 'JSON inválido no corpo da requisição.'));
            }
        });

        req.on('error', reject);
    });
}

// Converte qualquer erro em resposta HTTP. Detalhes técnicos vão só para o log do
// servidor; o cliente recebe mensagens seguras (sem host, usuário ou credenciais).
function responderErro(res, erro) {
    if (erro instanceof ErroRequisicao) {
        return responderJSON(res, erro.status, { erro: erro.message });
    }

    if (erro instanceof ErroValidacao) {
        return responderJSON(res, 400, { erro: erro.message, detalhes: erro.detalhes });
    }

    if (erro instanceof db.ErroBanco) {
        switch (erro.tipo) {
            case 'NAO_ENCONTRADO':
                return responderJSON(res, 404, { erro: erro.message });
            case 'DUPLICADO':
                return responderJSON(res, 409, { erro: 'Este Pokémon já foi cadastrado!' });
            case 'LIMITE':
                return responderJSON(res, 409, { erro: erro.message });
            case 'CONFIG':
            case 'CONEXAO':
                console.error(`[banco] ${erro.tipo}: ${erro.message}`);
                return responderJSON(res, 503, { erro: 'Banco de dados indisponível no momento.' });
            default:
                console.error(`[banco] ${erro.tipo} (${erro.sqlState || 's/ código'}): ${erro.message}`);
                return responderJSON(res, 500, { erro: 'Falha ao acessar o banco de dados.' });
        }
    }

    console.error('[servidor] Erro inesperado:', erro && erro.stack ? erro.stack : erro);
    return responderJSON(res, 500, { erro: 'Erro interno do servidor.' });
}

function metodoNaoPermitido(res, permitidos) {
    return responderJSON(res, 405, { erro: 'Método não permitido.' }, { Allow: permitidos.join(', ') });
}

async function tratarApi(req, res, rota) {
    if (rota === '/api/saude') {
        if (req.method !== 'GET') {
            return metodoNaoPermitido(res, ['GET']);
        }
        const estado = await db.verificarBanco();
        return responderJSON(res, 200, { banco: 'ok', ...estado });
    }

    const correspondencia = rota.match(/^\/api\/baralho(?:\/([^/]+))?\/?$/);
    if (!correspondencia) {
        return responderJSON(res, 404, { erro: 'Rota não encontrada.' });
    }

    const idTexto = correspondencia[1];

    if (idTexto === undefined) {
        if (req.method === 'GET') {
            return responderJSON(res, 200, await db.listarBaralho());
        }
        if (req.method === 'POST') {
            const pokemon = validarNovoPokemon(await lerCorpo(req));
            return responderJSON(res, 201, await db.salvarPokemonBaralho(pokemon));
        }
        return metodoNaoPermitido(res, ['GET', 'POST']);
    }

    const id = validarId(idTexto);

    if (req.method === 'GET') {
        return responderJSON(res, 200, await db.buscarPokemonBaralho(id));
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
        const campos = validarAtualizacao(await lerCorpo(req));
        return responderJSON(res, 200, await db.atualizarPokemonBaralho(id, campos));
    }
    if (req.method === 'DELETE') {
        return responderJSON(res, 200, { ...(await db.removerPokemonBaralho(id)), removido: true });
    }
    return metodoNaoPermitido(res, ['GET', 'PUT', 'PATCH', 'DELETE']);
}

function criarServidor() {
    return http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const rota = url.pathname;

            if (rota === '/api' || rota.startsWith('/api/')) {
                return await tratarApi(req, res, rota);
            }

            const arquivo = arquivos[rota];
            if (arquivo) {
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                    return metodoNaoPermitido(res, ['GET', 'HEAD']);
                }
                const stream = fs.createReadStream(path.join(__dirname, arquivo.arquivo));
                stream.on('error', (erro) => {
                    console.error('[servidor] Falha ao ler arquivo estático:', erro.message);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                    }
                    res.end('Erro ao carregar o arquivo');
                });
                res.writeHead(200, { 'Content-Type': arquivo.tipo, 'X-Content-Type-Options': 'nosniff' });
                return req.method === 'HEAD' ? res.end() : stream.pipe(res);
            }

            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Página não encontrada');
        } catch (erro) {
            if (res.headersSent) {
                return res.end();
            }
            return responderErro(res, erro);
        }
    });
}

module.exports = { criarServidor };

if (require.main === module) {
    const servidor = criarServidor();

    servidor.listen(PORTA, () => {
        console.log(`Servidor rodando em http://localhost:${PORTA}`);

        // Diagnóstico explícito na partida: o servidor continua de pé mesmo sem banco
        // (a página é servida e a API responde 503), mas o problema nunca fica oculto.
        db.verificarBanco()
            .then(({ total, limite }) => console.log(`[banco] Conexão OK (${total}/${limite} Pokémon no baralho).`))
            .catch((erro) => console.error(`[banco] FALHA na verificação inicial (${erro.tipo || 'ERRO'}): ${erro.message}`));
    });

    // Encerramento limpo: o acesso ao banco é por HTTP (sem conexões abertas), basta fechar o servidor.
    const encerrar = (sinal) => {
        console.log(`\nRecebido ${sinal}, encerrando servidor...`);
        servidor.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on('SIGINT', () => encerrar('SIGINT'));
    process.on('SIGTERM', () => encerrar('SIGTERM'));
}
