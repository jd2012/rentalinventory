-- All result sets should be empty before migration. Resolve manually from actual records.
SELECT gear_id,COUNT(*) AS open_assignments FROM rental_items WHERE status='OUT' GROUP BY gear_id HAVING COUNT(*)>1;
SELECT i.item_id,i.rental_id FROM rental_items i LEFT JOIN rentals r ON r.rental_id=i.rental_id WHERE r.rental_id IS NULL;
SELECT i.item_id,i.pass_id,r.pass_id AS rental_pass FROM rental_items i JOIN rentals r ON r.rental_id=i.rental_id WHERE i.pass_id!=r.pass_id;
SELECT gear_id,status FROM inventory WHERE status NOT IN ('ACTIVE','REPAIR','RETIRED','LOST') OR status IS NULL;
SELECT item_id,status,return_time FROM rental_items WHERE (status='OUT' AND return_time IS NOT NULL) OR (status='RETURNED' AND return_time IS NULL);
