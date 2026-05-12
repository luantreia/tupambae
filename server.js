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

// DB Connection con fallback a conexión directa
console.log('Conectando a MongoDB...');

// Función para convertir SRV a conexión directa
const convertToDirectConnection = (srvUri) => {
  try {
    const url = new URL(srvUri);
    const hostname = url.hostname;
    
    // Extraer cluster info del hostname
    const clusterMatch = hostname.match(/^([^.]+)\.mongodb\.net$/);
    if (!clusterMatch) return null;
    
    const clusterName = clusterMatch[1];
    const username = url.username;
    const password = url.password;
    const database = url.pathname.substring(1); // Remove leading /
    
    // Construir URI directa (formato común de MongoDB Atlas)
    const directUri = `mongodb://${username}:${password}@${clusterName}-shard-00-00.mongodb.net:27017,${clusterName}-shard-00-01.mongodb.net:27017,${clusterName}-shard-00-02.mongodb.net:27017/${database}?ssl=true&replicaSet=atlas-${clusterName}&authSource=admin&retryWrites=true&w=majority`;
    
    console.log('🔄 Intentando conexión directa como fallback...');
    return directUri;
  } catch (error) {
    console.error('Error convirtiendo a conexión directa:', error.message);
    return null;
  }
};

const connectWithRetry = async (maxRetries = 3) => {
  const originalUri = process.env.MONGO_URI;
  let useDirectFallback = false;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const uri = useDirectFallback ? convertToDirectConnection(originalUri) : originalUri;
      
      if (!uri) {
        throw new Error('No se pudo generar URI de conexión directa');
      }
      
      console.log(`Intento ${i + 1}/${maxRetries} de conexión a MongoDB...`);
      console.log(`Usando: ${useDirectFallback ? 'conexión directa' : 'SRV'}`);
      
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000, // 15 segundos timeout
        connectTimeoutMS: 15000,
        socketTimeoutMS: 45000,
      });
      
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
      
      return true;
    } catch (err) {
      console.error(`✗ Intento ${i + 1} fallido:`, err.message);
      
      // Si falla por DNS y no hemos intentado conexión directa, cambiar al fallback
      if (err.message.includes('ENOTFOUND') && !useDirectFallback) {
        console.log('🔄 Detectado problema de DNS, cambiando a conexión directa...');
        useDirectFallback = true;
        i--; // Reintentar con conexión directa
        continue;
      }
      
      if (i === maxRetries - 1) {
        console.error('\n❌ No se pudo conectar a MongoDB después de varios intentos.');
        console.error('Posibles soluciones:');
        console.error('1. Verifica que el MongoDB URI sea correcto');
        console.error('2. Asegúrate que MongoDB Atlas permita conexiones desde Render (IP whitelist)');
        console.error('3. Configura "Allow access from anywhere" (0.0.0.0/0) en MongoDB Atlas');
        console.error('4. Verifica que las credenciales sean correctas');
        console.error('\nError final:', err.message);
        logger.error('Error conectando a MongoDB', { error: err.message });
        process.exit(1);
      }
      
      // Esperar antes del siguiente intento
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
};

connectWithRetry();

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
