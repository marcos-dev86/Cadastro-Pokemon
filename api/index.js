const { criarServidor } = require('../server.js');
const servidor = criarServidor();

module.exports = (req, res) => servidor.emit('request', req, res);
