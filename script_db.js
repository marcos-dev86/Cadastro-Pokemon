'use strict'

// Camada de acesso a dados do baralho (PostgreSQL no Neon, via endpoint HTTP /sql).
//
// O Neon expõe o Postgres por HTTP: cada chamada é independente (sem conexão
// persistente), por isso não existe pool a configurar nem conexão a encerrar.
// Variáveis de ambiente usadas (somente os NOMES são documentados):
//   DATABASE_URL        (obrigatória) string de conexão postgresql://...
//   NEON_HTTP_ENDPOINT  (opcional)    sobrescreve https://<host>/sql (uso em testes / proxy local)

require('dotenv').config({ quiet: true })

const LIMITE_BARALHO = 12
const TIMEOUT_REQUISICAO_MS = 20000
// Chave do advisory lock que serializa a inclusão no baralho (limite + duplicidade atômicos).
const CHAVE_LOCK_BARALHO = 7342001

// OIDs do Postgres que precisam ser convertidos de texto para número/booleano.
const OIDS_NUMERICOS = new Set([20, 21, 23, 26]) // int8, int2, int4, oid
const OID_BOOLEANO = 16

const COLUNAS_POKEMON = 'id, nome, combatPower AS poder, img AS imagem, treinador, tipos'

/**
 * Erro da camada de banco. `tipo` permite ao servidor escolher o status HTTP
 * sem depender do texto da mensagem:
 *   CONFIG | CONEXAO | ESTRUTURA | CONSULTA | NAO_ENCONTRADO | DUPLICADO | LIMITE
 */
class ErroBanco extends Error {
    constructor(tipo, mensagem, { sqlState = null, restricao = null } = {}) {
        super(mensagem)
        this.name = 'ErroBanco'
        this.tipo = tipo
        this.sqlState = sqlState
        this.restricao = restricao
    }
}

// Lê e valida a configuração a cada uso (permite testes e alteração de ambiente).
// IMPORTANTE: nunca incluir o valor de DATABASE_URL em mensagens ou logs; o objeto
// de erro do `new URL()` carrega a string original, por isso ele é descartado.
function obterConfiguracao() {
    const urlBruta = (process.env.DATABASE_URL || '').trim()

    if (!urlBruta) {
        throw new ErroBanco('CONFIG', 'Variável de ambiente DATABASE_URL não está definida.')
    }

    let url
    try {
        url = new URL(urlBruta)
    } catch (_) {
        throw new ErroBanco('CONFIG', 'DATABASE_URL não é uma URL válida (formato esperado: postgresql://usuario:senha@host/banco).')
    }

    const protocoloValido = url.protocol === 'postgresql:' || url.protocol === 'postgres:'
    if (!protocoloValido || !url.hostname || !url.username || url.pathname.length < 2) {
        throw new ErroBanco('CONFIG', 'DATABASE_URL fora do formato esperado (postgresql://usuario:senha@host/banco).')
    }

    const endpoint = (process.env.NEON_HTTP_ENDPOINT || '').trim() || `https://${url.host}/sql`
    return { urlConexao: urlBruta, endpoint }
}

// Remove do texto qualquer trecho que revele a string de conexão ou a senha
// (defesa em profundidade: textos de erro vindos do banco vão para o log do servidor).
function ocultarSegredos(texto, urlConexao) {
    let resultado = String(texto)
    const segredos = [urlConexao]
    try {
        const { password } = new URL(urlConexao)
        if (password) {
            segredos.push(password)
            segredos.push(decodeURIComponent(password))
        }
    } catch (_) { /* a URL já foi validada em obterConfiguracao */ }

    for (const segredo of segredos) {
        if (segredo) {
            resultado = resultado.split(segredo).join('***')
        }
    }
    return resultado
}

function classificarErroSql(corpo, urlConexao) {
    const sqlState = corpo.code || null
    const restricao = corpo.constraint || null
    const mensagem = ocultarSegredos(corpo.message || 'Erro ao executar a consulta.', urlConexao)

    if (sqlState === '23505') {
        return new ErroBanco('DUPLICADO', mensagem, { sqlState, restricao })
    }
    if (sqlState === '42P01' || sqlState === '42703') {
        return new ErroBanco('ESTRUTURA', `${mensagem} (a estrutura do banco difere da esperada: execute "npm run migrate")`, { sqlState })
    }
    // classes 08 (conexão), 28 (autenticação) e 57 (desligamento/cancelamento)
    if (sqlState && /^(08|28|57)/.test(sqlState)) {
        return new ErroBanco('CONEXAO', mensagem, { sqlState })
    }
    return new ErroBanco('CONSULTA', mensagem, { sqlState, restricao })
}

async function enviarAoNeon(corpo, cabecalhosExtras = {}) {
    const { urlConexao, endpoint } = obterConfiguracao()

    let resposta
    try {
        resposta = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Neon-Connection-String': urlConexao,
                'Neon-Raw-Text-Output': 'true',
                'Neon-Array-Mode': 'true',
                'Content-Type': 'application/json',
                ...cabecalhosExtras
            },
            body: JSON.stringify(corpo),
            signal: AbortSignal.timeout(TIMEOUT_REQUISICAO_MS)
        })
    } catch (erro) {
        const motivo = erro && erro.name === 'TimeoutError'
            ? 'tempo limite excedido'
            : (erro && erro.cause && erro.cause.code) || 'falha de rede'
        throw new ErroBanco('CONEXAO', `Não foi possível conectar ao banco de dados (${motivo}).`)
    }

    if (!resposta.ok) {
        if (resposta.status === 400) {
            let corpoErro = null
            try {
                corpoErro = await resposta.json()
            } catch (_) { /* resposta sem JSON: cai no erro genérico abaixo */ }
            if (corpoErro && typeof corpoErro === 'object') {
                throw classificarErroSql(corpoErro, urlConexao)
            }
        }
        const texto = ocultarSegredos((await resposta.text().catch(() => '')).slice(0, 300), urlConexao)
        throw new ErroBanco('CONEXAO', `Banco de dados respondeu HTTP ${resposta.status}${texto ? `: ${texto}` : ''}`)
    }

    try {
        return await resposta.json()
    } catch (_) {
        throw new ErroBanco('CONEXAO', 'Resposta inválida do banco de dados (JSON esperado).')
    }
}

// Converte {fields, rows} (modo array/texto) em lista de objetos tipados.
function converterResultado(resultado) {
    const campos = (resultado && resultado.fields) || []
    const linhas = (resultado && resultado.rows) || []

    return linhas.map((linha) => {
        const objeto = {}
        campos.forEach((campo, indice) => {
            const valor = linha[indice]
            if (valor === null || valor === undefined) {
                objeto[campo.name] = null
            } else if (OIDS_NUMERICOS.has(campo.dataTypeID)) {
                objeto[campo.name] = Number(valor)
            } else if (campo.dataTypeID === OID_BOOLEANO) {
                objeto[campo.name] = valor === true || valor === 't' || valor === 'true'
            } else {
                objeto[campo.name] = valor
            }
        })
        return objeto
    })
}

// Executa UMA consulta parametrizada ($1, $2...) e devolve as linhas como objetos.
// Lança ErroBanco em qualquer falha (não devolve null/[] para "esconder" erros).
async function executarQueryNeon(querySql, parametros = []) {
    const resultado = await enviarAoNeon({ query: querySql, params: parametros })
    return converterResultado(resultado)
}

// Executa várias consultas em UMA transação (tudo ou nada) e devolve, para cada
// consulta, a sua lista de linhas.
async function executarTransacaoNeon(consultas) {
    const resposta = await enviarAoNeon(
        { queries: consultas.map(({ sql, params = [] }) => ({ query: sql, params })) },
        { 'Neon-Batch-Isolation-Level': 'ReadCommitted' }
    )

    if (!Array.isArray(resposta.results) || resposta.results.length !== consultas.length) {
        throw new ErroBanco('CONEXAO', 'Resposta inválida do banco de dados (resultado de transação inesperado).')
    }
    return resposta.results.map(converterResultado)
}

function linhaParaPokemon(linha) {
    return {
        id: linha.id,
        nome: linha.nome,
        treinador: linha.treinador,
        poder: linha.poder,
        tipos: linha.tipos ? linha.tipos.split(',').filter(Boolean) : [],
        imagem: linha.imagem
    }
}

async function listarBaralho() {
    const linhas = await executarQueryNeon(
        `SELECT ${COLUNAS_POKEMON} FROM baralho ORDER BY combatPower DESC, nome ASC, id ASC`
    )
    return linhas.map(linhaParaPokemon)
}

async function contarBaralho() {
    const linhas = await executarQueryNeon('SELECT COUNT(*)::int AS total FROM baralho')
    return linhas[0].total
}

async function buscarPokemonBaralho(id) {
    const linhas = await executarQueryNeon(`SELECT ${COLUNAS_POKEMON} FROM baralho WHERE id = $1`, [id])
    if (linhas.length === 0) {
        throw new ErroBanco('NAO_ENCONTRADO', 'Pokémon não encontrado no baralho.')
    }
    return linhaParaPokemon(linhas[0])
}

// Inclui um Pokémon respeitando, de forma atômica, o limite do baralho e a
// unicidade do nome (sem diferenciar maiúsculas/minúsculas).
// O advisory lock (de transação) faz com que duas inclusões simultâneas não
// leiam a mesma contagem; o índice único baralho_nome_unico é a segunda barreira.
async function salvarPokemonBaralho(pokemon) {
    const [, inclusao, diagnostico] = await executarTransacaoNeon([
        {
            sql: 'SELECT pg_advisory_xact_lock($1::bigint)',
            params: [CHAVE_LOCK_BARALHO]
        },
        {
            sql: `INSERT INTO baralho (nome, combatPower, img, treinador, tipos)
                  SELECT $1::text, $2::int, $3::text, $4::text, $5::text
                  WHERE (SELECT COUNT(*) FROM baralho) < $6::int
                    AND NOT EXISTS (SELECT 1 FROM baralho WHERE lower(nome) = lower($1::text))
                  RETURNING ${COLUNAS_POKEMON}`,
            params: [
                pokemon.nome,
                pokemon.poder,
                pokemon.imagem,
                pokemon.treinador,
                pokemon.tipos.join(','),
                LIMITE_BARALHO
            ]
        },
        {
            sql: `SELECT COUNT(*)::int AS total,
                         COALESCE(BOOL_OR(lower(nome) = lower($1::text)), false) AS duplicado
                  FROM baralho`,
            params: [pokemon.nome]
        }
    ])

    if (inclusao.length === 1) {
        return linhaParaPokemon(inclusao[0])
    }

    if (diagnostico[0].duplicado) {
        throw new ErroBanco('DUPLICADO', 'Este Pokémon já foi cadastrado!')
    }
    throw new ErroBanco('LIMITE', `O baralho já atingiu o limite de ${LIMITE_BARALHO} Pokémon.`)
}

// Atualiza apenas campos permitidos (lista fixa: nenhum nome de coluna vem do cliente).
const COLUNAS_ATUALIZAVEIS = { treinador: 'treinador', poder: 'combatPower' }

async function atualizarPokemonBaralho(id, campos) {
    const atribuicoes = []
    const parametros = []

    for (const [campo, coluna] of Object.entries(COLUNAS_ATUALIZAVEIS)) {
        if (campos[campo] !== undefined) {
            parametros.push(campos[campo])
            atribuicoes.push(`${coluna} = $${parametros.length}`)
        }
    }

    if (atribuicoes.length === 0) {
        throw new ErroBanco('CONSULTA', 'Nenhum campo atualizável informado.')
    }

    parametros.push(id)
    const linhas = await executarQueryNeon(
        `UPDATE baralho SET ${atribuicoes.join(', ')} WHERE id = $${parametros.length} RETURNING ${COLUNAS_POKEMON}`,
        parametros
    )

    if (linhas.length === 0) {
        throw new ErroBanco('NAO_ENCONTRADO', 'Pokémon não encontrado no baralho.')
    }
    return linhaParaPokemon(linhas[0])
}

async function removerPokemonBaralho(id) {
    const linhas = await executarQueryNeon('DELETE FROM baralho WHERE id = $1 RETURNING id', [id])
    if (linhas.length === 0) {
        throw new ErroBanco('NAO_ENCONTRADO', 'Pokémon não encontrado no baralho.')
    }
    return { id: linhas[0].id }
}

// Confirma conexão + existência/estrutura mínima da tabela. Usado na partida e em /api/saude.
async function verificarBanco() {
    const total = await contarBaralho()
    return { total, limite: LIMITE_BARALHO }
}

module.exports = {
    LIMITE_BARALHO,
    ErroBanco,
    executarQueryNeon,
    executarTransacaoNeon,
    listarBaralho,
    contarBaralho,
    buscarPokemonBaralho,
    salvarPokemonBaralho,
    atualizarPokemonBaralho,
    removerPokemonBaralho,
    verificarBanco
}
