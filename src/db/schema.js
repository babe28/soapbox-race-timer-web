const schemaStatements = [
  `PRAGMA journal_mode = WAL;`,
  `PRAGMA foreign_keys = ON;`,

  `CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      event_name TEXT NOT NULL DEFAULT 'Soap Box Derby',
      class_name TEXT NOT NULL DEFAULT 'Super Stock',
      language TEXT NOT NULL DEFAULT 'en',
      rows_per_page INTEGER NOT NULL DEFAULT 20 CHECK (rows_per_page IN (20, 30)),
      show_kana INTEGER NOT NULL DEFAULT 1,
      show_car_no INTEGER NOT NULL DEFAULT 1,
      show_practice INTEGER NOT NULL DEFAULT 1,
      show_split INTEGER NOT NULL DEFAULT 1,
      show_clock INTEGER NOT NULL DEFAULT 1,
      show_last_update INTEGER NOT NULL DEFAULT 1,
      show_overall_best INTEGER NOT NULL DEFAULT 1,
      show_effects INTEGER NOT NULL DEFAULT 1,
      auto_backup_interval_min INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS heats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      heat_no INTEGER NOT NULL,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'waiting'
          CHECK (status IN ('waiting', 'preparing', 'running', 'finished')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bib_no INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      kana TEXT,
      car_no TEXT,
      start_order INTEGER NOT NULL,
      effective_order INTEGER NOT NULL,
      is_skipped INTEGER NOT NULL DEFAULT 0,
      memo TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      heat_id INTEGER,
      run_type TEXT NOT NULL
          CHECK (run_type IN ('practice', 'race1', 'race2', 'rerun')),
      attempt_no INTEGER NOT NULL DEFAULT 1,
      rerun_of_run_id INTEGER,
      replaces_run_type TEXT
          CHECK (replaces_run_type IS NULL OR replaces_run_type IN ('race1', 'race2')),
      car_no_at_run TEXT,
      split_ms INTEGER,
      goal_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'finished', 'dq', 'dnf', 'scratch', 'void')),
      valid_for_ranking INTEGER NOT NULL DEFAULT 0,
      valid_for_display INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entry_id) REFERENCES entries(id),
      FOREIGN KEY (heat_id) REFERENCES heats(id),
      FOREIGN KEY (rerun_of_run_id) REFERENCES runs(id)
  );`,

  `CREATE TABLE IF NOT EXISTS display_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_heat_id INTEGER,
      current_status TEXT NOT NULL DEFAULT 'waiting'
          CHECK (current_status IN ('waiting', 'preparing', 'running', 'finished')),
      now_running_entry_id INTEGER,
      next_entry_id INTEGER,
      last_update_at TEXT,
      overall_best_run_id INTEGER,
      connection_state TEXT NOT NULL DEFAULT 'connected'
          CHECK (connection_state IN ('connected', 'disconnected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (current_heat_id) REFERENCES heats(id),
      FOREIGN KEY (now_running_entry_id) REFERENCES entries(id),
      FOREIGN KEY (next_entry_id) REFERENCES entries(id),
      FOREIGN KEY (overall_best_run_id) REFERENCES runs(id)
  );`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL
          CHECK (action_type IN (
              'create_run',
              'update_run',
              'skip_entry',
              'unskip_entry',
              'set_now_running',
              'set_next',
              'change_status',
              'reorder_entry'
          )),
      target_type TEXT NOT NULL
          CHECK (target_type IN ('entry', 'run', 'heat', 'display_state', 'settings')),
      target_id INTEGER,
      before_json TEXT,
      after_json TEXT,
      operator_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  `CREATE TABLE IF NOT EXISTS entry_order_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      old_effective_order INTEGER,
      new_effective_order INTEGER,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entry_id) REFERENCES entries(id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_entries_start_order ON entries(start_order);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_effective_order ON entries(effective_order);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_is_skipped ON entries(is_skipped);`,
  `CREATE INDEX IF NOT EXISTS idx_runs_entry_id ON runs(entry_id);`,
  `CREATE INDEX IF NOT EXISTS idx_runs_heat_id ON runs(heat_id);`,
  `CREATE INDEX IF NOT EXISTS idx_runs_run_type ON runs(run_type);`,
  `CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);`,
  `CREATE INDEX IF NOT EXISTS idx_runs_valid_for_ranking ON runs(valid_for_ranking);`,
  `CREATE INDEX IF NOT EXISTS idx_runs_updated_at ON runs(updated_at);`,
];

const seedStatements = [
  `INSERT OR IGNORE INTO settings (id) VALUES (1);`,
  `INSERT OR IGNORE INTO display_state (id) VALUES (1);`,
];

module.exports = { schemaStatements, seedStatements };
