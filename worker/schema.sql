-- D1 schema for Kids Rental Tracker
CREATE TABLE IF NOT EXISTS rentals (
  rental_id TEXT PRIMARY KEY,
  pass_id   TEXT NOT NULL,
  out_time  TEXT NOT NULL,
  closed_time TEXT,
  status    TEXT NOT NULL CHECK(status IN ('OUT','CLOSED'))
);

CREATE INDEX IF NOT EXISTS idx_rentals_pass_status ON rentals(pass_id, status);
CREATE INDEX IF NOT EXISTS idx_rentals_out_time ON rentals(out_time);

CREATE TABLE IF NOT EXISTS rental_items (
  item_id   TEXT PRIMARY KEY,
  rental_id TEXT NOT NULL,
  pass_id   TEXT NOT NULL,
  gear_id   TEXT NOT NULL,
  gear_type TEXT,
  out_time  TEXT NOT NULL,
  return_time TEXT,
  status    TEXT NOT NULL CHECK(status IN ('OUT','RETURNED')),
  FOREIGN KEY (rental_id) REFERENCES rentals(rental_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_gear_status ON rental_items(gear_id, status);
CREATE INDEX IF NOT EXISTS idx_items_pass_status ON rental_items(pass_id, status);
CREATE INDEX IF NOT EXISTS idx_items_rental_status ON rental_items(rental_id, status);
CREATE INDEX IF NOT EXISTS idx_items_out_time ON rental_items(out_time);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta(key, value) VALUES ('last_action', '—');
