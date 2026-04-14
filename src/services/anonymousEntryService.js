function getNextAnonymousSequence(db) {
  const row = db.prepare('SELECT MAX(bib_no) AS max_bib_no FROM entries').get();
  return Number(row?.max_bib_no || 0) + 1;
}

function buildAnonymousEntry(db) {
  const seq = getNextAnonymousSequence(db);
  return {
    bib_no: seq,
    name: `ドライバー${seq}`,
    kana: null,
    car_no: String(seq),
    start_order: seq,
    effective_order: seq,
    memo: '匿名走行',
    is_anonymous: 1,
  };
}

function createAnonymousEntry(db) {
  const payload = buildAnonymousEntry(db);
  const info = db.prepare(`
    INSERT INTO entries (bib_no, name, kana, car_no, start_order, effective_order, memo, is_anonymous)
    VALUES (@bib_no, @name, @kana, @car_no, @start_order, @effective_order, @memo, @is_anonymous)
  `).run(payload);
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(Number(info.lastInsertRowid));
}

module.exports = { createAnonymousEntry };
