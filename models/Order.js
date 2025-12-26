const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  consumidor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productor: { type: mongoose.Schema.Types.ObjectId, ref: 'Producer', required: true },
  items: [{
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    nombre: String,
    precio: Number,
    cantidad: { type: Number, required: true },
    unidad: String
  }],
  total: { type: Number, required: true },
  estado: { 
    type: String, 
    enum: ['pendiente', 'aceptado', 'rechazado', 'completado', 'cancelado'], 
    default: 'pendiente' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);
