const express = require('express');
const router = express.Router();
const { getProducers, getProducerById, upsertProfile, getMyProfile } = require('../controllers/producerController');
const { auth, requireRolActivo, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, getProducers);
router.get('/me', auth, requireRolActivo('productor'), getMyProfile);
router.get('/:id', getProducerById);
router.post('/', auth, requireRolActivo('productor'), upsertProfile);
router.put('/me', auth, requireRolActivo('productor'), upsertProfile);

module.exports = router;
