# Integrations and API

Use these exports to connect your own resources to the phone. Start your resource **after** `peak-phone`.

> [!IMPORTANT]
> The phone trusts only the server. Do all ownership, job, distance and money checks in **server** code, and never return a fake "success".

## Server exports

### Phone numbers and SIM API

```lua
local number = exports['peak-phone']:GetActivePhoneNumber(source)       -- '5551234567' or nil
local target = exports['peak-phone']:GetSourceByPhoneNumber('5551234567') -- player source or nil
local sim    = exports['peak-phone']:GetActiveSimData(source)            -- active SIM table or nil
local card   = exports['peak-phone']:GetSimCardBySimId(simId)
local card2  = exports['peak-phone']:GetSimCardByPhoneNumber('5551234567')
local new    = exports['peak-phone']:CreateSimCard(fullCharacterId)      -- { SimId, PhoneNumber } or nil
```

- `GetActivePhoneNumber` only returns a number for an **online** character who has the phone item.
- `CreateSimCard` is for trusted server code, such as a phone shop or admin tool. Check payment and permissions in your resource, and never call it from an unchecked network event.
- For ESX, always pass the **full** character identifier, including the multicharacter prefix.

### Devices

```lua
exports['peak-phone']:IssueDevice(source, 'Work phone')  -- give a new unique phone item
exports['peak-phone']:IssueSimCard(source)              -- give a new SIM card item
exports['peak-phone']:GetActiveDevice(source)           -- the phone device currently in use
```

### Mail

```lua
-- Send in-city mail to a character (works offline; delivered live if they're online)
exports['peak-phone']:SendMailToCitizenId(citizenId, 'Los Santos Customs', 'Your car is ready',
    '<p>Pick it up at the garage.</p>', nil)
```

The message is sanitized; only safe formatting is kept.

### Calls

```lua
local busy = exports['peak-phone']:IsCallOngoingByPhone('5551234567')
```

### Framework

```lua
local fw = exports['peak-phone']:GetPortableFramework() -- 'qbcore', 'qbox' or 'esx'
```

## Client exports

```lua
exports['peak-phone']:UsePhone()            -- open the phone (e.g. from an item use)
exports['peak-phone']:ClosePhone()
exports['peak-phone']:InCamera()            -- true while the camera app is active
exports['peak-phone']:SetAppUnread('mails') -- show an unread badge on an app

-- Phone notification: Id, Icon, IconColor, Title, Text, ShowTimer, ShowCountdown, OnAccept, OnReject, Data
exports['peak-phone']:Notification('delivery-1', 'fas fa-box', { 'white', '#e67e22' },
    'Delivery', 'Package ready for pickup', false, false)
exports['peak-phone']:RemoveNotification('delivery-1')
```

## Adding providers for gameplay apps

Some apps (Vehicles spawning, Housing, Racing and others) need data that only your server has. Register providers from **your own resource**. This keeps your code separate from the phone, so updating the phone won't overwrite it.

### Garage and news hooks

```lua
-- server.lua in your adapter resource (starts after peak-phone)
exports['peak-phone']:RegisterPhoneAdapter({
    GetVehicles = function(source, citizenid)
        -- Return verified owned vehicles (see server/sv_vehicles.lua for the expected fields, including plate)
        return MyGarage.GetVehicles(citizenid)
    end,
    TrackVehicle = function(source, plate)
        -- Confirm ownership, then return { x = ..., y = ..., z = ... } or false
        return MyGarage.TrackOwnedVehicle(source, plate)
    end,
    SpawnVehicle = function(source, plate)
        return MyGarage.SpawnOwnedVehicle(source, plate)
    end,
    IsJournalist = function(source, network)
        return MyNews.HasPermission(source, network) == true
    end,
})
```

Supported hooks: `GetVehicles`, `TrackVehicle`, `SpawnVehicle`, `SellVehicle` and `IsJournalist`. Hooks are removed automatically when your resource stops. `SellVehicle` must handle the whole sale (offer and acceptance, money, ownership and keys), and it needs `PhoneConfig.EnableVehicleSales = true`.

### Custom server callbacks and NUI routes

Use these to connect a legacy app screen to your own backend. Register only routes that don't already exist; the phone's built-in routes can't be overwritten.

```lua
-- server
exports['peak-phone']:RegisterPhoneCallback('peak-phone:Server:Example:GetData',
    function(source, reply, data)
        -- validate the player and input, then call your real system
        reply({ Success = true, Items = MySystem.GetItems(source) })
    end,
    'vehicles') -- optional app ID: also enforces PhoneOwnerConfig.Apps.JobAccess for that app

-- client
exports['peak-phone']:RegisterPhoneRoute('Example/GetData', 'peak-phone:Server:Example:GetData')
```

Once **every** route an app needs is implemented, show the app:

```lua
exports['peak-phone']:SetPhoneCapability('housing', true)
```

The capability flag only shows or hides the app; it doesn't implement anything. Restart the phone and your adapter together after changing client routes.

## Events from the phone

Phone events use the `peak-phone:` prefix, for example `peak-phone:Client:Mails:AddMail`. Treat server events as **internal**: their payloads may change between versions. For stable integration, use the exports above.

## Building a brand-new app

The phone shell loads native apps as ES modules from `web/public/duo/`. Look at a small existing app, such as `calculator-app.mjs` with `calculator-core.mjs`, or `weather-app.mjs` with `client/cl_weather.lua`, and see [development.md](development.md). Pull requests that add generally useful apps are welcome.
