const mongoose = require('mongoose');

const TruequeSchema = new mongoose.Schema({
  productorA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // El que propone
  productorB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // El que recibe

  ofertaA: {
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    cantidad: { type: Number, required: true }
  },

  ofertaB: {
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    cantidad: { type: Number, required: true }
  },

  ajusteTokens: { type: Number, default: 0 }, // Tokens que A le da a B (si es positivo) o B a A (si es negativo)

  estado: { 
    type: String, 
    enum: ['pendiente', 'aceptado', 'rechazado', 'completado'], 
    default: 'pendiente' 
  },

  tokensTransferidos: { type: Boolean, default: false },

  mensaje: { type: String },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Trueque', TruequeSchema);
