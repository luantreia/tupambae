const redis = require('redis');
const { logger } = require('./logger');

let client = null;
let isConnected = false;

// Configuración de Redis
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3
};

// Inicializar cliente Redis
const initRedis = async () => {
  try {
    client = redis.createClient(redisConfig);
    
    client.on('connect', () => {
      isConnected = true;
      logger.info('Redis conectado exitosamente');
    });

    client.on('error', (err) => {
      isConnected = false;
      logger.error('Error en conexión Redis', { error: err.message });
    });

    client.on('end', () => {
      isConnected = false;
      logger.warn('Conexión Redis cerrada');
    });

    await client.connect();
    return true;
  } catch (error) {
    logger.error('Error inicializando Redis', { error: error.message });
    isConnected = false;
    return false;
  }
};

// Verificar si Redis está disponible
const isRedisAvailable = () => {
  return isConnected && client && client.isOpen;
};

// Función genérica para caché
const cache = {
  // Obtener valor del caché
  async get(key) {
    try {
      if (!isRedisAvailable()) {
        return null;
      }
      
      const value = await client.get(key);
      if (value) {
        logger.debug(`Cache HIT para key: ${key}`);
        return JSON.parse(value);
      }
      
      logger.debug(`Cache MISS para key: ${key}`);
      return null;
    } catch (error) {
      logger.error('Error obteniendo valor del caché', { key, error: error.message });
      return null;
    }
  },

  // Guardar valor en caché con TTL
  async set(key, value, ttlSeconds = 3600) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      const serializedValue = JSON.stringify(value);
      await client.setEx(key, ttlSeconds, serializedValue);
      logger.debug(`Cache SET para key: ${key}, TTL: ${ttlSeconds}s`);
      return true;
    } catch (error) {
      logger.error('Error guardando valor en caché', { key, error: error.message });
      return false;
    }
  },

  // Eliminar valor del caché
  async del(key) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      await client.del(key);
      logger.debug(`Cache DEL para key: ${key}`);
      return true;
    } catch (error) {
      logger.error('Error eliminando valor del caché', { key, error: error.message });
      return false;
    }
  },

  // Verificar si existe en caché
  async exists(key) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Error verificando existencia en caché', { key, error: error.message });
      return false;
    }
  },

  // Establecer TTL para una clave existente
  async expire(key, ttlSeconds) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      await client.expire(key, ttlSeconds);
      return true;
    } catch (error) {
      logger.error('Error estableciendo TTL en caché', { key, error: error.message });
      return false;
    }
  },

  // Obtener TTL restante
  async ttl(key) {
    try {
      if (!isRedisAvailable()) {
        return -1;
      }
      
      return await client.ttl(key);
    } catch (error) {
      logger.error('Error obteniendo TTL del caché', { key, error: error.message });
      return -1;
    }
  },

  // Limpiar caché por patrón
  async clearPattern(pattern) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
        logger.info(`Cache CLEAR para patrón: ${pattern}, keys eliminadas: ${keys.length}`);
      }
      return true;
    } catch (error) {
      logger.error('Error limpiando caché por patrón', { pattern, error: error.message });
      return false;
    }
  },

  // Incrementar contador
  async incr(key, ttlSeconds = 3600) {
    try {
      if (!isRedisAvailable()) {
        return null;
      }
      
      const result = await client.incr(key);
      if (ttlSeconds > 0) {
        await client.expire(key, ttlSeconds);
      }
      return result;
    } catch (error) {
      logger.error('Error incrementando contador en caché', { key, error: error.message });
      return null;
    }
  }
};

// Funciones específicas para la aplicación
const appCache = {
  // Caché de productores
  async getProducers(params = {}) {
    const key = `producers:${JSON.stringify(params)}`;
    return await cache.get(key);
  },

  async setProducers(params, producers, ttlSeconds = 1800) { // 30 minutos
    const key = `producers:${JSON.stringify(params)}`;
    return await cache.set(key, producers, ttlSeconds);
  },

  // Caché de productos por productor
  async getProductsByProducer(producerId) {
    const key = `products:producer:${producerId}`;
    return await cache.get(key);
  },

  async setProductsByProducer(producerId, products, ttlSeconds = 1800) {
    const key = `products:producer:${producerId}`;
    return await cache.set(key, products, ttlSeconds);
  },

  // Caché de perfil de usuario
  async getUserProfile(userId) {
    const key = `user:profile:${userId}`;
    return await cache.get(key);
  },

  async setUserProfile(userId, profile, ttlSeconds = 3600) { // 1 hora
    const key = `user:profile:${userId}`;
    return await cache.set(key, profile, ttlSeconds);
  },

  // Caché de sesión
  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    return await cache.get(key);
  },

  async setSession(sessionId, sessionData, ttlSeconds = 86400) { // 24 horas
    const key = `session:${sessionId}`;
    return await cache.set(key, sessionData, ttlSeconds);
  },

  // Caché de rate limiting
  async getRateLimit(ip, endpoint) {
    const key = `rate:${ip}:${endpoint}`;
    return await cache.get(key);
  },

  async setRateLimit(ip, endpoint, count, ttlSeconds = 900) { // 15 minutos
    const key = `rate:${ip}:${endpoint}`;
    return await cache.set(key, count, ttlSeconds);
  },

  // Caché de búsquedas populares
  async getPopularSearches() {
    const key = 'searches:popular';
    return await cache.get(key);
  },

  async setPopularSearches(searches, ttlSeconds = 3600) { // 1 hora
    const key = 'searches:popular';
    return await cache.set(key, searches, ttlSeconds);
  },

  // Invalidar caché relacionado con un usuario
  async invalidateUserCache(userId) {
    const patterns = [
      `user:profile:${userId}`,
      `products:producer:${userId}`,
      `producers:*` // Invalidate all producers cache
    ];
    
    for (const pattern of patterns) {
      await cache.clearPattern(pattern);
    }
  },

  // Invalidar caché de productos
  async invalidateProductCache() {
    const patterns = [
      'products:*',
      'producers:*'
    ];
    
    for (const pattern of patterns) {
      await cache.clearPattern(pattern);
    }
  }
};

// Middleware para caché de respuestas HTTP
const cacheMiddleware = (ttlSeconds = 300) => { // 5 minutos por defecto
  return async (req, res, next) => {
    // Solo cachear requests GET
    if (req.method !== 'GET') {
      return next();
    }

    // No cachear si el usuario lo solicita explícitamente
    if (req.headers['cache-control'] === 'no-cache') {
      return next();
    }

    const key = `response:${req.originalUrl}`;
    
    try {
      const cached = await cache.get(key);
      if (cached) {
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-TTL', await cache.ttl(key));
        return res.json(cached);
      }
    } catch (error) {
      logger.error('Error en middleware de caché', { error: error.message });
    }

    // Interceptar respuesta para guardarla en caché
    const originalJson = res.json;
    res.json = function(data) {
      // No cachear respuestas de error
      if (res.statusCode >= 400) {
        return originalJson.call(this, data);
      }

      // Guardar respuesta exitosa en caché
      cache.set(key, data, ttlSeconds).catch(err => {
        logger.error('Error guardando respuesta en caché', { error: err.message });
      });

      res.set('X-Cache', 'MISS');
      return originalJson.call(this, data);
    };

    next();
  };
};

// Inicializar Redis al iniciar el módulo
initRedis();

module.exports = {
  cache,
  appCache,
  cacheMiddleware,
  initRedis,
  isRedisAvailable
};
