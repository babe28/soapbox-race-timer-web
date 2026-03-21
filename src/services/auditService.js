function logAudit(db, {
  actionType,
  targetType,
  targetId = null,
  before = null,
  after = null,
  operatorName = null,
}) {
  db.prepare(`
    INSERT INTO audit_logs (
      action_type,
      target_type,
      target_id,
      before_json,
      after_json,
      operator_name
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    actionType,
    targetType,
    targetId,
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
    operatorName
  );
}

function listAuditLogs(db, limit = 100) {
  return db.prepare(`
    SELECT *
    FROM audit_logs
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit);
}

module.exports = { logAudit, listAuditLogs };
