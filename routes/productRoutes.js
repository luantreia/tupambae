const express = require('express');
const router = express.Router();
const { getProductsByProducer, getProducts, getMyProducts, createProduct, updateProduct, deleteProduct } = require('../controllers/productController');
const { auth, requireRolActivo, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, getProducts);
router.get('/me', auth, requireRolActivo('productor'), getMyProducts);
router.get('/productor/:producerId', getProductsByProducer);
router.post('/', auth, requireRolActivo('productor'), createProduct);
router.put('/:id', auth, requireRolActivo('productor'), updateProduct);
router.delete('/:id', auth, requireRolActivo('productor'), deleteProduct);

module.exports = router;
