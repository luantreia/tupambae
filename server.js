const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { apiLimiter, authLimiter, createResourceLimiter, criticalLimiter } = require('./middleware/rateLimiter');
const { httpLogger, logger } = require('./utils/logger');
const { sanitizeInput, addSecurityHeaders, detectMaliciousContent } = require('./middleware/security');
const { cacheMiddleware } = require('./utils/cache');
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

// Middleware de Logging estructurado
app.use(httpLogger);

// Middleware de seguridad
app.use(addSecurityHeaders);
app.use(detectMaliciousContent);

// Middleware de compresión
app.use(compression());

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: true, // Permite cualquier origen en desarrollo/producción para evitar bloqueos de CORS
  credentials: true
}));
app.use(express.json());

// Middleware de sanitización de inputs
app.use(sanitizeInput);

// Middleware de caché para endpoints específicos
app.use('/api/productores', cacheMiddleware(1800)); // 30 minutos
app.use('/api/productos', cacheMiddleware(900)); // 15 minutos

// Rate limiting general para API
app.use('/api/', apiLimiter);

// Health Check para Render
app.get('/health', (req, res) => res.status(200).send('OK'));

// DB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    logger.info('MongoDB conectado exitosamente');
    
    // Crear índices optimizados
    try {
      const { createIndexes } = require('./models/index');
      await createIndexes();
      logger.info('Índices de MongoDB verificados/creados');
    } catch (error) {
      logger.error('Error creando índices', { error: error.message });
    }
  })
  .catch(err => {
    logger.error('Error conectando a MongoDB', { error: err.message });
    process.exit(1);
  });

// Routes con rate limiting específico
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/productores', require('./routes/producerRoutes'));
app.use('/api/productos', createResourceLimiter, require('./routes/productRoutes'));
app.use('/api/pedidos', criticalLimiter, require('./routes/orderRoutes'));
app.use('/api/notificaciones', require('./routes/notifications'));
app.use('/api/usuarios', require('./routes/userRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/trueques', criticalLimiter, require('./routes/truequeRoutes'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Servidor iniciado en puerto ${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});
