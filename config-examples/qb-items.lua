-- Merge this entry into qb-core/shared/items.lua ONLY if no phone item exists.
-- Retain the existing image filename or provide your own inventory artwork.
-- The return wrapper keeps this example valid standalone Lua for Cfx validation.
return {
    phone = {
        name = 'phone', label = 'Phone', weight = 500, type = 'item',
        image = 'phone.png', unique = true, useable = true,
        shouldClose = true, combinable = nil, description = 'Peak Duo phone',
    },
    simcard = {
        name = 'simcard', label = 'SIM Card', weight = 5, type = 'item',
        image = 'simcard.png', unique = true, useable = false,
        shouldClose = true, combinable = nil, description = 'A physical phone SIM',
    },
}
-- The phone registers its usable-item handler through peak-bridge.
