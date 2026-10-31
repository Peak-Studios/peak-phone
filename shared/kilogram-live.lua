-- KiloGram live. Owner-editable; contains NO API keys. TURN uses existing server-only convars.
PhoneConfig.KiloLive = PhoneConfig.KiloLive or {
    Enabled = true,
    MaxStreams = 4,
    MaxViewers = 8,           -- WebRTC fan-out, not an SFU. Each viewer consumes host upload.
    MaxSeconds = 1800,
    Width = 360, Height = 640, FPS = 20, Bitrate = 600000,
    RequireTURN = true,      -- Reuses phone_turn_* (Cloudflare or coturn).
    RelayOnly = true,        -- Hides peer network addresses from other players.
    ConnectionTimeout = 25,
    HeartbeatTimeout = 35,
    AllowMicrophone = true,  -- Opt-in WebRTC microphone only when the client supports it.
    CommentBytes = 240,
    CommentHistory = 60,
    GiftsEnabled = true,
    GiftsFollowerGateEnabled = false, -- Keep disabled for initial testing; turn on after owner approval.
    GiftsMinimumFollowers = 50,
    CoinsPerBankDollar = 1,
    CoinPacks = {
        { Id = 'starter', Coins = 100, BankCost = 1000, Label = '100 coins' },
        { Id = 'supporter', Coins = 550, BankCost = 5000, Label = '550 coins' },
    },
}
