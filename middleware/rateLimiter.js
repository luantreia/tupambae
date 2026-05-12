const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// Configuración general de rate limiting
const createRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // límite de 100 requests por ventana
    message: {
      error: 'Demasiadas solicitudes desde esta IP, por favor intenta nuevamente más tarde.',
      retryAfter: '15 minutos'
    },
    standardHeaders: true, // Devuelve información de rate limit en headers
    legacyHeaders: false, // Deshabilita headers legacy
    ...options
  });
};

// Rate limiting estricto para endpoints de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos de login/registro
  message: {
    error: 'Demasiados intentos de autenticación. Por favor espera 15 minutos antes de intentar nuevamente.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // No cuenta requests exitosas
});

// Rate limiting para creación de recursos
const createResourceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // máximo 20 creaciones por hora
  message: {
    error: 'Límite de creaciones alcanzado. Por favor espera antes de crear más recursos.',
    retryAfter: '1 hora'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para operaciones críticas (trueques, pedidos)
const criticalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10, // máximo 10 operaciones críticas
  message: {
    error: 'Demasiadas operaciones críticas. Por favor espera unos minutos.',
    retryAfter: '5 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para API endpoints generales
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // máximo 200 requests por ventana
  message: {
    error: 'Límite de API alcanzado. Por favor reduce el ritmo de solicitudes.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Omitir rate limiting para requests internos o health checks
    return req.path === '/health' || req.ip === '127.0.0.1';
  }
});

// Rate limiting específico por usuario (requiere autenticación)
const createUserLimiter = () => {
  const userLimits = new Map(); // Almacenamiento temporal (en producción usar Redis)

  return (req, res, next) => {
    if (!req.user || !req.user.id) {
      return next(); // Si no hay usuario, usar rate limiting general
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutos
    const maxRequests = 50;

    if (!userLimits.has(userId)) {
      userLimits.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const userLimit = userLimits.get(userId);

    if (now > userLimit.resetTime) {
      // Resetear ventana
      userLimits.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (userLimit.count >= maxRequests) {
      const remainingTime = Math.ceil((userLimit.resetTime - now) / 1000 / 60);
      return res.status(429).json({
        error: `Límite de usuario alcanzado. Por favor espera ${remainingTime} minutos.`,
        retryAfter: `${remainingTime} minutos`
      });
    }

    userLimit.count++;
    next();
  };
};

// Rate limiting para uploads de archivos
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // máximo 10 uploads por hora
  message: {
    error: 'Límite de uploads alcanzado. Por favor espera antes de subir más archivos.',
    retryAfter: '1 hora'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware para detectar y bloquear IPs sospechosas
const suspiciousIPLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // máximo 30 requests por minuto
  message: {
    error: 'Actividad sospechosa detectada. Por favor reduce el ritmo de solicitudes.',
    retryAfter: '1 minuto'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Usar combinación de IP (con soporte IPv6) y User-Agent para mejor detección
    const ip = ipKeyGenerator(req);
    return `${ip}-${req.get('User-Agent')}`;
  }
});

module.exports = {
  createRateLimiter,
  authLimiter,
  createResourceLimiter,
  criticalLimiter,
  apiLimiter,
  createUserLimiter,
  uploadLimiter,
  suspiciousIPLimiter
};
