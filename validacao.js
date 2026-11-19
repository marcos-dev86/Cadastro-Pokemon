'use strict'

// Validação das entradas da API do baralho. Reproduz no servidor as regras que o
// formulário (script.js) já aplica, pois o servidor nunca deve confiar no cliente.

const PODER_MINIMO = 100
const PODER_MAXIMO = 2147483647 // limite da coluna INT do PostgreSQL
const ID_MAXIMO = 2147483647

class ErroValidacao extends Error {
    constructor(detalhes) {
        super(detalhes[0])
        this.name = 'ErroValidacao'
        this.detalhes = detalhes
    }
}

const REGEX_NOME = /^[\p{L}\p{N}][\p{L}\p{N} .'’:-]*$/u
const REGEX_TIPO = /^[a-z][a-z-]{1,19}$/
const REGEX_URL_IMAGEM = /^https?:\/\/[^\s"'<>]+$/i
const REGEX_CONTROLE = /[\u0000-\u001F\u007F]/

function validarId(valor) {
    const texto = String(valor)
    const numero = Number(texto)

    if (!/^\d+$/.test(texto) || numero < 1 || numero > ID_MAXIMO) {
        throw new ErroValidacao(['ID inválido.'])
    }
    return numero
}

function validarNome(valor, erros) {
    if (typeof valor !== 'string') {
        erros.push('Nome é obrigatório.')
        return null
    }
    const nome = valor.trim()
    if (nome.length < 3) {
        erros.push('Nome deve conter ao menos 3 caracteres.')
    } else if (nome.length > 50) {
        erros.push('Nome deve conter no máximo 50 caracteres.')
    } else if (!REGEX_NOME.test(nome)) {
        erros.push('Nome contém caracteres não permitidos.')
    }
    return nome
}

function validarTreinador(valor, erros) {
    if (valor === undefined || valor === null) {
        return ''
    }
    if (typeof valor !== 'string') {
        erros.push('Treinador deve ser um texto.')
        return null
    }
    const treinador = valor.trim()
    if (treinador.length > 50) {
        erros.push('Treinador deve conter no máximo 50 caracteres.')
    } else if (REGEX_CONTROLE.test(treinador)) {
        erros.push('Treinador contém caracteres não permitidos.')
    }
    return treinador
}

function validarPoder(valor, erros) {
    if (typeof valor !== 'number' || !Number.isInteger(valor)) {
        erros.push('Poder deve ser um número inteiro.')
    } else if (valor < PODER_MINIMO) {
        erros.push(`O poder do Pokémon precisa ser maior ou igual a ${PODER_MINIMO}.`)
    } else if (valor > PODER_MAXIMO) {
        erros.push('Poder acima do valor máximo permitido.')
    }
    return valor
}

function validarTipos(valor, erros) {
    if (valor === undefined || valor === null) {
        return []
    }
    if (!Array.isArray(valor) || valor.length > 3 || !valor.every((t) => typeof t === 'string' && REGEX_TIPO.test(t))) {
        erros.push('Tipos devem ser uma lista de até 3 nomes de tipo válidos (ex.: ["fire"]).')
        return []
    }
    return [...new Set(valor)]
}

function validarImagem(valor, erros) {
    if (valor === undefined || valor === null || valor === '') {
        return ''
    }
    if (typeof valor !== 'string' || valor.length > 500 || !REGEX_URL_IMAGEM.test(valor)) {
        erros.push('Imagem deve ser uma URL http(s) válida de até 500 caracteres.')
        return ''
    }
    return valor
}

function exigirObjeto(corpo) {
    if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
        throw new ErroValidacao(['O corpo da requisição deve ser um objeto JSON.'])
    }
}

function validarNovoPokemon(corpo) {
    exigirObjeto(corpo)
    const erros = []

    const pokemon = {
        nome: validarNome(corpo.nome, erros),
        treinador: validarTreinador(corpo.treinador, erros),
        poder: validarPoder(corpo.poder, erros),
        tipos: validarTipos(corpo.tipos, erros),
        imagem: validarImagem(corpo.imagem, erros)
    }

    if (erros.length > 0) {
        throw new ErroValidacao(erros)
    }
    return pokemon
}

// Campos editáveis: treinador e poder (nome/tipos/imagem identificam o Pokémon na PokéAPI).
function validarAtualizacao(corpo) {
    exigirObjeto(corpo)
    const erros = []
    const campos = {}

    if (corpo.treinador !== undefined) {
        campos.treinador = validarTreinador(corpo.treinador, erros)
    }
    if (corpo.poder !== undefined) {
        campos.poder = validarPoder(corpo.poder, erros)
    }
    if (Object.keys(campos).length === 0 && erros.length === 0) {
        erros.push('Informe ao menos um campo para atualizar (treinador ou poder).')
    }

    if (erros.length > 0) {
        throw new ErroValidacao(erros)
    }
    return campos
}

module.exports = { ErroValidacao, validarId, validarNovoPokemon, validarAtualizacao }
