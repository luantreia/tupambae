const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  roles: {
    consumidor: { type: Boolean, default: true },
    productor: {
      activo: { type: Boolean, default: false },
      aprobado: { type: Boolean, default: false },
      nivel: { type: Number, default: 1 }
    }
  },
  rolActivo: { 
    type: String, 
    enum: ['productor', 'consumidor'], 
    default: 'consumidor' 
  },
  zona: { type: String, required: true },
  telefono: { type: String },
  tokens: { type: Number, default: 0 },
  activo: { type: Boolean, default: true },
  contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isSelecto: { type: Boolean, default: false },
  reputationScore: { type: Number, default: 0 }
});

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model('User', UserSchema);
