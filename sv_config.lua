Config.Networks = {
    {
        Id = "bennys",
        Name = "Bennys Motorworks",
        Center = vector3(-211.13, -1326.52, 31.3),
        Size = 50.0,
        Enabled = function(Source)
            return Phone.legacyAvailable('cars') and exports['peak-businesses']:HasPlayerBusinessPermission("Bennys Motorworks", Source, 'VehicleSales')
        end,
    },
    {
        Id = "pdm",
        Name = "Premium Deluxe Motorsports",
        Center = vector3(-1035.2, -1382.0, 5.6),
        Size = 50.0,
        Enabled = function(Source)
            return Phone.legacyAvailable('cars') and exports['peak-businesses']:HasPlayerBusinessPermission("Premium Deluxe Motorsports", Source, 'VehicleSales')
        end,
    },
    {
        Id = "lostmc",
        Name = "The Lost Holland",
        Center = vector3(969.19, -122.23, 74.35),
        Size = 80.0,
        Enabled = function(Source)
            return Phone.legacyAvailable('cars') and exports['peak-businesses']:HasPlayerBusinessPermission("The Lost Holland", Source, 'VehicleSales')
        end,
    },
    {
        Id = "losmuertos",
        Name = "Muertos Motorcycle Shop",
        Center = vector3(1232.86, 3593.99, 33.83),
        Size = 80.0,
        Enabled = function(Source)
            return Phone.legacyAvailable('cars') and exports['peak-businesses']:HasPlayerBusinessPermission("Muertos Motorcycle Shop", Source, 'VehicleSales')
        end,
    },
    -- {
    --     Id = "bearlymc",
    --     Name = "Bearly Legal MC",
    --     Center = vector3(124.8, 313.41, 112.14),
    --     Size = 80.0,
    --     Enabled = function(Source)
    --         return Phone.legacyAvailable('cars') and exports['peak-businesses']:HasPlayerBusinessPermission("Bearly Legal MC", Source, 'VehicleSales')
    --     end,
    -- },
    {
        Id = "darkwolves",
        Name = "Dark Wolves MC",
        Center = vector3(1712.73, 4781.29, 43.67),
        Size = 80.0,
        Enabled = function(Source)
            return Phone.legacyAvailable('cars') and exports['peak-businesses']:HasPlayerBusinessPermission("Dark Wolves MC", Source, 'VehicleSales')
        end,
    },
    {
        Id = "flightschool",
        Name = "Los Santos Flight School",
        Center = vector3(-954.35, -2986.74, 14.29),
        Size = 100.0,
        Enabled = function(Source)
            return Phone.legacyAvailable('cars') and exports['peak-businesses']:HasPlayerBusinessPermission("Los Santos Flight School", Source, 'VehicleSales')
        end,
    },
}

Config.Bankbusters = {
    {
        Id = "Bank",
        Data = { Bank = "Great Ocean" },
        Label = "Fleeca: Great Ocean",
        Time = 60 * math.random(60, 120), -- 2 > 3 hours. 
        Expired = false,
        Claimers = {},
    },
    {
        Id = "Bank",
        Data = { Bank = "Harmony" },
        Label = "Fleeca: Harmony",
        Time = 60 * math.random(60, 120), -- 2 > 3 hours. 
        Expired = false,
        Claimers = {},
    },
    {
        Id = "Bank",
        Data = { Bank = "Life Invader" },
        Label = "Fleeca: Life Invader",
        Time = 60 * math.random(60, 120), -- 2 > 3 hours. 
        Expired = false,
        Claimers = {},
    },
    {
        Id = "Bank",
        Data = { Bank = "Legion Square" },
        Label = "Fleeca: Legion Square",
        Time = 60 * math.random(60, 120), -- 2 > 3 hours. 
        Expired = false,
        Claimers = {},
    },
    {
        Id = "Bank",
        Data = { Bank = "Pink Cage" },
        Label = "Fleeca: Pink Cage",
        Time = 60 * math.random(60, 120), -- 2 > 3 hours. 
        Expired = false,
        Claimers = {},
    },
    {
        Id = "Bank",
        Data = { Bank = "Hawick" },
        Label = "Fleeca: Hawick",
        Time = 60 * math.random(60, 120), -- 2 > 3 hours. 
        Expired = false,
        Claimers = {},
    },
    {
        Id = "Bank",
        Data = { Bank = "Bay City" },
        Label = "Bay City Bank",
        Time = 60 * math.random(60, 120), -- 2 > 3 hours. 
        Expired = false,
        Claimers = {},
    },
    {
        Id = "Paleto",
        Data = {},
        Label = "Blaine County Savings Bank",
        Time = 60 * math.random(60, 120), -- 2 > 3 hours. 
        Expired = false,
        Claimers = {},
    },
    {
        Id = "Bobcat",
        Data = {},
        Label = "Bobcat Security",
        Time = 60 * math.random(220, 300), -- 4 > 5 hours. 
        Expired = false,
        Claimers = {},
    },
    {
        Id = "Jewelry",
        Data = {},
        Label = "Vangelico Jewelry",
        Time = 60 * math.random(180, 300), -- 3 > 5 hours. 
        Expired = false,
        Claimers = {},
    },
    -- {
    --     Id = "HumaneLabs",
    --     Data = {},
    --     Label = "Humane Labs & Research",
    --     Time = 60 * math.random(120, 240), -- 2 > 4 hours. 
    --     Expired = false,
    --     Claimers = {},
    -- },
    -- {
    --     Id = "Yacht",
    --     Data = {},
    --     Label = "Yacht",
    --     Time = 60 * math.random(180, 300), -- 3 > 5 hours. 
    --     Expired = false,
    --     Claimers = {},
    -- },
}

-- Public owner settings for the portable UI.
-- Values are sanitized by server/owner_config.lua before they reach clients.
-- Keep IDs stable: these keys rename and curate existing apps; they do not register new apps.
PhoneOwnerConfig = {
    Apps = {
        -- Labels and icon names use plain text and bundled icon keys only.
        Labels = {}, -- { maps = 'City Map', services = 'Public Services' }
        Icons = {}, -- { maps = 'navigation', services = 'shield' }
        -- Applied only when a character has no saved Home layout yet.
        Defaults = { Order = {}, Dock = {} },
        -- Optional server-enforced allowlists. Empty/malformed rules are ignored.
        JobAccess = {}, -- { services = { 'police', 'ambulance' }, jobcreator = { 'admin' } }
        Hidden = {}, -- Optional stable app IDs hidden and denied for every player.
    },
    Maps = {
        -- GTA V world coordinates. Empty uses the bundled six starter places.
        Places = {},
    },
    Networks = {
        -- Display labels only; authorization still uses Config.Networks and its Enabled checks.
        Labels = {}, -- { pdm = 'Premium Deluxe Motorsports' }
    },
    Services = {
        Title = 'Services',
        Subtitle = 'On-duty directory',
        Sections = {
            emergency = { Title = 'Emergency', Description = 'emergency workers' },
            tow = { Title = 'Tow', Description = 'tow operators' },
        },
        JobLabels = {}, -- { bcso = 'County Sheriff' }
    },
    News = {
        Title = 'Binsbergen',
        Tagline = 'The latest, in perspective.',
        NetworkLabels = { weazelnews = 'Weazel News', bin = 'International News' },
    },
    Store = {
        Title = 'App Store',
        Kicker = 'MADE FOR YOUR CITY',
        FeaturedApp = 'peakify',
        FeaturedTitle = 'Peak Music',
        FeaturedTagline = 'All your favorites. One beautiful library.',
        Apps = {}, -- Existing Store app IDs only: { peakify = { Description = '...', Category = 'Music' } }
    },
}
