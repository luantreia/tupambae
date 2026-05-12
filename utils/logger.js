const winston = require('winston');
const path = require('path');

// Definir niveles de log personalizados
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
    security: 5,
    performance: 6
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
    security: 'cyan',
    performance: 'white'
  }
};

// Formato personalizado para logs
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Agregar stack si existe
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Agregar metadata si existe
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Crear el logger principal
const logger = winston.createLogger({
  levels: customLevels.levels,
  format: customFormat,
  defaultMeta: { service: 'tupambae-api' },
  transports: [
    // Archivo de errores
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Archivo de logs generales
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Archivo de logs de seguridad
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/security.log'),
      level: 'security',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Archivo de logs de performance
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/performance.log'),
      level: 'performance',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// En desarrollo, agregar console transport
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.simple()
    )
  }));
}

// Middleware para logging de requests HTTP
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log inicial del request
  logger.http(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Capturar el response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - start;
    
    // Log de performance para requests lentos
    if (duration > 1000) {
      logger.performance(`Slow request detected`, {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        userId: req.user?.id
      });
    }
    
    // Log del response
    logger.http(`${req.method} ${req.url} ${res.statusCode}`, {
      duration: `${duration}ms`,
      statusCode: res.statusCode,
      userId: req.user?.id
    });
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Funciones de logging específicas
const securityLogger = {
  loginAttempt: (email, ip, success = false) => {
    logger.security('Login attempt', {
      email,
      ip,
      success,
      timestamp: new Date().toISOString()
    });
  },
  
  suspiciousActivity: (activity, details) => {
    logger.security('Suspicious activity detected', {
      activity,
      ...details,
      timestamp: new Date().toISOString()
    });
  },
  
  rateLimitExceeded: (ip, endpoint) => {
    logger.security('Rate limit exceeded', {
      ip,
      endpoint,
      timestamp: new Date().toISOString()
    });
  },
  
  unauthorizedAccess: (ip, endpoint, userId = null) => {
    logger.security('Unauthorized access attempt', {
      ip,
      endpoint,
      userId,
      timestamp: new Date().toISOString()
    });
  }
};

const performanceLogger = {
  databaseQuery: (operation, duration, collection) => {
    if (duration > 100) {
      logger.performance('Slow database query', {
        operation,
        duration: `${duration}ms`,
        collection,
        timestamp: new Date().toISOString()
      });
    }
  },
  
  apiResponse: (endpoint, duration, statusCode) => {
    logger.performance('API response time', {
      endpoint,
      duration: `${duration}ms`,
      statusCode,
      timestamp: new Date().toISOString()
    });
  },
  
  memoryUsage: () => {
    const usage = process.memoryUsage();
    logger.performance('Memory usage', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
      timestamp: new Date().toISOString()
    });
  }
};

const errorLogger = {
  databaseError: (error, operation) => {
    logger.error('Database error', {
      error: error.message,
      stack: error.stack,
      operation,
      timestamp: new Date().toISOString()
    });
  },
  
  validationError: (error, endpoint) => {
    logger.error('Validation error', {
      error: error.message,
      endpoint,
      details: error.details,
      timestamp: new Date().toISOString()
    });
  },
  
  authenticationError: (error, ip) => {
    logger.error('Authentication error', {
      error: error.message,
      ip,
      timestamp: new Date().toISOString()
    });
  }
};

// Log de eventos de negocio
const businessLogger = {
  userRegistered: (userId, email, role) => {
    logger.info('New user registered', {
      userId,
      email,
      role,
      timestamp: new Date().toISOString()
    });
  },
  
  productCreated: (productId, producerId, productName) => {
    logger.info('Product created', {
      productId,
      producerId,
      productName,
      timestamp: new Date().toISOString()
    });
  },
  
  orderCreated: (orderId, userId, producerId) => {
    logger.info('Order created', {
      orderId,
      userId,
      producerId,
      timestamp: new Date().toISOString()
    });
  },
  
  truequeInitiated: (truequeId, userId1, userId2) => {
    logger.info('Trueque initiated', {
      truequeId,
      userId1,
      userId2,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  logger,
  httpLogger,
  securityLogger,
  performanceLogger,
  errorLogger,
  businessLogger
};
