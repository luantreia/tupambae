const mongoose = require('mongoose');

const TokenLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  reason: { 
    type: String, 
    required: true,
    enum: [
      'pedido_completado', 
      'trueque_completado', 
      'perfil_completo', 
      'primera_publicacion', 
      'producto_publicado', 
      'producto_actualizado'
    ]
  },
  referenceId: { type: mongoose.Schema.Types.ObjectId }, // ID del pedido, trueque o producto
  createdAt: { type: Date, default: Date.now }
});

// Índice para evitar duplicados en acciones de una sola vez
TokenLogSchema.index({ user: 1, reason: 1, referenceId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('TokenLog', TokenLogSchema);
