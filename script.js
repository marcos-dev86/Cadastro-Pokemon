const form = document.querySelector('#pokemon');
const feedback = document.querySelector('#feedback');
const imgPokemon = document.querySelector('#imgPokemon');
const nomeInput = document.querySelector('#nome');
const treinadorInput = document.querySelector('#treinador');
const poderInput = document.querySelector('#poder');
const tipoInput = document.querySelector('#tipo');
const container = document.querySelector('#container');

const botaoEnviar = document.querySelector('#btn-submit');

const URL_POKEAPI = 'https://pokeapi.co/api/v2/pokemon';
const URL_API_BARALHO = '/api/baralho';

let debounceBusca;
let pokemonsCadastrados = [];

// Os dados do baralho agora vêm do banco: o texto salvo é de terceiros, então
// nunca pode entrar no HTML sem escape.
function escaparHTML(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function requisitarApi(caminho, opcoes = {}) {
    let resposta;

    try {
        resposta = await fetch(caminho, {
            headers: { 'Content-Type': 'application/json' },
            ...opcoes
        });
    } catch (erro) {
        throw new Error('Não foi possível comunicar com o servidor.');
    }

    let dados = null;
    try {
        dados = await resposta.json();
    } catch (erro) {
        dados = null;
    }

    if (!resposta.ok) {
        throw new Error((dados && dados.erro) || `Erro ${resposta.status} ao comunicar com o servidor.`);
    }

    return dados;
}

async function carregarBaralho() {
    try {
        pokemonsCadastrados = await requisitarApi(URL_API_BARALHO);
        criarCardPokemon();
    } catch (erro) {
        feedback.textContent = `❌ Não foi possível carregar o baralho: ${erro.message}`;
        feedback.style.color = 'red';
    }
}

function obterEstiloPorTipo(tipos = []) {
    const tipo = (tipos[0] || 'normal').toLowerCase();

    const estilos = [
        {
            tipo: 'water',
            borda: '#2980d9',
            fundo: '#dcecff'
        },
        { 
            tipo: 'grass', 
            borda: '#3a9d3a', 
            fundo: '#e0f6dc' 
        },
        { 
            tipo: 'electric', 
            borda: '#d4a800', 
            fundo: '#fff7c2' 
        },
        { 
            tipo: 'poison', 
            borda: '#8e44ad', 
            fundo: '#eddcf5' 
        },
        { 
            tipo: 'ghost', 
            borda: '#a653ca', 
            fundo: '#f2d6ff' 
        },
        { 
            tipo: 'fire', 
            borda: '#e25822', 
            fundo: '#ffe3d6' 
        },
        { 
            tipo: 'psychic', 
            borda: '#f777c6', 
            fundo: '#fad6ff' 
        },
        { 
            tipo: 'ice', 
            borda: '#65f5ff', 
            fundo: '#ddf1fc' 
        },
        { 
            tipo: 'fighting', 
            borda: '#ff7878', 
            fundo: '#fff1f1' 
        },
        { 
            tipo: 'ground', 
            borda: '#ffcd9c', 
            fundo: '#ffeacc' 
        },
        { 
            tipo: 'bug', 
            borda: '#9bff7c', 
            fundo: '#ebffe5' 
        },
        { 
            tipo: 'dragon', 
            borda: '#7ca5ff', 
            fundo: '#edecff' 
        },
        { 
            tipo: 'dark', 
            borda: '#dadada',
            fundo: '#edecff' 
        },
        { 
            tipo: 'fairy', 
            borda: '#fc96ff', 
            fundo: '#fae8ff' 
        }
    ];

    for (let i = 0; i < estilos.length; i++) {
        if (estilos[i].tipo === tipo) {
            return {
                borda: estilos[i].borda,
                fundo: estilos[i].fundo
            };
    }
}

    return { borda: '#dadada', fundo: '#dbdbdb' };
}

async function buscarDadosPokemon(nome) {
    const nomeFormatado = nome.toLowerCase().trim();

    try {
        const resposta = await fetch(`${URL_POKEAPI}/${nomeFormatado}`);

        if (!resposta.ok) {
            return null;
        }

        const dados = await resposta.json();
        return dados;
    } catch (erro) {
        return null;
    }
}

function extrairImagemPokemon(dadosPokemon) {
    if (!dadosPokemon) {
        return null;
    }

    return dadosPokemon.sprites?.other?.['official-artwork']?.front_default
        || dadosPokemon.sprites?.front_default
        || null;
}

function extrairTipoPokemon(dadosPokemon) {
    if (!dadosPokemon || !dadosPokemon.types) {
        return [];
    }

    return dadosPokemon.types.map(function (item) {
        return item.type.name;
    });
}

function mostrarPokemon(dadosPokemon) {
    const imagem = extrairImagemPokemon(dadosPokemon);
    const tipos = extrairTipoPokemon(dadosPokemon);
    const poder = dadosPokemon.base_experience || 0;

    if (!dadosPokemon) {
        imgPokemon.innerHTML = '<h3 class="txtBranco">ERROR: POKÉMON NÃO ENCONTRADO... </h3>';
        tipoInput.value = '';
        poderInput.value = '';
        return;
    }

    if (imagem) {
        imgPokemon.innerHTML = `<img src="${imagem}" alt="${dadosPokemon.name}" width="150">`;
    }

    tipoInput.value = tipos.join(', ');
    poderInput.value = poder;
}

function verificarPokemonCampeao() {
    if (!pokemonsCadastrados.length) {
        return null;
    }

    return pokemonsCadastrados.reduce(function (campeao, pokemon) {
        return pokemon.poder > campeao.poder ? pokemon : campeao;
    });
}

function criarCardPokemon() {
    const pokemonCampeao = verificarPokemonCampeao();

    container.innerHTML = '';
    pokemonsCadastrados.sort(function (a, b) {
        return b.poder - a.poder;
    });

    pokemonsCadastrados.forEach(function (poke) {
        const estilo = obterEstiloPorTipo(poke.tipos);
        const ehCampeao = pokemonCampeao && poke.nome === pokemonCampeao.nome;
        const card = document.createElement('div');
        const coroaPokemonCampeao = ehCampeao ? `<h1>👑</h1>` : `<div class="espaco"></div>`;

        card.className = ehCampeao ? 'card-pokemon-campeao' : 'card-pokemon';
        card.style.border = `3px solid ${estilo.borda}`;
        card.style.background = estilo.fundo;
        card.style.color = '#000';

        card.innerHTML = `
        <button class="btn-remover" aria-label="Remover ${escaparHTML(poke.nome)}">x</button>

        ${coroaPokemonCampeao}

        <div class="imgPokemon">
            <img src="${escaparHTML(poke.imagem)}" alt="${escaparHTML(poke.nome)}">
        </div>

        <p><strong>Nome:</strong> ${escaparHTML(poke.nome)}</p>
        <p><strong>Tipo:</strong> ${escaparHTML(poke.tipos.join(', '))}</p>
        <p><strong>Treinador:</strong> ${escaparHTML(poke.treinador || 'Sem Treinador')}</p>
        <p><strong>Poder:</strong> ${escaparHTML(poke.poder)}</p>`;

        card.querySelector('.btn-remover').addEventListener('click', function () {
            removerPokemon(poke.id);
        });

        container.appendChild(card);
    });
}

async function removerPokemon(id) {
    try {
        await requisitarApi(`${URL_API_BARALHO}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (erro) {
        feedback.textContent = `❌ Não foi possível remover: ${erro.message}`;
        feedback.style.color = 'red';
        return;
    }

    pokemonsCadastrados = pokemonsCadastrados.filter(function (poke) {
        return poke.id !== id;
    });

    criarCardPokemon();
}

form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const nome = nomeInput.value.trim();
    const treinador = treinadorInput.value.trim();
    const poder = Number(poderInput.value);

    feedback.textContent = '';

    if (nome.length < 3) {
        feedback.textContent = '❌ Nome deve conter ao menos 3 caracteres.';
        feedback.style.color = 'red';
        return;
    }

    if (poder < 100) {
        feedback.textContent = '❌ O poder do Pokémon precisa ser maior ou igual a 100.';
        feedback.style.color = 'red';
        return;
    }

    if (!Number.isInteger(poder)) {
        feedback.textContent = '❌ O poder do Pokémon precisa ser um número inteiro.';
        feedback.style.color = 'red';
        return;
    }

    const jaCadastrado = pokemonsCadastrados.some(function (poke) {
        return poke.nome.toLowerCase() === nome.toLowerCase();
    });

    if (jaCadastrado) {
        feedback.textContent = '❌ Este Pokémon já foi cadastrado!';
        feedback.style.color = 'red';
        return;
    }

    const dadosApi = await buscarDadosPokemon(nome);

    if (!dadosApi) {
        feedback.textContent = '❌ Pokémon não encontrado.';
        feedback.style.color = 'red';
        return;
    }

    const tipos = extrairTipoPokemon(dadosApi);
    const imagem = extrairImagemPokemon(dadosApi);

    botaoEnviar.disabled = true;

    try {
        const pokemonSalvo = await requisitarApi(URL_API_BARALHO, {
            method: 'POST',
            body: JSON.stringify({
                nome: nome,
                treinador: treinador,
                poder: poder,
                tipos: tipos,
                imagem: imagem
            })
        });

        pokemonsCadastrados.push(pokemonSalvo);
    } catch (erro) {
        feedback.textContent = `❌ ${erro.message}`;
        feedback.style.color = 'red';
        return;
    } finally {
        botaoEnviar.disabled = false;
    }

    feedback.textContent = '✅ Pokémon cadastrado com sucesso!';
    feedback.style.color = 'green';

    form.reset();
    imgPokemon.innerHTML = '';

    criarCardPokemon();
});

nomeInput.addEventListener('input', function () {
    const nome = nomeInput.value.trim();

    clearTimeout(debounceBusca);

    if (nome.length < 3) {
        feedback.textContent = '❌ Digite pelo menos 3 caracteres.';
        feedback.style.color = 'red';
        imgPokemon.innerHTML = '';
        tipoInput.value = '';
        poderInput.value = '';
        return;
    }

    debounceBusca = setTimeout(async function () {
        const dadosApi = await buscarDadosPokemon(nome);

        if (!dadosApi) {
            feedback.textContent = '❌ Pokémon não encontrado.';
            feedback.style.color = 'red';
            imgPokemon.innerHTML = '';
            tipoInput.value = '';
            poderInput.value = '';
            return;
        }

        mostrarPokemon(dadosApi);
        feedback.textContent = '✅ Pokemon encontrado!';
        feedback.style.color = 'green';
    }, 700);
});
carregarBaralho();
