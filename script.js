const form = document.querySelector('#pokemon');
const feedback = document.querySelector('#feedback');
const imgPokemon = document.querySelector('#imgPokemon');
const nomeInput = document.querySelector('#nome');
const treinadorInput = document.querySelector('#treinador');
const poderInput = document.querySelector('#poder');
const tipoInput = document.querySelector('#tipo');
const btnReset = document.querySelector('#btn-reset');
const container = document.querySelector('#container');

const URL_POKEAPI = 'https://pokeapi.co/api/v2/pokemon';

let debounceBusca;
let pokemonsCadastrados = [];

const tipoCor = [
    { tipo: "normal", borda: "#7f8c8d", fundo: "#ececec" },
    { tipo: "water", borda: "#2980d9", fundo: "#dcecff" },
    { tipo: "grass", borda: "#3a9d3a", fundo: "#e0f6dc" },
    { tipo: "electric", borda: "#d4a800", fundo: "#fff7c2" },
    { tipo: "poison", borda: "#8e44ad", fundo: "#eddcf5" },
    { tipo: "fire", borda: "#e25822", fundo: "#ffe3d6" }
];

async function buscarDadosPokemon(nome) {
    const nomeFormatado = nome.toLowerCase().trim();
    try {
        const resposta = await fetch(`${URL_POKEAPI}/${nomeFormatado}`);
        if (!resposta.ok) {
            throw new Error('Pokémon não encontrado na PokeAPI');
        }
        return await resposta.json();
    } catch (error) {
        return null;
    }
}

function extrairImagemPokemon(dadosPokemon) {
    if (!dadosPokemon) return null;
    return dadosPokemon.sprites?.other?.['official-artwork']?.front_default;
}

function extrairTipoPokemon(dadosPokemon) {
    if (!dadosPokemon.types) return [];
    return dadosPokemon.types.map(item => item.type.name);
}

function mostrarPokemon(dadosPokemon) {
    const imagem = extrairImagemPokemon(dadosPokemon);
    const tipos = extrairTipoPokemon(dadosPokemon);
    const poder = dadosPokemon.base_experience || 0;

    if (!dadosPokemon) {
        imgPokemon.innerHTML = `<h3 class="txtBranco">ERROR: POKÉMON NÃO ENCONTRADO... </h3>`;
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

function renderizarPokemons() {
    container.innerHTML = '';

    pokemonsCadastrados.sort((a, b) => b.poder - a.poder);

    pokemonsCadastrados.forEach((poke) => {
        let corEncontrada = tipoCor.find(c => poke.tipos.includes(c.tipo));
        let cor = corEncontrada ? corEncontrada : tipoCor[0];

        const card = document.createElement('div');
        card.className = 'card-pokemon';
        card.style.border = `3px solid ${cor.borda}`;
        card.style.background = cor.fundo;
        card.style.color = "#000";

        card.innerHTML = `
            <div class="imgPokemon">
                <img src="${poke.imagem}" alt="${poke.nome}">
            </div>
            <p><strong>Nome:</strong> ${poke.nome}</p>
            <p><strong>Tipo:</strong> ${poke.tipos.join(', ')}</p>
            <p><strong>Treinador:</strong> ${poke.treinador || "Sem Treinador"}</p>
            <p><strong>Poder:</strong> ${poke.poder}</p>
            <button class="btn-excluir" onclick="removerPokemon('${poke.nome}')">Excluir</button>
        `;

        container.appendChild(card);
    });
}

window.removerPokemon = function(nome) {
    pokemonsCadastrados = pokemonsCadastrados.filter(poke => poke.nome !== nome);
    renderizarPokemons();
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

    const jaCadastrado = pokemonsCadastrados.some(p => p.nome.toLowerCase() === nome.toLowerCase());
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

    pokemonsCadastrados.push({
        nome: nome,
        treinador: treinador,
        poder: poder,
        tipos: tipos,
        imagem: imagem
    });

    feedback.textContent = `✅ Pokémon cadastrado com sucesso!`;
    feedback.style.color = 'green';

    form.reset();
    imgPokemon.innerHTML = '';
    
    renderizarPokemons();
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
        feedback.textContent = `✅ Pokemon encontrado!`;
        feedback.style.color = 'green';
    }, 700);
});