'use strict'

// Servidor de teste que imita o endpoint HTTP do Neon (POST /sql) usando um
// PostgreSQL de verdade em memória (PGlite). Serve para testar a aplicação SEM
// tocar em nenhum banco real e sem credenciais.
//
// Protocolo implementado (conforme o driver oficial @neondatabase/serverless):
//   - corpo { query, params }            -> { fields, rows }
//   - corpo { queries: [{query,params}] } -> { results: [...] }  (uma transação)
//   - erro SQL -> HTTP 400 com { message, code, severity, detail, constraint }
//   - modo texto/array: linhas como arrays de strings, tipos em fields[].dataTypeID

const http = require('http')

function paraTexto(valor) {
    if (valor === null || valor === undefined) return null
    if (typeof valor === 'boolean') return valor ? 't' : 'f'
    return String(valor)
}

function formatarResultado(resultado) {
    return {
        fields: resultado.fields.map((c) => ({ name: c.name, dataTypeID: c.dataTypeID })),
        rows: resultado.rows.map((linha) => linha.map(paraTexto)),
        rowCount: resultado.affectedRows ?? resultado.rows.length
    }
}

// Backend PGlite: um único Postgres em memória.
async function criarBackendPglite() {
    const { PGlite } = require('@electric-sql/pglite')
    const banco = new PGlite()
    await banco.waitReady
    return {
        nome: 'pglite',
        consultar: (sql, params) => banco.query(sql, params, { rowMode: 'array' }),
        transacao: (consultas) => banco.transaction(async (tx) => {
            const resultados = []
            for (const { query, params } of consultas) {
                resultados.push(await tx.query(query, params, { rowMode: 'array' }))
            }
            return resultados
        }),
        fechar: () => banco.close()
    }
}

// opcoes.falhar: função (corpo) => { status, corpo } | null  para simular falhas do servidor.
async function iniciarShim(backend, opcoes = {}) {
    const requisicoes = []

    const servidor = http.createServer((req, res) => {
        const pedacos = []
        req.on('data', (p) => pedacos.push(p))
        req.on('end', async () => {
            const responder = (status, dados) => {
                res.writeHead(status, { 'Content-Type': 'application/json' })
                res.end(typeof dados === 'string' ? dados : JSON.stringify(dados))
            }

            let corpo
            try {
                corpo = JSON.parse(Buffer.concat(pedacos).toString('utf8'))
            } catch (_) {
                return responder(400, { message: 'JSON inválido' })
            }

            requisicoes.push({ url: req.url, cabecalhos: req.headers, corpo })

            if (req.url !== '/sql' || req.method !== 'POST') return responder(404, { message: 'not found' })
            if (!req.headers['neon-connection-string']) return responder(400, { message: 'Connection string ausente' })

            const falha = opcoes.falhar && opcoes.falhar(corpo)
            if (falha) return responder(falha.status, falha.corpo)

            try {
                if (Array.isArray(corpo.queries)) {
                    const resultados = await backend.transacao(corpo.queries)
                    return responder(200, { results: resultados.map(formatarResultado) })
                }
                return responder(200, formatarResultado(await backend.consultar(corpo.query, corpo.params || [])))
            } catch (erro) {
                return responder(400, {
                    message: erro.message,
                    code: erro.code,
                    severity: erro.severity,
                    detail: erro.detail,
                    constraint: erro.constraint
                })
            }
        })
    })

    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
    const { port } = servidor.address()

    return {
        endpoint: `http://127.0.0.1:${port}/sql`,
        requisicoes,
        fechar: () => new Promise((ok) => servidor.close(ok))
    }
}

// Variáveis de ambiente de teste: valores FICTÍCIOS apontando só para o shim local.
function configurarAmbienteDeTeste(endpoint) {
    if (!/^http:\/\/127\.0\.0\.1:\d+\/sql$/.test(endpoint)) {
        throw new Error('Segurança: os testes só podem apontar para o shim local.')
    }
    process.env.DATABASE_URL = 'postgresql://usuario_teste:senha_teste@localhost.invalid/banco_teste'
    process.env.NEON_HTTP_ENDPOINT = endpoint
}

module.exports = { criarBackendPglite, iniciarShim, configurarAmbienteDeTeste }
