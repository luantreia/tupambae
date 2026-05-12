const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');

// Middleware para sanitización de inputs
const sanitizeInput = (req, res, next) => {
  // Sanitizar query params
  if (req.query) {
    req.query = mongoSanitize(req.query);
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = xss(req.query[key]);
      }
    });
  }

  // Sanitizar body
  if (req.body) {
    req.body = mongoSanitize(req.body);
    req.body = sanitizeObject(req.body);
  }

  // Sanitizar params
  if (req.params) {
    req.params = mongoSanitize(req.params);
    Object.keys(req.params).forEach(key => {
      if (typeof req.params[key] === 'string') {
        req.params[key] = xss(req.params[key]);
      }
    });
  }

  next();
};

// Función recursiva para sanitizar objetos anidados
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'string') {
      // Sanitizar contra XSS
      sanitized[key] = xss(obj[key], {
        whiteList: {}, // No permitir ningún tag HTML
        stripIgnoreTag: true,
        stripIgnoreTagBody: true
      });
    } else if (typeof obj[key] === 'object') {
      sanitized[key] = sanitizeObject(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  });

  return sanitized;
};

// Validación de campos específicos
const validateField = (fieldName, value, rules = {}) => {
  const errors = [];

  // Regla de longitud máxima
  if (rules.maxLength && value && value.length > rules.maxLength) {
    errors.push(`${fieldName} no puede exceder ${rules.maxLength} caracteres`);
  }

  // Regla de longitud mínima
  if (rules.minLength && value && value.length < rules.minLength) {
    errors.push(`${fieldName} debe tener al menos ${rules.minLength} caracteres`);
  }

  // Regla de email
  if (rules.isEmail && value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push(`${fieldName} no es un email válido`);
    }
  }

  // Regla de teléfono
  if (rules.isPhone && value) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''))) {
      errors.push(`${fieldName} no es un teléfono válido`);
    }
  }

  // Regla de alfanumérico
  if (rules.isAlphanumeric && value) {
    const alphaRegex = /^[a-zA-Z0-9\s]+$/;
    if (!alphaRegex.test(value)) {
      errors.push(`${fieldName} solo puede contener letras, números y espacios`);
    }
  }

  // Regla de solo letras
  if (rules.isAlpha && value) {
    const alphaRegex = /^[a-zA-Z\s]+$/;
    if (!alphaRegex.test(value)) {
      errors.push(`${fieldName} solo puede contener letras y espacios`);
    }
  }

  // Regla de sin caracteres especiales peligrosos
  if (rules.noSpecialChars && value) {
    const dangerousChars = /<script|javascript:|on\w+=|data:/gi;
    if (dangerousChars.test(value)) {
      errors.push(`${fieldName} contiene caracteres no permitidos`);
    }
  }

  return errors;
};

// Middleware para validar campos específicos del request
const validateRequest = (validations) => {
  return (req, res, next) => {
    const errors = [];

    // Validar cada campo según las reglas
    Object.keys(validations).forEach(field => {
      const rules = validations[field];
      const value = req.body[field];

      if (rules.required && (!value || value.trim() === '')) {
        errors.push(`${field} es requerido`);
        return;
      }

      if (value) {
        const fieldErrors = validateField(field, value, rules);
        errors.push(...fieldErrors);
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Error de validación',
        details: errors
      });
    }

    next();
  };
};

// Middleware para detectar contenido malicioso
const detectMaliciousContent = (req, res, next) => {
  const suspiciousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /data:text\/html/gi,
    /<iframe[^>]*>/gi,
    /<object[^>]*>/gi,
    /<embed[^>]*>/gi
  ];

  const checkString = (str) => {
    if (typeof str !== 'string') return false;
    return suspiciousPatterns.some(pattern => pattern.test(str));
  };

  // Revisar body
  if (req.body) {
    const bodyStr = JSON.stringify(req.body);
    if (checkString(bodyStr)) {
      return res.status(400).json({
        error: 'Contenido malicioso detectado',
        code: 'MALICIOUS_CONTENT'
      });
    }
  }

  // Revisar query params
  if (req.query) {
    const queryStr = JSON.stringify(req.query);
    if (checkString(queryStr)) {
      return res.status(400).json({
        error: 'Contenido malicioso detectado en parámetros',
        code: 'MALICIOUS_QUERY'
      });
    }
  }

  next();
};

// Middleware para limitar tamaño de uploads
const limitUploadSize = (maxSize = 5 * 1024 * 1024) => { // 5MB por defecto
  return (req, res, next) => {
    if (req.headers['content-length']) {
      const contentLength = parseInt(req.headers['content-length']);
      if (contentLength > maxSize) {
        return res.status(413).json({
          error: 'Archivo demasiado grande',
          maxSize: `${maxSize / 1024 / 1024}MB`,
          currentSize: `${contentLength / 1024 / 1024}MB`
        });
      }
    }
    next();
  };
};

// Middleware para validar tipos de archivo
const validateFileType = (allowedTypes = ['image/jpeg', 'image/png', 'image/webp']) => {
  return (req, res, next) => {
    if (req.file && !allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: 'Tipo de archivo no permitido',
        allowedTypes,
        receivedType: req.file.mimetype
      });
    }
    next();
  };
};

// Middleware para sanitizar nombres de archivo
const sanitizeFileName = (req, res, next) => {
  if (req.file) {
    const originalName = req.file.originalname;
    // Remover caracteres peligrosos y mantener solo letras, números, puntos y guiones
    const sanitizedName = originalName
      .replace(/[^a-zA-Z0-9.\-_]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
    
    req.file.sanitizedName = sanitizedName;
  }
  next();
};

// Middleware para prevenir CSRF en APIs stateless
const addSecurityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
};

module.exports = {
  sanitizeInput,
  validateRequest,
  detectMaliciousContent,
  limitUploadSize,
  validateFileType,
  sanitizeFileName,
  addSecurityHeaders,
  validateField
};
