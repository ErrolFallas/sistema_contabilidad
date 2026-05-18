const express = require('express');
const { login, me } = require('../controllers/authController');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', authRequired, me);

module.exports = router;
