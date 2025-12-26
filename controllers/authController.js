const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { nombre, email, password, rol, zona, telefono } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe' });

    const isProductor = rol === 'productor';
    user = new User({ 
      nombre, 
      email, 
      password, 
      zona,
      telefono,
      roles: {
        consumidor: true,
        productor: {
          activo: isProductor,
          aprobado: false, // Requiere validación posterior
          nivel: 1
        }
      },
      rolActivo: rol || 'consumidor',
      tokens: isProductor ? 1000 : 0 // 10 tokens = 1000 puntos
    });
    await user.save();

    const payload = { 
      user: { 
        id: user.id, 
        rolActivo: user.rolActivo
      } 
    };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          nombre, 
          email, 
          rolActivo: user.rolActivo, 
          roles: user.roles,
          zona,
          telefono,
          tokens: user.tokens,
          isSelecto: user.isSelecto,
          reputationScore: user.reputationScore
        } 
      });
    });
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Credenciales inválidas' });

    if (!user.activo) {
      return res.status(401).json({ msg: 'Esta cuenta ha sido desactivada' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Credenciales inválidas' });

    // Migración on-the-fly para usuarios del MVP anterior
    if (!user.roles) {
      user.roles = {
        consumidor: true,
        productor: {
          activo: user.rol === 'productor',
          aprobado: user.rol === 'productor',
          nivel: 1
        }
      };
      user.rolActivo = user.rol || 'consumidor';
      await user.save();
    }

    // Migración de visibilidad (isPublic -> isSelecto)
    if (user.isSelecto === undefined) {
      // Si existía isPublic y era false, entonces es Selecto
      // Si no existía nada, por defecto es Público (isSelecto: false)
      user.isSelecto = false; 
      await user.save();
    }

    const payload = { 
      user: { 
        id: user.id, 
        rolActivo: user.rolActivo
      } 
    };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          nombre: user.nombre, 
          email, 
          rolActivo: user.rolActivo, 
          roles: user.roles,
          zona: user.zona,
          telefono: user.telefono,
          tokens: user.tokens,
          isSelecto: user.isSelecto,
          reputationScore: user.reputationScore
        } 
      });
    });
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.switchRole = async (req, res) => {
  const { nuevoRol } = req.body;
  if (!['productor', 'consumidor'].includes(nuevoRol)) {
    return res.status(400).json({ msg: 'Rol no válido' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'Usuario no encontrado' });

    // Verificar si tiene permiso para ese rol
    if (nuevoRol === 'productor' && !user.roles.productor.activo) {
      return res.status(403).json({ msg: 'No tienes el modo productor activado' });
    }

    user.rolActivo = nuevoRol;
    await user.save();

    const payload = { 
      user: { 
        id: user.id, 
        rolActivo: user.rolActivo
      } 
    };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          nombre: user.nombre, 
          email: user.email, 
          rolActivo: user.rolActivo, 
          roles: user.roles,
          zona: user.zona,
          telefono: user.telefono,
          tokens: user.tokens,
          isSelecto: user.isSelecto,
          reputationScore: user.reputationScore
        } 
      });
    });
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.activateProducer = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'Usuario no encontrado' });

    if (user.roles.productor.activo) {
      return res.status(400).json({ msg: 'El modo productor ya está activado' });
    }

    user.roles.productor.activo = true;
    user.rolActivo = 'productor';
    await user.save();

    const payload = { 
      user: { 
        id: user.id, 
        rolActivo: user.rolActivo
      } 
    };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          nombre: user.nombre, 
          email: user.email, 
          rolActivo: user.rolActivo, 
          roles: user.roles,
          zona: user.zona,
          tokens: user.tokens,
          isSelecto: user.isSelecto,
          reputationScore: user.reputationScore
        } 
      });
    });
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rolActivo: user.rolActivo,
      roles: user.roles,
      zona: user.zona,
      telefono: user.telefono,
      tokens: user.tokens,
      isSelecto: user.isSelecto,
      reputationScore: user.reputationScore
    });
  } catch (err) {
    res.status(500).send('Error del servidor');
  }
};
