const express = require('express');
const router = express.Router();
const { auth, optionalAuth } = require('../middleware/auth');
const userController = require('../controllers/userController');

router.patch('/me', auth, userController.updateMe);
router.patch('/me/visibilidad', auth, userController.updateVisibilidad);
router.patch('/me/visibility', auth, userController.updateVisibilidad);
router.get('/search', auth, userController.searchUsers);
router.get('/contacts', auth, userController.getContacts);
router.post('/contacts/:contactId', auth, userController.addContact);
router.delete('/contacts/:contactId', auth, userController.removeContact);
router.get('/:id/profile', optionalAuth, userController.getUserProfile);
router.delete('/:id', auth, userController.deleteUser);

module.exports = router;
