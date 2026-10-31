-- Peak Duo portable edition. This file is downloaded by clients: NEVER put secrets here.
PhoneConfig = {
    Framework = 'auto', -- auto, qbcore, qbox, esx; auto uses peak-bridge detection
    RequirePhoneItem = true,
    PhoneItem = 'phone',
    PhoneSlot = 107, -- must match Peak Inventory's dedicated phone equipment slot
    SimItem = 'simcard', -- physical SIMs; burner_sim is a separate burner service item
    OpenKey = 'M',
    AutoMigrate = true, -- creates/widens PHONE-owned tables only; back up before first start
    NumberPrefix = '555',
    NumberDigits = 7,
    MaxOwnedSIMs = 5,
    Devices = { MaxOwned = 5, PINAttempts = 5, PINLockSeconds = 300, LendingHours = 24,
        InventoryMode = 'auto' }, -- auto, unique, count (count is compatibility-only; no physical ownership claim)
    DefaultApps = { 'wenmo', 'y', 'vehicles', 'calculator', 'yellowpages', 'facetime', 'peakify', 'kilogram', 'binge' },
    DefaultPreferences = {
        ['Phone.Brand'] = 'iOS', ['Phone.Background'] = 'duo/wallpaper.svg',
        ['Phone.EmbeddedImages'] = true, ['Phone.Ringtone'] = 'default', ['Phone.CustomRingtone'] = '',
        ['Phone.DisableMovement'] = false,
    },
    -- Add owner-supplied WAV/OGG/MP3 files under web/public/ringtones, or public HTTPS audio URLs.
    Ringtones = { Custom = {} }, -- { { id='my-tone', label='My tone', src='ringtones/my-tone.ogg' } }
    VoiceResource = 'pma-voice',
    CallRingSeconds = 30,
    CallMaxSeconds = 3600,
    -- Video captures the GAME only; pma-voice carries call audio so FiveM CEF never needs microphone permission.
    Video = { Enabled = true, Width = 640, Height = 360, FPS = 20, Bitrate = 800000,
        ConnectionTimeout = 30, RequireTURN = true, RelayOnly = true, AudioMode = 'voice', SuppressDuplicateProximity = true },
    Money = { MaxTransfer = 1000000, MaxCryptoUnits = 100000, Account = 'bank' },
    Media = { MaxPhotos = 500, PageSize = 100, MaxURLLength = 2048, UploadCooldown = 5,
        MaxHostedItems = 100, MaxHostedBytes = 536870912,
        -- Public HTTPS image hosts accepted for imported images. Edit for your own media host.
        AllowedHosts = { 'i.imgur.com', 'images.unsplash.com', 'r2.fivemanage.com', 'files.fivemanage.com', 'cdn.fivemanage.com', 'cdn.discordapp.com', 'media.discordapp.net' } },
    -- KiloGram and Binge are fictional in-city services, authenticated by character.
    Social = { Enabled = true, kilogram = true, binge = true,
        StoryHours = 24, MaxPosts = 500, MaxStories = 12, MaxComments = 500,
        MaxMessages = 1000, MaxPhotos = 5, PageSize = 20,
        -- Uses Media.AllowedHosts above for images AND externally hosted video.
        -- Local camera recordings are NOT public URLs and are not silently uploaded.
        ModerationAce = 'peak-phone.social.admin',
    },
    YellowPages = { AdHours = 48, MaxPerCharacter = 5 },
    NewsJobs = { news = true, reporter = true, journalist = true },
    EmergencyJobs = { police = true, ambulance = true, bcso = true, sasp = true, ranger = true, fire = true },
    TowJobs = { tow = true, mechanic = true, impound = true },
    DOJJobs = { judge = true, lawyer = true, griffier = true, mayor = true },
    -- Enable verified legacy gameplay integrations when running the original peak-core stack.
    -- Other stacks register real server adapters from an external resource; see docs/integrations.md.
    LegacyGameplay = true,
    Integrations = {},
    -- Garages differ independently of the core. Reading owned vehicles is native; spawning must
    -- use a configured garage adapter, never an unchecked client-spawn fallback.
    GarageAdapter = 'none',
    EnableVehicleSales = false, -- enabled only after your ownership/keys adapter is installed
    Debug = false,
}
