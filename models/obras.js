const mongoose = require('mongoose');

const obraSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  preco: { type: Number, required: true },
  imagemURL: { type: String, required: true },
  estoque: { type: Number, required: true },
});

const Obra = mongoose.model('Obra', obraSchema);

module.exports = Obra;
