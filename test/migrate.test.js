'use strict'

// Testa o migrate.js contra estruturas pré-existentes, garantindo que ele nunca
// apaga dados e que avisa quando a tabela existente é incompatível.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { criarBackendPglite, iniciarShim, configurarAmbienteDeTeste } = require('./neon-shim.js')

let backend, shim

function executarMigrate() {
    return new Promise((resolve) => {
        execFile(process.execPath, [path.join(__dirname, '..', 'migrate.js')], { env: process.env }, (erro, stdout, stderr) => {
            resolve({ codigo: erro ? erro.code : 0, saida: stdout + stderr })
        })
    })
}

const limpar = () => backend.consultar('DROP TABLE IF EXISTS baralho', [])
const total = async () => (await backend.consultar('SELECT COUNT(*)::int FROM baralho', [])).rows[0][0]

test.before(async () => {
    backend = await criarBackendPglite()
    shim = await iniciarShim(backend)
    configurarAmbienteDeTeste(shim.endpoint)
})

test.after(async () => {
    await shim.fechar()
    await backend.fechar()
})

test('banco vazio: cria a tabela e confere a estrutura; repetir é seguro', async () => {
    await limpar()
    let r = await executarMigrate()
    assert.equal(r.codigo, 0, r.saida)
    assert.match(r.saida, /compatível com a aplicação/)

    await backend.consultar("INSERT INTO baralho (nome, combatPower, img, treinador) VALUES ('Mew', 300, 'x', 't')", [])
    r = await executarMigrate()
    assert.equal(r.codigo, 0, r.saida)
    assert.equal(await total(), 1)
})

test('tabela antiga sem a coluna tipos: adiciona a coluna e preserva os dados', async () => {
    await limpar()
    await backend.consultar(`CREATE TABLE baralho (
        id SERIAL PRIMARY KEY, nome VARCHAR(50) NOT NULL, combatPower INT NOT NULL,
        img TEXT NOT NULL, treinador VARCHAR(50) NOT NULL)`, [])
    await backend.consultar("INSERT INTO baralho (nome, combatPower, img, treinador) VALUES ('Eevee', 120, 'x', 'Gary')", [])

    const r = await executarMigrate()
    assert.equal(r.codigo, 0, r.saida)
    const linha = await backend.consultar('SELECT nome, combatPower, tipos FROM baralho', [])
    assert.deepEqual(linha.rows, [['Eevee', 120, '']])
})

test('registros duplicados existentes: falha avisando, sem apagar nada', async () => {
    await limpar()
    await backend.consultar(`CREATE TABLE baralho (
        id SERIAL PRIMARY KEY, nome VARCHAR(50) NOT NULL, combatPower INT NOT NULL,
        img TEXT NOT NULL, treinador VARCHAR(50) NOT NULL)`, [])
    await backend.consultar("INSERT INTO baralho (nome, combatPower, img, treinador) VALUES ('Dup', 120, 'x', 'a'), ('dup', 130, 'x', 'b')", [])

    const r = await executarMigrate()
    assert.notEqual(r.codigo, 0)
    assert.match(r.saida, /duplicados/)
    assert.equal(await total(), 2)
})

test('tabela incompatível (id texto sem valor automático): reprova sem alterar dados', async () => {
    await limpar()
    await backend.consultar(`CREATE TABLE baralho (
        id TEXT PRIMARY KEY, nome VARCHAR(50) NOT NULL, combatPower INT NOT NULL,
        img TEXT NOT NULL, treinador VARCHAR(50) NOT NULL, extra TEXT NOT NULL)`, [])
    await backend.consultar("INSERT INTO baralho VALUES ('a', 'Zed', 150, 'x', 't', 'e')", [])

    const r = await executarMigrate()
    assert.notEqual(r.codigo, 0)
    assert.match(r.saida, /coluna "id" é text/)
    assert.match(r.saida, /coluna extra "extra"/)
    assert.equal(await total(), 1)
})

test('sem DATABASE_URL: falha com mensagem clara e sem vazar nada', async () => {
    const original = process.env.DATABASE_URL
    process.env.DATABASE_URL = ''
    const r = await executarMigrate()
    process.env.DATABASE_URL = original
    assert.notEqual(r.codigo, 0)
    assert.match(r.saida, /DATABASE_URL não está definida/)
})
