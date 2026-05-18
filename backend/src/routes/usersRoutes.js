const express = require('express');
const { authRequired, requireRole } = require('../middleware/auth');
const usersController = require('../controllers/usersController');

const router = express.Router();

router.use(authRequired, requireRole('ADMIN'));

router.get('/', usersController.list);
router.post('/', usersController.create);
router.patch('/:id', usersController.update);

module.exports = router;
