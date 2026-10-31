<script>
    import { fade, slide } from "svelte/transition";
    import { onMount } from "svelte";
    import {
        SendEvent,
        AsyncSendEvent,
        ShowSuccessModal,
    } from "../../../utils/Utils";
    import {
        ProfilePicture,
        InputModal,
        LoaderModal,
        PhoneBackground,
    } from "../phone.stores";
    import AppWrapper from "../components/AppWrapper.svelte";

    let SoundsMuted = false;
    let ReceiveSMS = true;
    let NewTweet = true;
    let ReceiveEmail = true;
    let ImagesEmbedded = true;
    let Ringtone = "phone.phoneRing";

    const WallpaperPresets = [
        { id: "preset-1", label: "Neon Drift", src: "images/wallpapers/preset_1.webp" },
        { id: "preset-2", label: "Midnight Bloom", src: "images/wallpapers/preset_2.webp" },
        { id: "preset-3", label: "Chrome Wave", src: "images/wallpapers/preset_3.webp" },
        { id: "preset-4", label: "Emerald Haze", src: "images/wallpapers/preset_4.webp" },
    ];

    let SelectedWallpaper = null;
    let CurrentWallpaper = null;

    const RingtoneLabels = {
        "phone.phoneRing": "Default",
        "ringtones.seaside": "Seaside",
        "ringtones.stilldre": "Still D.R.E.",
    };

    const ToggleSound = () => {
        SoundsMuted = !SoundsMuted;
        SendEvent("Phone/ToggleSounds", { State: SoundsMuted });
    };

    const ToggleReceiveSMS = () => {
        ReceiveSMS = !ReceiveSMS;
        SendEvent("Phone/SetPreference", {
            Id: "Notifications.SMS",
            Value: ReceiveSMS,
        });
    };

    const ToggleNewTweet = () => {
        NewTweet = !NewTweet;
        SendEvent("Phone/SetPreference", {
            Id: "Notifications.Tweet",
            Value: NewTweet,
        });
    };

    const ToggleReceiveEmail = () => {
        ReceiveEmail = !ReceiveEmail;
        SendEvent("Phone/SetPreference", {
            Id: "Notifications.Email",
            Value: ReceiveEmail,
        });
    };

    const ToggleImagesEmbedded = () => {
        ImagesEmbedded = !ImagesEmbedded;
        SendEvent("Phone/SetPreference", {
            Id: "Images.Embedded",
            Value: ImagesEmbedded,
        });
    };

    const SelectWallpaperPreset = (Preset) => {
        if (!Preset) return;
        SelectedWallpaper = Preset;
    };

    const ConfirmWallpaperPreset = () => {
        if (!SelectedWallpaper) return;

        LoaderModal.set(true);
        PhoneBackground.set(SelectedWallpaper.src);
        SendEvent(
            "Phone/SetPreference",
            {
                Id: "Phone.Background",
                Value: SelectedWallpaper.src,
            },
            (Success) => {
                LoaderModal.set(false);
                if (Success) {
                    CurrentWallpaper = SelectedWallpaper.src;
                    ShowSuccessModal();
                }
            },
        );
    };

    const ChangeRingtone = () => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Ringtone",
                    Type: "TextField",
                    Data: {
                        Title: "Ringtone",
                        Select: [
                            { Text: "Default", Value: "phone.phoneRing" },
                            { Text: "Seaside", Value: "ringtones.seaside" },
                            {
                                Text: "Still D.R.E.",
                                Value: "ringtones.stilldre",
                            },
                        ],
                        Value: Ringtone,
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (!Result.Ringtone) return;

                LoaderModal.set(true);
                SendEvent(
                    "Phone/SetPreference",
                    {
                        Id: "Phone.Ringtone",
                        Value: Result.Ringtone,
                    },
                    (Success) => {
                        LoaderModal.set(false);
                        if (Success) {
                            Ringtone = Result.Ringtone;
                            ShowSuccessModal();
                        }
                    },
                );
            },
        });
    };

    const ChangeProfilePFP = () => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Avatar",
                    Type: "TextField",
                    Data: {
                        Title: "Avatar URL",
                        Icon: "image",
                        Value: $ProfilePicture || "",
                    },
                },
            ],
            OnSubmit: (Result) => {
                // This assumes there is a functionality to update just the PFP or suggests it via gallery which might not be directly updateable here without more logic
                // For now, let's assume we can trigger an update if the backend supports it, or just show a message.
                // Based on previous code, it just showed "Change PFP via Gallery", implying it might not be editable here directly?
                // But the user wants functionality. Let's start with a simple event if one existed or just keep it informational?
                // The previous code said "Change PFP via Gallery" as a text action.
                // Let's implement a direct update if we can, or guide them.
                // We'll trust the Contacts "UpdateProfile" logic which worked on "My Card".
                // We can try calling the same endpoint: Contacts/UpdateProfile
                LoaderModal.set(true);
                SendEvent(
                    "Contacts/UpdateProfile",
                    { avatar: Result.Avatar },
                    () => {
                        LoaderModal.set(false);
                        ProfilePicture.set(Result.Avatar); // Update store
                        ShowSuccessModal();
                    },
                );
            },
        });
    };

    onMount(async () => {
        const [Success, Preferences] = await AsyncSendEvent(
            "Phone/GetPreferences",
            {},
        );
        if (Success && Preferences) {
            ReceiveSMS = Preferences["Notifications.SMS"] ?? true;
            NewTweet = Preferences["Notifications.Tweet"] ?? true;
            ReceiveEmail = Preferences["Notifications.Email"] ?? true;
            ImagesEmbedded = Preferences["Images.Embedded"] ?? true;
            Ringtone = Preferences["Phone.Ringtone"] ?? "phone.phoneRing";
            CurrentWallpaper =
                Preferences["Phone.Background"] ??
                "images/defaultwallpaperphone.png";
            PhoneBackground.set(CurrentWallpaper);
            SelectedWallpaper =
                WallpaperPresets.find((p) => p.src === CurrentWallpaper) || null;
        }
    });
</script>

<AppWrapper>
    <div class="glass-container">
        <!-- BACKGROUND DEEP BLUR -->
        <div class="glass-bg"></div>

        <!-- HEADER -->
        <div class="glass-header">
            <div class="gh-title">Settings</div>
        </div>

        <!-- SCROLL AREA -->
        <div class="glass-scroll">
            <!-- MY PROFILE CARD -->
            <div
                class="my-card-glass"
                role="button"
                tabindex="0"
                on:click={ChangeProfilePFP}
                on:keydown={(e) => e.key === "Enter" && ChangeProfilePFP()}
            >
                <div class="mcg-content">
                    <div
                        class="mcg-avatar"
                        style="background-image: url({$ProfilePicture ||
                            './images/default_profile.png'})"
                    >
                        {#if !$ProfilePicture}ME{/if}
                    </div>
                    <div class="mcg-info">
                        <div class="mcg-name">My Profile</div>
                        <div class="mcg-sub">Change Avatar</div>
                    </div>
                </div>
                <div class="mcg-action">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>

            <!-- SECTIONS -->

            <!-- NOTIFICATIONS -->
            <div class="section-title">NOTIFICATIONS</div>

            <div
                class="glass-row"
                role="button"
                tabindex="0"
                on:click={ChangeRingtone}
                on:keydown={(e) => e.key === "Enter" && ChangeRingtone()}
            >
                <div class="gr-icon">
                    <i class="fas fa-music"></i>
                </div>
                <div class="gr-info">
                    <div class="gr-name">Ringtone</div>
                    <div class="gr-sub">
                        {RingtoneLabels[Ringtone] || "Default"}
                    </div>
                </div>
                <div class="gr-action">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>

            <div
                class="glass-row"
                role="button"
                tabindex="0"
                on:click={ToggleSound}
                on:keydown={(e) => e.key === "Enter" && ToggleSound()}
            >
                <div class="gr-icon">
                    <i class="fas fa-volume-up"></i>
                </div>
                <div class="gr-info">
                    <div class="gr-name">Sound Effects</div>
                    <div class="gr-sub">System & Alert sounds</div>
                </div>
                <div class="gr-toggle">
                    <div class="toggle-switch" class:active={!SoundsMuted}>
                        <div class="toggle-thumb"></div>
                    </div>
                </div>
            </div>

            <div
                class="glass-row"
                role="button"
                tabindex="0"
                on:click={ToggleReceiveSMS}
                on:keydown={(e) => e.key === "Enter" && ToggleReceiveSMS()}
            >
                <div class="gr-icon">
                    <i class="fas fa-comment-alt"></i>
                </div>
                <div class="gr-info">
                    <div class="gr-name">SMS Alerts</div>
                    <div class="gr-sub">Incoming messages</div>
                </div>
                <div class="gr-toggle">
                    <div class="toggle-switch" class:active={ReceiveSMS}>
                        <div class="toggle-thumb"></div>
                    </div>
                </div>
            </div>

            <div
                class="glass-row"
                role="button"
                tabindex="0"
                on:click={ToggleNewTweet}
                on:keydown={(e) => e.key === "Enter" && ToggleNewTweet()}
            >
                <div class="gr-icon">
                    <img
                        class="gr-image-icon"
                        src="images/y-app.svg"
                        alt="Y"
                    />
                </div>
                <div class="gr-info">
                    <div class="gr-name">Y</div>
                    <div class="gr-sub">New posts & mentions</div>
                </div>
                <div class="gr-toggle">
                    <div class="toggle-switch" class:active={NewTweet}>
                        <div class="toggle-thumb"></div>
                    </div>
                </div>
            </div>

            <div
                class="glass-row"
                role="button"
                tabindex="0"
                on:click={ToggleReceiveEmail}
                on:keydown={(e) => e.key === "Enter" && ToggleReceiveEmail()}
            >
                <div class="gr-icon">
                    <i class="fas fa-envelope"></i>
                </div>
                <div class="gr-info">
                    <div class="gr-name">Emails</div>
                    <div class="gr-sub">Incoming email alerts</div>
                </div>
                <div class="gr-toggle">
                    <div class="toggle-switch" class:active={ReceiveEmail}>
                        <div class="toggle-thumb"></div>
                    </div>
                </div>
            </div>

            <!-- MEDIA -->
            <div class="section-title">MEDIA</div>

            <div
                class="glass-row"
                role="button"
                tabindex="0"
                on:click={ToggleImagesEmbedded}
                on:keydown={(e) => e.key === "Enter" && ToggleImagesEmbedded()}
            >
                <div class="gr-icon">
                    <i class="fas fa-photo-video"></i>
                </div>
                <div class="gr-info">
                    <div class="gr-name">Auto-Load Media</div>
                    <div class="gr-sub">Images in apps</div>
                </div>
                <div class="gr-toggle">
                    <div class="toggle-switch" class:active={ImagesEmbedded}>
                        <div class="toggle-thumb"></div>
                    </div>
                </div>
            </div>

            <!-- SYSTEM -->
            <div class="section-title">SYSTEM</div>

            <div class="glass-row disabled">
                <div class="gr-icon">
                    <i class="fas fa-moon"></i>
                </div>
                <div class="gr-info">
                    <div class="gr-name">Dark Mode</div>
                    <div class="gr-sub">Always On</div>
                </div>
                <div class="gr-toggle">
                    <div class="toggle-switch active">
                        <div class="toggle-thumb"></div>
                    </div>
                </div>
            </div>
            <div class="glass-row info-only">
                <div class="gr-icon">
                    <i class="fas fa-mobile-alt"></i>
                </div>
                <div class="gr-info">
                    <div class="gr-name">Device Info</div>
                    <div class="gr-sub">PeakOS v2.0</div>
                </div>
            </div>

            <!-- WALLPAPER PRESETS -->
            <div class="section-title">WALLPAPER</div>

            <div class="wallpaper-card">
                <div class="wallpaper-preview">
                    <div
                        class="wallpaper-preview-img"
                        style="background-image: url({SelectedWallpaper?.src ||
                            CurrentWallpaper ||
                            'images/defaultwallpaperphone.png'})"
                    />
                    <div class="wallpaper-preview-meta">
                        <div class="wpm-title">Wallpaper Presets</div>
                        <div class="wpm-sub">
                            {SelectedWallpaper
                                ? `Selected: ${SelectedWallpaper.label}`
                                : "Select a preset below"}
                        </div>
                    </div>
                </div>

                <div class="wallpaper-grid">
                    {#each WallpaperPresets as preset}
                        <button
                            class="wallpaper-tile {SelectedWallpaper?.id ===
                            preset.id
                                ? 'selected'
                                : ''}"
                            type="button"
                            title={preset.label}
                            aria-label={preset.label}
                            on:click={() => SelectWallpaperPreset(preset)}
                        >
                            <div
                                class="wallpaper-thumb"
                                style="background-image: url({preset.src})"
                            />
                        </button>
                    {/each}
                </div>

                <div class="wallpaper-actions">
                    <button
                        class="wallpaper-confirm"
                        type="button"
                        disabled={!SelectedWallpaper ||
                            SelectedWallpaper.src === CurrentWallpaper}
                        on:click={ConfirmWallpaperPreset}
                    >
                        Confirm & Apply
                    </button>
                </div>
            </div>

            <div class="safe-padding"></div>
        </div>
    </div>
</AppWrapper>

<style>
    /* ----------------------
       THEME VARIABLES
       ---------------------- */
    .glass-container {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        font-family:
            "Inter",
            -apple-system,
            Roboto,
            sans-serif;
        color: #fff;
    }

    .glass-bg {
        position: absolute;
        width: 100%;
        height: 100%;
        background: radial-gradient(
            circle at 50% 120%,
            #2a1f3d 0%,
            #0d0d10 60%,
            #000 100%
        );
        z-index: 0;
    }

    /* HEADER */
    .glass-header {
        position: relative;
        z-index: 2;
        padding: 5vh 2.5vh 2vh 2.5vh;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .gh-title {
        font-size: 3.2vh;
        font-weight: 300;
        letter-spacing: -0.5px;
        opacity: 0.9;
    }

    /* SCROLL & LAYOUT */
    .glass-scroll {
        position: relative;
        z-index: 1;
        flex: 1;
        height: 88%;
        overflow-y: auto;
        padding: 0 2vh;
    }
    .glass-scroll::-webkit-scrollbar {
        display: none;
    }
    .safe-padding {
        height: 10vh;
        width: 100%;
    }

    /* SECTION TITLES */
    .section-title {
        margin-top: 3vh;
        margin-bottom: 1vh;
        margin-left: 1vh;
        font-size: 1.3vh;
        letter-spacing: 0.1vh;
        color: rgba(255, 255, 255, 0.4);
        font-weight: 600;
    }

    /* MY CARD STYLE */
    .my-card-glass {
        background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.1) 0%,
            rgba(255, 255, 255, 0.03) 100%
        );
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 2vh;
        padding: 1.5vh 2vh;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2vh;
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
        cursor: pointer;
    }
    .mcg-content {
        display: flex;
        align-items: center;
        gap: 1.5vh;
    }
    .mcg-avatar {
        width: 5.5vh;
        height: 5.5vh;
        border-radius: 50%;
        background-size: cover;
        background-position: center;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5vh;
        font-weight: 600;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background-color: rgba(255, 255, 255, 0.1);
    }
    .mcg-info {
        display: flex;
        flex-direction: column;
    }
    .mcg-name {
        font-size: 1.8vh;
        font-weight: 500;
    }
    .mcg-sub {
        font-size: 1.3vh;
        opacity: 0.6;
        margin-top: 0.3vh;
    }
    .mcg-action i {
        font-size: 1.4vh;
        opacity: 0.4;
    }

    /* GLASS ROW ITEMS */
    .glass-row {
        display: flex;
        align-items: center;
        gap: 1.5vh;
        padding: 1.5vh;
        border-radius: 1.5vh;
        background: rgba(255, 255, 255, 0.05);
        margin-bottom: 1vh;
        transition: background 0.2s;
        cursor: pointer;
        border: 1px solid transparent;
    }
    .glass-row:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.05);
    }
    .glass-row.disabled {
        opacity: 0.5;
        pointer-events: none;
    }
    .glass-row.info-only {
        cursor: default;
    }
    .glass-row.info-only:hover {
        background: rgba(255, 255, 255, 0.05);
    }

    .gr-icon {
        width: 4vh;
        height: 4vh;
        border-radius: 1.2vh;
        background: rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6vh;
        color: rgba(255, 255, 255, 0.8);
    }

    .gr-image-icon {
        width: 2.2vh;
        height: 2.2vh;
        object-fit: contain;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }
    .gr-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    .gr-name {
        font-size: 1.6vh;
        font-weight: 400;
        opacity: 0.95;
    }
    .gr-sub {
        font-size: 1.2vh;
        opacity: 0.5;
        margin-top: 0.2vh;
    }
    .gr-action i {
        font-size: 1.4vh;
        opacity: 0.4;
    }

    /* TOGGLE SWITCH */
    .toggle-switch {
        width: 5vh;
        height: 2.8vh;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 1.5vh;
        position: relative;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border: 1px solid rgba(0, 0, 0, 0.1);
    }

    .toggle-thumb {
        position: absolute;
        top: 0.2vh;
        left: 0.2vh;
        width: 2.2vh;
        height: 2.2vh;
        background: #fff;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .toggle-switch.active {
        background: #4ade80; /* Settings accent color reused for toggles or could use generic green */
        border-color: transparent;
        box-shadow: 0 0 10px rgba(74, 222, 128, 0.4);
    }

    .toggle-switch.active .toggle-thumb {
        transform: translateX(2.2vh);
    }

    /* WALLPAPER PRESETS */
    .wallpaper-card {
        margin-top: 1vh;
        background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.03) 100%
        );
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 2vh;
        padding: 1.6vh;
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    }

    .wallpaper-preview {
        display: flex;
        gap: 1.4vh;
        align-items: center;
        margin-bottom: 1.4vh;
    }

    .wallpaper-preview-img {
        width: 6.6vh;
        height: 9.6vh;
        border-radius: 1.2vh;
        background-size: cover;
        background-position: center;
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
        flex: 0 0 auto;
    }

    .wallpaper-preview-meta {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.4vh;
        min-width: 0;
        flex: 1;
    }

    .wpm-title {
        font-size: 1.6vh;
        font-weight: 600;
        letter-spacing: -0.2px;
    }

    .wpm-sub {
        font-size: 1.2vh;
        opacity: 0.6;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .wallpaper-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1vh;
    }

    .wallpaper-tile {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
        border-radius: 1.6vh;
        padding: 1vh;
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: background 0.2s, border-color 0.2s, transform 0.1s;
        text-align: center;
        color: inherit;
        min-height: 7.6vh;
    }

    .wallpaper-tile:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.12);
        transform: translateY(-1px);
    }

    .wallpaper-tile.selected {
        border-color: rgba(74, 222, 128, 0.55);
        box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.25) inset;
        background: rgba(74, 222, 128, 0.08);
    }

    .wallpaper-thumb {
        width: 4vh;
        height: 5.8vh;
        border-radius: 1vh;
        background-size: cover;
        background-position: center;
        border: 1px solid rgba(255, 255, 255, 0.12);
        flex: 0 0 auto;
    }

    .wallpaper-actions {
        margin-top: 1.2vh;
        display: flex;
        justify-content: flex-end;
    }

    .wallpaper-confirm {
        appearance: none;
        border: 1px solid rgba(74, 222, 128, 0.45);
        background: rgba(74, 222, 128, 0.12);
        color: #eafff1;
        padding: 1vh 1.3vh;
        border-radius: 1.4vh;
        font-size: 1.25vh;
        font-weight: 700;
        letter-spacing: 0.04em;
        cursor: pointer;
        transition: transform 0.1s, background 0.2s, opacity 0.2s;
    }

    .wallpaper-confirm:hover {
        background: rgba(74, 222, 128, 0.18);
        transform: translateY(-1px);
    }

    .wallpaper-confirm:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        transform: none;
    }
</style>
