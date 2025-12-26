const express = require('express');
const router = express.Router();
const { register, login, switchRole, activateProducer, getMe } = require('../controllers/authController');
const { check } = require('express-validator');
const { auth } = require('../middleware/auth');

router.get('/me', auth, getMe);

router.post('/register', [
  check('nombre', 'El nombre es obligatorio').not().isEmpty(),
  check('email', 'Agrega un email válido').isEmail(),
  check('password', 'La contraseña debe tener mínimo 6 caracteres').isLength({ min: 6 }),
  check('rol', 'El rol es obligatorio y debe ser válido').isIn(['productor', 'consumidor']),
  check('zona', 'La zona es obligatoria').not().isEmpty()
], register);

router.post('/login', [
  check('email', 'Agrega un email válido').isEmail(),
  check('password', 'La contraseña es obligatoria').exists()
], login);

router.post('/switch-role', auth, switchRole);
router.post('/activate-producer', auth, activateProducer);

module.exports = router;
