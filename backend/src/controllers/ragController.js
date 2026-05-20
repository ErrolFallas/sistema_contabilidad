const rag = require('../services/ragService');

async function query(req, res, next) {
  try {
    const { question, top_k } = req.body || {};
    const result = await rag.queryRag({
      question,
      topK: top_k ? Math.min(Math.max(parseInt(top_k, 10) || 5, 1), 20) : undefined,
      userId: req.user?.sub || null,
    });
    req.log.info({
      user_id: req.user.sub,
      question_chars: result.question.length,
      matches: result.matches_count,
      duration_ms: result.duration_ms,
    }, 'rag query');
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: 'BadRequest', message: err.message });
    }
    next(err);
  }
}

async function reindexOne(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'BadRequest', message: 'Id invalido' });
    }
    const result = await rag.indexDocument(id);
    req.log.info({ user_id: req.user.sub, document_id: id, indexed: result.indexed }, 'rag reindex one');
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function reindexAll(req, res, next) {
  try {
    const result = await rag.reindexAll();
    req.log.info({ user_id: req.user.sub, ...result }, 'rag reindex all');
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function status(_req, res, next) {
  try {
    const result = await rag.getStatus();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function history(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const items = await rag.listHistory({ limit });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

module.exports = { query, reindexOne, reindexAll, status, history };
