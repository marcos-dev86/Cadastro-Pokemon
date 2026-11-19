'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { ErroValidacao, validarId, validarNovoPokemon, validarAtualizacao } = require('../validacao.js')

const valido = () => ({
    nome: 'Pikachu',
    treinador: 'Ash',
    poder: 112,
    tipos: ['electric'],
    imagem: 'https://exemplo.test/pikachu.png'
})

test('aceita um Pokémon válido e normaliza espaços', () => {
    const r = validarNovoPokemon({ ...valido(), nome: '  Pikachu  ', treinador: '  Ash ' })
    assert.deepEqual(r, valido())
})

test('treinador, tipos e imagem são opcionais', () => {
    const r = validarNovoPokemon({ nome: 'Mew', poder: 300 })
    assert.deepEqual(r, { nome: 'Mew', treinador: '', poder: 300, tipos: [], imagem: '' })
})

test('aceita nomes reais da PokéAPI (hífen, apóstrofo, ponto)', () => {
    for (const nome of ['mr-mime', "Farfetch'd", 'Mr. Mime', 'nidoran-f', 'Flabébé']) {
        assert.equal(validarNovoPokemon({ ...valido(), nome }).nome, nome)
    }
})

test('rejeita nome inválido', () => {
    for (const nome of ['ab', '', '   ', 'a'.repeat(51), "x'); DROP TABLE baralho;--", '<script>alert(1)</script>', 123, null, undefined]) {
        assert.throws(() => validarNovoPokemon({ ...valido(), nome }), ErroValidacao, `nome=${String(nome)}`)
    }
})

test('rejeita poder inválido (menor que 100, decimal, texto, fora do INT)', () => {
    for (const poder of [99, 0, -5, 150.5, '150', null, undefined, NaN, 2147483648]) {
        assert.throws(() => validarNovoPokemon({ ...valido(), poder }), ErroValidacao, `poder=${String(poder)}`)
    }
    assert.equal(validarNovoPokemon({ ...valido(), poder: 100 }).poder, 100)
})

test('rejeita tipos e imagem inválidos', () => {
    assert.throws(() => validarNovoPokemon({ ...valido(), tipos: 'fire' }), ErroValidacao)
    assert.throws(() => validarNovoPokemon({ ...valido(), tipos: ['a', 'b', 'c', 'd'].map((x) => x + 'aa') }), ErroValidacao)
    assert.throws(() => validarNovoPokemon({ ...valido(), tipos: ['<b>'] }), ErroValidacao)
    assert.throws(() => validarNovoPokemon({ ...valido(), imagem: 'javascript:alert(1)' }), ErroValidacao)
    assert.throws(() => validarNovoPokemon({ ...valido(), imagem: 'https://x.test/a" onerror="alert(1)' }), ErroValidacao)
})

test('rejeita treinador longo ou com caracteres de controle', () => {
    assert.throws(() => validarNovoPokemon({ ...valido(), treinador: 'a'.repeat(51) }), ErroValidacao)
    assert.throws(() => validarNovoPokemon({ ...valido(), treinador: 'Ash\u0000' }), ErroValidacao)
})

test('corpo precisa ser um objeto', () => {
    for (const corpo of [null, [], 'texto', 42]) {
        assert.throws(() => validarNovoPokemon(corpo), ErroValidacao)
    }
})

test('acumula todas as mensagens de erro em detalhes', () => {
    try {
        validarNovoPokemon({ nome: 'a', poder: 1 })
        assert.fail('deveria lançar')
    } catch (erro) {
        assert.ok(erro instanceof ErroValidacao)
        assert.equal(erro.detalhes.length, 2)
    }
})

test('validarAtualizacao: só treinador e poder; exige ao menos um', () => {
    assert.deepEqual(validarAtualizacao({ treinador: ' Misty ', nome: 'ignorado' }), { treinador: 'Misty' })
    assert.deepEqual(validarAtualizacao({ poder: 200 }), { poder: 200 })
    assert.throws(() => validarAtualizacao({}), ErroValidacao)
    assert.throws(() => validarAtualizacao({ nome: 'x' }), ErroValidacao)
    assert.throws(() => validarAtualizacao({ poder: 50 }), ErroValidacao)
})

test('validarId aceita inteiros positivos e rejeita o resto', () => {
    assert.equal(validarId('7'), 7)
    for (const id of ['abc', '0', '-1', '1.5', '1;DROP', '99999999999', '', ' 1']) {
        assert.throws(() => validarId(id), ErroValidacao, `id=${id}`)
    }
})
