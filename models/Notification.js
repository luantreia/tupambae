const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { 
    type: String, 
    enum: ['pedido_nuevo', 'pedido_aceptado', 'pedido_rechazado', 'pedido_completado', 'pedido_cancelado'],
    required: true 
  },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  message: { type: String, required: true },
  cta: { type: String }, // URL for the CTA
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema);
