Config = Config or {}

-- Payphones are not implemented yet; these values are currently unused.
-- See docs/features.md.
Config.Payphone = {
    InitialFee = 10,      -- Cash to start call (connect fee)
    PerMinuteRate = 5,    -- Cash charged per minute
}

-- Speaker mode configuration
Config.SpeakerVolumeMultiplier = 2.0  -- Volume multiplier when speaker is enabled (default: 2.0, max: 1.0)
Config.SpeakerProximityRange = 5.0    -- Distance in units for proximity audio (default: 5.0, as per reference)
Config.SpeakerUpdateInterval = 100     -- Position update interval in milliseconds (default: 100)

-- WebRTC Configuration (Video Calls)
-- TURN credentials belong in server-only convars. See config-examples/server.cfg.

Config.Camera = {
    MaxFOV = 70.0,
    DefaultFOV = 60.0,
    MinFOV = 10.0,
    MaxLookUp = 80.0,
    MaxLookDown = -80.0,
    AllowRunning = false,
    
    -- Vehicle camera settings
    Vehicle = {
        Zoom = true,
        MaxFOV = 80.0,
        DefaultFOV = 60.0,
        MinFOV = 10.0,
        MaxLookUp = 50.0,
        MaxLookDown = -30.0,
        MaxLeftRight = 120.0,
        MinLeftRight = -120.0,
    },
    
    -- Selfie camera settings
    Selfie = {
        MaxFOV = 80.0,
        DefaultFOV = 60.0,
        MinFOV = 50.0,
        Offset = vector3(0.1, 0.55, 0.6),
        Rotation = vector3(10.0, 0.0, -180.0),
    },
    
    -- Freeze mode (for photos, not used in video calls)
    Freeze = {
        Enabled = false,
        MaxDistance = 10.0,
        MaxTime = 60, -- seconds
    },
    
    -- Roll feature (camera rotation)
    Roll = false,
}

Config.Crypto = {
    {
        Icon = "caret-square-up",
        Label = "Shungite",
        Id = "SHUNG",
        Costs = 100,
        Purchasable = true,
    },
    {
        Icon = "horse-head",
        Label = "Guinea",
        Id = "GNE",
        Costs = 100,
        Purchasable = false,
    },
    {
        Icon = "shield-check",
        Label = "Evidentia",
        Id = "EVD",
        Costs = 100,
        Purchasable = false,
    },
    {
        Icon = "theater-masks",
        Label = "XTF",
        Id = "XTF",
        Costs = 1000,
        Purchasable = false,
    },
}