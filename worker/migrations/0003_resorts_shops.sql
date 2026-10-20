-- Existing test records start at Mountain Village. Available equipment can be moved by an administrator.
CREATE TABLE resorts (resort_id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE shops (shop_id TEXT PRIMARY KEY, resort_id TEXT NOT NULL REFERENCES resorts(resort_id), name TEXT NOT NULL);
INSERT INTO resorts VALUES ('park-city','Park City');
INSERT INTO shops VALUES ('mountain-village','park-city','Mountain Village'),('canyons-village','park-city','Canyons Village');
ALTER TABLE inventory ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'mountain-village';
ALTER TABLE rentals ADD COLUMN shop_id TEXT NOT NULL DEFAULT 'mountain-village';
CREATE INDEX inventory_shop ON inventory(shop_id);
CREATE INDEX rentals_shop ON rentals(shop_id,status,pass_id);
CREATE TRIGGER validate_assignment_shop BEFORE INSERT ON rental_items
BEGIN
 SELECT CASE WHEN (SELECT shop_id FROM inventory WHERE gear_id=NEW.gear_id) != (SELECT shop_id FROM rentals WHERE rental_id=NEW.rental_id) THEN RAISE(ABORT,'Equipment belongs to another shop') END;
END;
CREATE TRIGGER protect_inventory_shop BEFORE UPDATE OF shop_id ON inventory WHEN NEW.shop_id != OLD.shop_id
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM rental_items WHERE gear_id=OLD.gear_id AND status='OUT') THEN RAISE(ABORT,'Return equipment before changing shop') END;
END;
CREATE TRIGGER protect_rental_shop BEFORE UPDATE OF shop_id ON rentals WHEN NEW.shop_id != OLD.shop_id
BEGIN
 SELECT RAISE(ABORT,'Rental shop cannot change');
END;
CREATE TRIGGER validate_inventory_shop_insert BEFORE INSERT ON inventory
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM shops WHERE shop_id=NEW.shop_id) THEN RAISE(ABORT,'Invalid shop') END;
END;
CREATE TRIGGER validate_inventory_shop_update BEFORE UPDATE OF shop_id ON inventory
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM shops WHERE shop_id=NEW.shop_id) THEN RAISE(ABORT,'Invalid shop') END;
END;
CREATE TRIGGER validate_rentals_shop_insert BEFORE INSERT ON rentals
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM shops WHERE shop_id=NEW.shop_id) THEN RAISE(ABORT,'Invalid shop') END;
END;
CREATE TRIGGER validate_rentals_shop_update BEFORE UPDATE OF shop_id ON rentals
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM shops WHERE shop_id=NEW.shop_id) THEN RAISE(ABORT,'Invalid shop') END;
END;
