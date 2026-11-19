'use strict'

// Teste de integração ponta a ponta: servidor HTTP real -> script_db.js -> protocolo
// HTTP do Neon (shim local) -> PostgreSQL real em memória. O schema é aplicado pelo
// próprio migrate.js. Nenhum banco real é acessado.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { criarBackendPglite, iniciarShim, configurarAmbienteDeTeste } = require('./neon-shim.js')

let backend, shim, servidor, base, falhaInjetada = null

function executarMigrate() {
    return new Promise((resolve) => {
        execFile(process.execPath, [path.join(__dirname, '..', 'migrate.js')], { env: process.env }, (erro, stdout, stderr) => {
            resolve({ codigo: erro ? erro.code : 0, saida: stdout + stderr })
        })
    })
}

async function chamar(metodo, rota, corpo) {
    const resposta = await fetch(base + rota, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
    })
    const texto = await resposta.text()
    let json = null
    try { json = JSON.parse(texto) } catch (_) { /* resposta não-JSON (estáticos) */ }
    return { status: resposta.status, json, texto, cabecalhos: resposta.headers }
}

const pokemon = (nome, poder, extra = {}) => ({
    nome, poder, treinador: 'Ash', tipos: ['normal'], imagem: `https://exemplo.test/${nome}.png`, ...extra
})

async function contarNoBanco() {
    const r = await backend.consultar('SELECT COUNT(*)::int FROM baralho', [])
    return r.rows[0][0]
}

test.before(async () => {
    backend = await criarBackendPglite()
    shim = await iniciarShim(backend, { falhar: (corpo) => falhaInjetada && falhaInjetada(corpo) })
    configurarAmbienteDeTeste(shim.endpoint)

    const migracao = await executarMigrate()
    assert.equal(migracao.codigo, 0, migracao.saida)

    const { criarServidor } = require('../server.js')
    servidor = criarServidor()
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
    base = `http://127.0.0.1:${servidor.address().port}`
})

test.after(async () => {
    await new Promise((ok) => servidor.close(ok))
    await shim.fechar()
    await backend.fechar()
})

test('saúde: conecta no banco e informa contagem e limite', async () => {
    const r = await chamar('GET', '/api/saude')
    assert.equal(r.status, 200)
    assert.deepEqual(r.json, { banco: 'ok', total: 0, limite: 12 })
})

test('baralho começa vazio', async () => {
    const r = await chamar('GET', '/api/baralho')
    assert.equal(r.status, 200)
    assert.deepEqual(r.json, [])
})

test('CREATE: grava no banco e devolve o registro com id', async () => {
    const r = await chamar('POST', '/api/baralho', pokemon('Pikachu', 112, { tipos: ['electric'], treinador: 'Ash' }))
    assert.equal(r.status, 201)
    assert.equal(typeof r.json.id, 'number')
    assert.deepEqual({ ...r.json, id: undefined }, {
        id: undefined, nome: 'Pikachu', treinador: 'Ash', poder: 112, tipos: ['electric'], imagem: 'https://exemplo.test/Pikachu.png'
    })

    // Conferência direta na tabela (não só na resposta da API)
    const linha = await backend.consultar('SELECT nome, combatPower, img, treinador, tipos FROM baralho WHERE id = $1', [r.json.id])
    assert.deepEqual(linha.rows[0], ['Pikachu', 112, 'https://exemplo.test/Pikachu.png', 'Ash', 'electric'])
})

test('CREATE: tipos múltiplos são gravados e devolvidos como lista', async () => {
    const r = await chamar('POST', '/api/baralho', pokemon('Charizard', 267, { tipos: ['fire', 'flying'] }))
    assert.equal(r.status, 201)
    assert.deepEqual(r.json.tipos, ['fire', 'flying'])
})

test('CREATE: nome duplicado (sem diferenciar maiúsculas) é recusado com 409', async () => {
    const antes = await contarNoBanco()
    const r = await chamar('POST', '/api/baralho', pokemon('pIKAchu', 150))
    assert.equal(r.status, 409)
    assert.match(r.json.erro, /já foi cadastrado/)
    assert.equal(await contarNoBanco(), antes)
})

test('CREATE: entradas inválidas retornam 400 e nada é gravado', async () => {
    const antes = await contarNoBanco()
    const invalidos = [
        pokemon('ab', 150),
        pokemon('Bulbasaur', 99),
        pokemon('Bulbasaur', '150'),
        pokemon('Bulbasaur', 150.5),
        pokemon('Bulbasaur', 150, { tipos: 'grass' }),
        pokemon('Bulbasaur', 150, { imagem: 'javascript:alert(1)' }),
        pokemon("x'); DROP TABLE baralho;--", 150),
        [],
        {}
    ]
    for (const corpo of invalidos) {
        const r = await chamar('POST', '/api/baralho', corpo)
        assert.equal(r.status, 400, JSON.stringify(corpo))
        assert.ok(r.json.erro)
    }
    const json = await chamar('POST', '/api/baralho', '{json quebrado')
    assert.equal(json.status, 400)
    assert.equal(await contarNoBanco(), antes)
})

test('SQL injection: texto malicioso é gravado como dado e a tabela permanece', async () => {
    const malicioso = "Ash'); DROP TABLE baralho;--"
    const r = await chamar('POST', '/api/baralho', pokemon('Squirtle', 105, { treinador: malicioso }))
    assert.equal(r.status, 201)
    assert.equal(r.json.treinador, malicioso)

    const lista = await chamar('GET', '/api/baralho')
    assert.equal(lista.status, 200)
    assert.ok(lista.json.some((p) => p.treinador === malicioso))
})

test('READ: lista ordenada por poder (decrescente) com todos os campos', async () => {
    const r = await chamar('GET', '/api/baralho')
    const poderes = r.json.map((p) => p.poder)
    assert.deepEqual(poderes, [...poderes].sort((a, b) => b - a))
    assert.deepEqual(r.json.map((p) => p.nome), ['Charizard', 'Pikachu', 'Squirtle'])
    for (const p of r.json) {
        assert.deepEqual(Object.keys(p).sort(), ['id', 'imagem', 'nome', 'poder', 'tipos', 'treinador'])
    }
})

test('READ por id: encontra, 404 se não existe, 400 se id inválido', async () => {
    const lista = (await chamar('GET', '/api/baralho')).json
    const um = await chamar('GET', `/api/baralho/${lista[0].id}`)
    assert.equal(um.status, 200)
    assert.deepEqual(um.json, lista[0])

    assert.equal((await chamar('GET', '/api/baralho/999999')).status, 404)
    assert.equal((await chamar('GET', '/api/baralho/abc')).status, 400)
    assert.equal((await chamar('GET', '/api/baralho/1;DROP')).status, 400)
})

test('UPDATE: altera treinador e poder; ignora nome; valida entrada', async () => {
    const alvo = (await chamar('GET', '/api/baralho')).json.find((p) => p.nome === 'Squirtle')

    const r = await chamar('PUT', `/api/baralho/${alvo.id}`, { treinador: 'Misty', poder: 130, nome: 'Outro' })
    assert.equal(r.status, 200)
    assert.equal(r.json.treinador, 'Misty')
    assert.equal(r.json.poder, 130)
    assert.equal(r.json.nome, 'Squirtle')

    const noBanco = await backend.consultar('SELECT nome, combatPower, treinador FROM baralho WHERE id = $1', [alvo.id])
    assert.deepEqual(noBanco.rows[0], ['Squirtle', 130, 'Misty'])

    assert.equal((await chamar('PATCH', `/api/baralho/${alvo.id}`, { poder: 140 })).json.poder, 140)
    assert.equal((await chamar('PUT', `/api/baralho/${alvo.id}`, { poder: 50 })).status, 400)
    assert.equal((await chamar('PUT', `/api/baralho/${alvo.id}`, {})).status, 400)
    assert.equal((await chamar('PUT', '/api/baralho/999999', { poder: 150 })).status, 404)
})

test('DELETE: remove do banco; repetir retorna 404', async () => {
    const alvo = (await chamar('GET', '/api/baralho')).json.find((p) => p.nome === 'Squirtle')
    const antes = await contarNoBanco()

    const r = await chamar('DELETE', `/api/baralho/${alvo.id}`)
    assert.equal(r.status, 200)
    assert.deepEqual(r.json, { id: alvo.id, removido: true })
    assert.equal(await contarNoBanco(), antes - 1)

    assert.equal((await chamar('DELETE', `/api/baralho/${alvo.id}`)).status, 404)
    assert.equal((await chamar('GET', `/api/baralho/${alvo.id}`)).status, 404)
})

test('LIMITE: o baralho aceita no máximo 12 e libera vaga após remover', async () => {
    let total = await contarNoBanco()
    for (let i = total; i < 12; i++) {
        const r = await chamar('POST', '/api/baralho', pokemon(`Poke${i}`, 100 + i))
        assert.equal(r.status, 201)
    }
    assert.equal(await contarNoBanco(), 12)

    const extra = await chamar('POST', '/api/baralho', pokemon('Excedente', 500))
    assert.equal(extra.status, 409)
    assert.match(extra.json.erro, /limite de 12/)
    assert.equal(await contarNoBanco(), 12)

    const primeiro = (await chamar('GET', '/api/baralho')).json[0]
    await chamar('DELETE', `/api/baralho/${primeiro.id}`)
    assert.equal((await chamar('POST', '/api/baralho', pokemon('Excedente', 500))).status, 201)
    assert.equal(await contarNoBanco(), 12)
})

test('CONCORRÊNCIA: inclusões simultâneas nunca ultrapassam o limite nem duplicam nomes', async () => {
    // esvazia e reabastece com 8 para sobrar 4 vagas
    await backend.consultar('DELETE FROM baralho', [])
    for (let i = 0; i < 8; i++) {
        assert.equal((await chamar('POST', '/api/baralho', pokemon(`Base${i}`, 100 + i))).status, 201)
    }

    const resultados = await Promise.all(
        Array.from({ length: 16 }, (_, i) => chamar('POST', '/api/baralho', pokemon(`Corrida${i % 8}`, 200 + i)))
    )
    const criados = resultados.filter((r) => r.status === 201).length
    assert.ok(resultados.every((r) => r.status === 201 || r.status === 409))
    assert.equal(criados, 4)
    assert.equal(await contarNoBanco(), 12)

    const nomes = (await backend.consultar('SELECT lower(nome) FROM baralho', [])).rows.map((l) => l[0])
    assert.equal(new Set(nomes).size, nomes.length)
})

test('TRANSAÇÃO: se uma consulta do lote falha, nada do lote é gravado', async () => {
    const db = require('../script_db.js')
    await backend.consultar('DELETE FROM baralho', [])

    await assert.rejects(
        db.executarTransacaoNeon([
            { sql: "INSERT INTO baralho (nome, combatPower, img, treinador) VALUES ('A1', 100, 'x', 't')" },
            { sql: "INSERT INTO baralho (nome, combatPower, img, treinador) VALUES ('A1', 100, 'x', 't')" } // viola índice único
        ]),
        (erro) => erro instanceof db.ErroBanco && erro.tipo === 'DUPLICADO'
    )
    assert.equal(await contarNoBanco(), 0)
})

test('FALHAS: banco indisponível vira 503 sem vazar detalhes nem credenciais', async (t) => {
    t.mock.method(console, 'error', () => {})
    const endpointOriginal = process.env.NEON_HTTP_ENDPOINT
    const urlOriginal = process.env.DATABASE_URL
    try {

    // 1) o banco responde HTTP 500
    falhaInjetada = () => ({ status: 500, corpo: 'Internal Server Error senha_teste' })
    let r = await chamar('GET', '/api/baralho')
    assert.equal(r.status, 503)
    assert.equal(r.json.erro, 'Banco de dados indisponível no momento.')
    assert.ok(!r.texto.includes('senha_teste'))

    // 2) erro SQL de autenticação (SQLSTATE 28P01) também é "indisponível"
    falhaInjetada = () => ({ status: 400, corpo: { message: 'password authentication failed', code: '28P01' } })
    assert.equal((await chamar('GET', '/api/saude')).status, 503)

    // 3) tabela inexistente (42P01) é erro de estrutura, status 500 com orientação só no log
    falhaInjetada = () => ({ status: 400, corpo: { message: 'relation "baralho" does not exist', code: '42P01' } })
    r = await chamar('GET', '/api/baralho')
    assert.equal(r.status, 500)
    assert.ok(!r.texto.includes('relation'))
    falhaInjetada = null

    // 4) servidor do banco fora do ar (porta fechada)
    process.env.NEON_HTTP_ENDPOINT = 'http://127.0.0.1:1/sql'
    r = await chamar('GET', '/api/baralho')
    assert.equal(r.status, 503)
    process.env.NEON_HTTP_ENDPOINT = endpointOriginal

    // 5) DATABASE_URL ausente / inválida
    for (const valor of ['', 'isto não é uma url', 'mysql://u:p@host/db']) {
        process.env.DATABASE_URL = valor
        r = await chamar('GET', '/api/baralho')
        assert.equal(r.status, 503, `DATABASE_URL="${valor}"`)
    }
    const logs = console.error.mock.calls.map((c) => c.arguments.join(' ')).join('\n')
    assert.ok(!logs.includes('senha_teste'), 'logs não podem conter credenciais')
    process.env.DATABASE_URL = urlOriginal

    // recuperação: com tudo restaurado volta a funcionar
    assert.equal((await chamar('GET', '/api/baralho')).status, 200)
    } finally {
        falhaInjetada = null
        process.env.NEON_HTTP_ENDPOINT = endpointOriginal
        process.env.DATABASE_URL = urlOriginal
    }
})

test('SEGURANÇA: a string de conexão vai só no cabeçalho, nunca no corpo ou nas respostas', async () => {
    shim.requisicoes.length = 0
    const r = await chamar('GET', '/api/baralho')
    assert.ok(!r.texto.includes('senha_teste'))
    assert.ok(shim.requisicoes.length > 0)
    for (const req of shim.requisicoes) {
        assert.equal(req.cabecalhos['neon-connection-string'], process.env.DATABASE_URL)
        assert.ok(!JSON.stringify(req.corpo).includes('senha_teste'))
    }
})

test('ROTAS: métodos e caminhos inválidos, estáticos e cabeçalhos', async () => {
    assert.equal((await chamar('DELETE', '/api/baralho')).status, 405)
    assert.equal((await chamar('POST', '/api/baralho/1')).status, 405)
    assert.equal((await chamar('GET', '/api/inexistente')).status, 404)
    assert.equal((await chamar('GET', '/nada')).status, 404)

    const pagina = await chamar('GET', '/')
    assert.equal(pagina.status, 200)
    assert.match(pagina.texto, /Cadastro Pokémon/)
    assert.equal((await chamar('GET', '/script.js')).status, 200)
    assert.equal((await chamar('GET', '/style.css')).status, 200)
    assert.equal((await chamar('POST', '/')).status, 405)

    const grande = await chamar('POST', '/api/baralho', JSON.stringify({ nome: 'x'.repeat(200 * 1024) }))
    assert.equal(grande.status, 413)
})
