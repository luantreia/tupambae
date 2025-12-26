const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  precio: { type: Number, required: true },
  unidad: { type: String, required: true }, // kg, litro, unidad, etc.
  categoria: { type: String, required: true, default: 'Otros' },
  subcategoria: { type: String }, // Reservado para futuro
  tags: [{ type: String }], // Etiquetas libres
  disponible: { type: Boolean, default: true },
  productor: { type: mongoose.Schema.Types.ObjectId, ref: 'Producer', required: true }
});

module.exports = mongoose.model('Product', ProductSchema);
