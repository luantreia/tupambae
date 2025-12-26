const express = require('express');
const router = express.Router();
const { createOrder, getMyOrders, updateOrderStatus } = require('../controllers/orderController');
const { auth, requireRolActivo } = require('../middleware/auth');

router.post('/', auth, requireRolActivo('consumidor'), createOrder);
router.get('/me', auth, getMyOrders);
router.put('/:id/status', auth, requireRolActivo('productor'), updateOrderStatus);

module.exports = router;
