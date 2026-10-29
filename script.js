const form = document.querySelector('#pokemon');
const feedback = document.querySelector('#feedback');
const imgPokemon = document.querySelector('#imgPokemon');
const nomeInput = document.querySelector('#nome');
const treinadorInput = document.querySelector('#treinador');
const poderInput = document.querySelector('#poder');
const tipoInput = document.querySelector('#tipo');
const container = document.querySelector('#container');

const URL_POKEAPI = 'https://pokeapi.co/api/v2/pokemon';

let debounceBusca;
let pokemonsCadastrados = [];

function obterEstiloPorTipo(tipos = []) {
    const tipo = (tipos[0] || 'normal').toLowerCase();

    if (tipo === 'water') {
        return { borda: '#2980d9', fundo: '#dcecff' };
    }

    else if (tipo === 'grass') {
        return { borda: '#3a9d3a', fundo: '#e0f6dc' };
    }

    else if (tipo === 'electric') {
        return { borda: '#d4a800', fundo: '#fff7c2' };
    }

    else if (tipo === 'poison') {
        return { borda: '#8e44ad', fundo: '#eddcf5' };
    }

    else if (tipo === 'fire') {
        return { borda: '#e25822', fundo: '#ffe3d6' };
    } 
    
    else if (tipo === 'psychic') {
        return { borda: '#f777c6', fundo: '#fad6ff' };
    }

    else if (tipo === 'ice') {
        return { borda: '#65f5ff', fundo: '#ddf1fc' };
    }

    else if (tipo === 'fighting') {
        return { borda: '#ff7878', fundo: '#fff1f1' };
    }

    else if (tipo === 'ground ') {
        return { borda: '#ffcd9c', fundo: '#ffeacc' };
    }

    else if (tipo === 'bug') {
        return { borda: '#9bff7c', fundo: '#ebffe5' };
    }

    else if (tipo === 'dragon') {
        return { borda: '#7ca5ff', fundo: '#edecff' };
    }

    else if (tipo === 'dark') {
        return { borda: '#dadada', fundo: '#edecff' };
    }

    else if (tipo === 'fairy') {
        return { borda: '#fc96ff', fundo: '#fae8ff' };
    }

    else {
        return { borda: '#dadada', fundo: '#dbdbdb' };
    }
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

    return dadosPokemon.sprites?.other?.['official-artwork']?.front_default;
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
    let pokemonCampeao = false;
}

function criarCardPokemon() {
    container.innerHTML = '';
    verificarPokemonCampeao();

    pokemonsCadastrados.sort(function (a, b) {
        return b.poder - a.poder;
    });

    if (pokemonCampeao = true) {
        pokemonsCadastrados.forEach(function (poke) {
            const estilo = obterEstiloPorTipo(poke.tipos);
            const cardCampeao = document.createElement('div');

            cardCampeao.className = 'card-pokemon-campeao';
            cardCampeao.style.border = `3px solid ${estilo.borda}`;
            cardCampeao.style.background = estilo.fundo;
            cardCampeao.style.color = '#000';

            cardCampeao.innerHTML = `
            <button class="btn-remover" onclick="removerPokemon('${poke.nome}')" aria-label="Remover ${poke.nome}">×</button>
            <div class="imgPokemon">
                <img src="${poke.imagem}" alt="${poke.nome}">
            </div>
            <p><strong>Nome:</strong> ${poke.nome}</p>
            <p><strong>Tipo:</strong> ${poke.tipos.join(', ')}</p>
            <p><strong>Treinador:</strong> ${poke.treinador || 'Sem Treinador'}</p>
            <p><strong>Poder:</strong> ${poke.poder}</p>`;

            container.appendChild(cardCampeao);
        });
    } else {

        pokemonsCadastrados.forEach(function (poke) {
            const estilo = obterEstiloPorTipo(poke.tipos);
            const card = document.createElement('div');

            card.className = 'card-pokemon';
            card.style.border = `3px solid ${estilo.borda}`;
            card.style.background = estilo.fundo;
            card.style.color = '#000';

            card.innerHTML = `
            <button class="btn-remover" onclick="removerPokemon('${poke.nome}')" aria-label="Remover ${poke.nome}">×</button>
            <div class="imgPokemon">
                <img src="${poke.imagem}" alt="${poke.nome}">
            </div>
            <p><strong>Nome:</strong> ${poke.nome}</p>
            <p><strong>Tipo:</strong> ${poke.tipos.join(', ')}</p>
            <p><strong>Treinador:</strong> ${poke.treinador || 'Sem Treinador'}</p>
            <p><strong>Poder:</strong> ${poke.poder}</p>`;

            container.appendChild(card);
        });
    }
}

window.removerPokemon = function (nome) {
    pokemonsCadastrados = pokemonsCadastrados.filter(function (poke) {
        return poke.nome !== nome;
    });

    criarCardPokemon();
};

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

    pokemonsCadastrados.push({
        nome: nome,
        treinador: treinador,
        poder: poder,
        tipos: tipos,
        imagem: imagem
    });

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
