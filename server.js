const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Validación de variables de entorno críticas
const requiredEnv = ['MONGO_URI', 'JWT_SECRET'];
requiredEnv.forEach(env => {
  if (!process.env[env]) {
    console.error(`FATAL ERROR: ${env} no está definido.`);
    process.exit(1);
  }
});

// Middleware de Logging básico
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Middleware
app.use(helmet()); // Seguridad de cabeceras HTTP
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// DB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB conectado'))
  .catch(err => console.log(err));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/productores', require('./routes/producerRoutes'));
app.use('/api/productos', require('./routes/productRoutes'));
app.use('/api/pedidos', require('./routes/orderRoutes'));
app.use('/api/notificaciones', require('./routes/notifications'));
app.use('/api/usuarios', require('./routes/userRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/trueques', require('./routes/truequeRoutes'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
