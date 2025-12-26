const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const truequeController = require('../controllers/truequeController');

// @route   POST api/trueques
// @desc    Crear una propuesta de trueque
// @access  Private (Productor)
router.post('/', auth, truequeController.createTrueque);

// @route   GET api/trueques
// @desc    Obtener mis trueques (como A o B)
// @access  Private
router.get('/', auth, truequeController.getMisTrueques);

// @route   PATCH api/trueques/:id
// @desc    Actualizar estado de un trueque
// @access  Private
router.patch('/:id', auth, truequeController.updateTruequeEstado);

module.exports = router;
