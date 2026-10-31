-- ESX Legacy built-in inventory only, NOT ox_inventory. Back up first.
-- Inspect DESCRIBE items; this example expects name,label,weight,rare,can_remove.
-- Do not change a working existing phone item or run against another items schema.
INSERT IGNORE INTO items (name,label,weight,rare,can_remove)
VALUES ('phone','Phone',1,0,1),
       ('simcard','SIM Card',1,0,1);
