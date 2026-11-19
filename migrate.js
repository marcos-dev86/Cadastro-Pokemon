'use strict'

// Aplica schema.sql no banco apontado por DATABASE_URL e confere se a estrutura
// real da tabela "baralho" é compatível com o que a aplicação espera.
// Uso: npm run migrate
// Seguro para repetir: apenas instruções idempotentes e não destrutivas (ver schema.sql).

require('dotenv').config({ quiet: true })

const fs = require('fs')
const path = require('path')
const db = require('./script_db.js')

const TIPOS_INTEIROS = ['smallint', 'integer', 'bigint']
const TIPOS_TEXTO = ['text', 'character varying']

// Nome da coluna (como o PostgreSQL a armazena) -> tipos aceitos.
const ESTRUTURA_ESPERADA = {
    id: TIPOS_INTEIROS,
    nome: TIPOS_TEXTO,
    combatpower: TIPOS_INTEIROS,
    img: TIPOS_TEXTO,
    treinador: TIPOS_TEXTO,
    tipos: ['text']
}

function lerInstrucoes() {
    const conteudo = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    return conteudo
        .split('\n')
        .filter((linha) => !linha.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((instrucao) => instrucao.trim())
        .filter(Boolean)
}

async function conferirEstrutura() {
    const colunas = await db.executarQueryNeon(
        `SELECT column_name, data_type, is_nullable, column_default, is_identity
           FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'baralho'`
    )

    const problemas = []
    const porNome = new Map(colunas.map((c) => [c.column_name, c]))

    for (const [coluna, tiposAceitos] of Object.entries(ESTRUTURA_ESPERADA)) {
        const atual = porNome.get(coluna)
        if (!atual) {
            problemas.push(`coluna "${coluna}" não existe`)
        } else if (!tiposAceitos.includes(atual.data_type)) {
            problemas.push(`coluna "${coluna}" é ${atual.data_type} (esperado: ${tiposAceitos.join(' ou ')})`)
        }
    }

    const id = porNome.get('id')
    if (id && id.is_identity !== 'YES' && !id.column_default) {
        problemas.push('coluna "id" não gera valor automaticamente (esperado IDENTITY ou DEFAULT/SERIAL)')
    }

    for (const coluna of colunas) {
        const extraObrigatoria = !(coluna.column_name in ESTRUTURA_ESPERADA)
            && coluna.is_nullable === 'NO' && !coluna.column_default && coluna.is_identity !== 'YES'
        if (extraObrigatoria) {
            problemas.push(`coluna extra "${coluna.column_name}" é NOT NULL sem valor padrão (inserções falhariam)`)
        }
    }

    return problemas
}

async function main() {
    const instrucoes = lerInstrucoes()

    for (const instrucao of instrucoes) {
        const resumo = instrucao.replace(/\s+/g, ' ').slice(0, 70)
        try {
            await db.executarQueryNeon(instrucao)
            console.log(`[migrate] OK    ${resumo}...`)
        } catch (erro) {
            console.error(`[migrate] FALHOU ${resumo}...`)
            console.error(`[migrate] Motivo: ${erro.message}`)
            if (erro.sqlState === '23505') {
                console.error('[migrate] Existem Pokémon duplicados (mesmo nome, sem diferenciar maiúsculas). Nada foi apagado: corrija os registros duplicados manualmente e execute novamente.')
            }
            process.exitCode = 1
            return
        }
    }

    const problemas = await conferirEstrutura()
    if (problemas.length > 0) {
        console.error('[migrate] A tabela "baralho" existente NÃO é compatível com o código:')
        problemas.forEach((p) => console.error(`  - ${p}`))
        console.error('[migrate] Nenhuma alteração destrutiva foi feita. Ajuste a tabela manualmente (ou me informe a estrutura) antes de usar a aplicação.')
        process.exitCode = 1
        return
    }

    console.log('[migrate] Estrutura conferida: tabela "baralho" compatível com a aplicação.')
}

main().catch((erro) => {
    console.error(`[migrate] Erro: ${erro.message}`)
    process.exitCode = 1
})
