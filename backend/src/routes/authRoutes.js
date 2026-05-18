const express = require('express');
const { login, me } = require('../controllers/authController');
const googleAuth = require('../controllers/googleAuthController');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', authRequired, me);

// === Google OAuth (Drive + Gmail) ===
router.get('/google/status', authRequired, googleAuth.status);
router.post('/google/authorize', authRequired, requireRole('ADMIN'), googleAuth.authorize);
router.get('/google/callback', googleAuth.callback);
router.post('/google/disconnect', authRequired, requireRole('ADMIN'), googleAuth.disconnect);

module.exports = router;
