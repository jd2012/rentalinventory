-- Apply once to the EXISTING worker/schema.sql database. Back up first.
ALTER TABLE rentals ADD COLUMN due_date TEXT;
ALTER TABLE rentals ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE rental_items ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory ADD COLUMN notes TEXT NOT NULL DEFAULT '';
-- Fail on conflicting legacy assignments; do not guess which guest has the gear.
CREATE UNIQUE INDEX one_open_assignment ON rental_items(gear_id) WHERE status='OUT';
CREATE INDEX rental_due_date ON rentals(due_date, status);
-- Preserve history for gear scanned before inventory registration existed.
INSERT OR IGNORE INTO inventory(gear_id,gear_type,status,updated_at)
SELECT gear_id,COALESCE(MAX(gear_type),'Other'),'ACTIVE',MAX(out_time) FROM rental_items GROUP BY gear_id;
-- Repair closed rentals with outstanding items and rentals whose items were all returned.
UPDATE rentals SET status='OUT',closed_time=NULL
WHERE EXISTS(SELECT 1 FROM rental_items i WHERE i.rental_id=rentals.rental_id AND i.status='OUT');
UPDATE rentals SET status='CLOSED',closed_time=(SELECT MAX(return_time) FROM rental_items i WHERE i.rental_id=rentals.rental_id)
WHERE status='OUT' AND EXISTS(SELECT 1 FROM rental_items i WHERE i.rental_id=rentals.rental_id)
AND NOT EXISTS(SELECT 1 FROM rental_items i WHERE i.rental_id=rentals.rental_id AND i.status='OUT');
CREATE TRIGGER validate_assignment BEFORE INSERT ON rental_items BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM rentals WHERE rental_id=NEW.rental_id AND pass_id=NEW.pass_id AND status='OUT') THEN RAISE(ABORT,'Rental is closed or pass does not match') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM inventory WHERE gear_id=NEW.gear_id AND status='ACTIVE') THEN RAISE(ABORT,'Equipment is not active') END;
END;
CREATE TRIGGER protect_item_identity BEFORE UPDATE OF rental_id,pass_id,gear_id,out_time ON rental_items BEGIN
 SELECT RAISE(ABORT,'Assignment identity is immutable; return and check out again');
END;
CREATE TRIGGER validate_item_return BEFORE UPDATE OF status,return_time ON rental_items BEGIN
 SELECT CASE WHEN NEW.status NOT IN ('OUT','RETURNED') OR (NEW.status='OUT' AND NEW.return_time IS NOT NULL) OR (NEW.status='RETURNED' AND NEW.return_time IS NULL) THEN RAISE(ABORT,'Invalid item return state') END;
 SELECT CASE WHEN OLD.status='RETURNED' AND NEW.status='OUT' THEN RAISE(ABORT,'Create a new checkout to rent returned equipment') END;
END;
CREATE TRIGGER close_completed_rental AFTER UPDATE OF status ON rental_items WHEN NEW.status='RETURNED' BEGIN
 UPDATE rentals SET status='CLOSED',closed_time=NEW.return_time WHERE rental_id=NEW.rental_id AND status='OUT'
 AND NOT EXISTS(SELECT 1 FROM rental_items WHERE rental_id=NEW.rental_id AND status='OUT');
END;
CREATE TRIGGER protect_rental_close BEFORE UPDATE OF status ON rentals WHEN NEW.status='CLOSED' BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM rental_items WHERE rental_id=NEW.rental_id AND status='OUT') THEN RAISE(ABORT,'Return outstanding equipment before closing') END;
END;
CREATE TRIGGER protect_inventory_status BEFORE UPDATE OF status ON inventory WHEN NEW.status!='ACTIVE' BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM rental_items WHERE gear_id=NEW.gear_id AND status='OUT') THEN RAISE(ABORT,'Return equipment before changing its service status') END;
END;
