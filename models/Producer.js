const mongoose = require('mongoose');

const ProducerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  descripcion: { type: String, required: true },
  categoria: { type: String, default: 'Otros' },
  zona: { type: String, required: true },
  contacto: { type: String, required: true },
  ubicacion: {
    lat: { type: Number, default: -34.6037 }, // Default Buenos Aires
    lng: { type: Number, default: -58.3816 }
  }
});

module.exports = mongoose.model('Producer', ProducerSchema);
