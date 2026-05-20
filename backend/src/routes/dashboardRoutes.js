const router = require('express').Router();
const { authRequired } = require('../middleware/auth');
const dashboard = require('../controllers/dashboardController');

router.get('/stats', authRequired, dashboard.stats);

module.exports = router;
