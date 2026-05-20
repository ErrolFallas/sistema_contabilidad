const router = require('express').Router();
const { authRequired } = require('../middleware/auth');
const traceability = require('../controllers/traceabilityController');

router.get('/', authRequired, traceability.list);

module.exports = router;
