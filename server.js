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
const missingEnv = requiredEnv.filter(env => !process.env[env]);

if (missingEnv.length > 0) {
  console.error('FATAL ERROR: Las siguientes variables de entorno son requeridas:');
  missingEnv.forEach(env => console.error(`  - ${env}`));
  console.error('\nPor favor configura estas variables en tu entorno de producción.');
  process.exit(1);
}

// Log de configuración (sin mostrar valores sensibles)
console.log('Configuración del servidor:');
console.log(`  - MONGO_URI: ${process.env.MONGO_URI ? '✓ Configurada' : '✗ No configurada'}`);
console.log(`  - JWT_SECRET: ${process.env.JWT_SECRET ? '✓ Configurada' : '✗ No configurada'}`);
console.log(`  - PORT: ${process.env.PORT || 5000}`);
console.log(`  - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

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
console.log('Conectando a MongoDB...');
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✓ MongoDB conectado exitosamente');
    logger.info('MongoDB conectado exitosamente');
    
    // Crear índices optimizados
    try {
      console.log('Verificando/creando índices...');
      const { createIndexes } = require('./models/index');
      await createIndexes();
      console.log('✓ Índices de MongoDB verificados/creados');
      logger.info('Índices de MongoDB verificados/creados');
    } catch (error) {
      console.error('✗ Error creando índices:', error.message);
      logger.error('Error creando índices', { error: error.message });
    }
  })
  .catch(err => {
    console.error('✗ Error conectando a MongoDB:', err.message);
    console.error('Detalles del error:', err);
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
