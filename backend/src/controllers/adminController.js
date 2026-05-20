const { runAllCleanups, detectOrphans } = require('../services/storageCleanupService');

async function runStorageCleanup(req, res, next) {
  try {
    const result = await runAllCleanups();
    req.log.info({ user_id: req.user.sub }, 'storage cleanup triggered manually');
    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
}

async function listOrphans(req, res, next) {
  try {
    const result = await detectOrphans();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { runStorageCleanup, listOrphans };
