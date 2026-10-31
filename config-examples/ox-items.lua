-- Merge this entry into ox_inventory/data/items.lua ONLY if no phone item exists.
-- For an existing item, keep its artwork and use the peak-phone.UsePhone export.
-- The return wrapper keeps this example valid standalone Lua for Cfx validation.
return {
    ['phone'] = {
        label = 'Phone', weight = 500, stack = false, close = true, consume = 0,
        client = { export = 'peak-phone.UsePhone' },
    },
    ['simcard'] = { label = 'SIM Card', weight = 5, stack = false, close = true, consume = 0 },
}
