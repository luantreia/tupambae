const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ msg: 'No hay token, autorización denegada' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;

    // Verificar si el usuario sigue activo
    const user = await User.findById(req.user.id).select('activo');
    if (!user || !user.activo) {
      return res.status(401).json({ msg: 'Cuenta desactivada o no encontrada' });
    }

    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token no es válido' });
  }
};

const checkRole = (role) => {
  return (req, res, next) => {
    if (req.user.rolActivo !== role) {
      return res.status(403).json({ 
        msg: `Acceso denegado: se requiere el rol de ${role} activo`,
        requiredRole: role 
      });
    }
    next();
  };
};

const requireRolActivo = (role) => checkRole(role);

const optionalAuth = async (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;

    const user = await User.findById(req.user.id).select('activo');
    if (!user || !user.activo) {
      req.user = null; // Si está desactivado, lo tratamos como guest
    }
    next();
  } catch (err) {
    // Si el token es inválido, simplemente seguimos como guest
    next();
  }
};

module.exports = { auth, checkRole, requireRolActivo, optionalAuth };
