<script>
    import { fade } from "svelte/transition";
    import { onMount } from "svelte";

    import { WheaterIcons } from "../../config";
    import {
        AddNotification,
        IsEnvBrowser,
        Notifications,
        OnEvent,
        RemoveNotification,
        SendEvent,
        SetDropdown,
        SetExitHandler,
        ShowSuccessModal,
        UpdateNotification,
    } from "../../utils/Utils";
    import AppProvider from "./AppProvider.svelte";
    import AppStore from "./Apps/AppStore.svelte";
    import Application from "./components/Application.svelte";
    import Container from "./Container.svelte";
    import Input from "./Modals/Input.svelte";
    import Loader from "./Modals/Loader.svelte";
    import Success from "./Modals/Success.svelte";

    import {
        HasVpn,
        HasRacingUsb,
        HasPDRacingUsb,
        RacingAlias,
        InputModal,
        JobManager,
        CurrentDocument,
        DocumentIsDrop,
        LoaderModal,
        PlayerData,
        SuccessModal,
        Brand,
        EmbedsEnabled,
        PhoneBackground,
        ProfilePicture,
        InstalledApps,
        CurrentNetwork as CurrentNetworkStore,
    } from "./phone.stores";
    import { ImageHoverData } from "../../stores";

    let PhoneVisible = IsEnvBrowser(); // Is A phone visible?
    let SoundsMuted = false;
    let IsNearNetwork = false;
    let IsNetworkEnabled = true;

    let CurrentNetwork = "";
    let CurrentApp = "home"; // Default: "home";
    let CurrentTime = [12, 0];
    let CurrentWeather = "EXTRASUNNY";
    let UnreadApps = {};

    // Initialize phone with default data in browser mode for development
    onMount(() => {
        if (IsEnvBrowser()) {
            // Set default player data
            PlayerData.set({
                Id: 1,
                Cid: "2001",
                Job: "unemployed",
                Name: "Test User",
                Phone: "1234567890",
            });
            // Set default time
            CurrentTime = [new Date().getHours(), new Date().getMinutes()];
            // Ensure phone is visible
            PhoneVisible = true;
            // Set default weather
            CurrentWeather = "EXTRASUNNY";
        }
    });

    const SetCurrentApp = (App) => {
        CurrentApp = App;
        UnreadApps[App] = false;
        SendEvent("SetCurrentApp", { App });
    };

    const ToggleSound = () => {
        SoundsMuted = !SoundsMuted;
        SendEvent("Phone/ToggleSounds", { State: SoundsMuted });
    };

    const GoHome = () => {
        if (CurrentApp != "home") {
            CurrentApp = "home";
            SendEvent("SetCurrentApp", { App: "home" });
        }

        // PhoneVisible = false;
        // SendEvent("ClosePhone");
    };

    const ConnectNetwork = () => {
        if (!IsNearNetwork) return;

        SendEvent("Network/GetNetworks", {}, (Success, Data) => {
            if (!Success) return;

            InputModal.set({
                Visible: true,
                Inputs: [
                    {
                        Id: "Network",
                        Type: "TextField",
                        Data: {
                            Title: "Network:",
                            Select: Data.map(({ Id, Name }) => ({
                                Text: Name,
                                Value: Id,
                            })),
                            Value: Data[0]?.Value,
                            RealValue: Data[0]?.Text,
                        },
                    },
                    {
                        Id: "Password",
                        Type: "TextField",
                        Data: {
                            Title: "Password",
                            Type: "password",
                            Icon: "user-lock",
                        },
                    },
                ],
                OnSubmit: (Result) => {
                    if (Result.Network.length <= 0) return;

                    LoaderModal.set(true);
                    SendEvent("Network/Connect", Result, (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        if (Data) ShowSuccessModal();
                    });
                },
            });
        });
    };

    let IsHomeFocused = false;
    let ShowHomeEaster = false;
    let EasterEggTimeout;
    const HomeEnter = () => {
        IsHomeFocused = true;

        EasterEggTimeout = setTimeout(() => {
            if (IsHomeFocused) {
                ShowHomeEaster = true;
            }
        }, 1500);
    };

    const MouseLeave = () => {
        IsHomeFocused = false;
        ShowHomeEaster = false;
        clearTimeout(EasterEggTimeout);
    };

    const Selfie = () => {
        SendEvent("Phone/Selfie");
    };

    OnEvent("SetPhoneBrand", (Data) => {
        Brand.set(Data.Brand);
    });

    OnEvent("SetPhoneBackground", (Data) => {
        PhoneBackground.set(Data.Background);
    });

    OnEvent("SetEmbedsEnabled", (Data) => {
        EmbedsEnabled.set(Data.Enabled);
    });

    OnEvent("ClosePhone", (Data) => {
        CurrentApp = "home";
        PhoneVisible = false;
        CurrentNetworkStore.set("");
        InputModal.set({ Visible: false });
        ImageHoverData.set({ Show: false });
        SetDropdown(false);
    });

    OnEvent("OpenPhone", (Data) => {
        PhoneVisible = true;
        CurrentWeather = Data.Weather;
        HasVpn.set(Data.HasVPN);
        HasRacingUsb.set(Data.HasRacingUsb);
        HasPDRacingUsb.set(Data.HasPDRacingUsb);
        RacingAlias.set(Data.RacingAlias);
        CurrentTime = Data.Time;

        IsNearNetwork = Data.IsNearNetwork;
        IsNetworkEnabled = Data.IsNetworkEnabled;

        PlayerData.set(Data.PlayerData);

        SendEvent(
            "GetProfilePicture",
            { Phone: Data.PlayerData?.PhoneNumber },
            (Success, Avatar) => {
                if (Avatar) {
                    ProfilePicture.set(Avatar);
                }
            },
        );

        SendEvent("GetInstalledApps", {}, (Success, Apps) => {
            if (Success) InstalledApps.set(Apps);
        });
    });

    OnEvent("UpdatePlayerData", (Data) => {
        PlayerData.set(Data.PlayerData);
    });

    OnEvent("Notification", AddNotification);
    OnEvent("UpdateNotification", UpdateNotification);
    OnEvent("RemoveNotification", RemoveNotification);

    OnEvent("SetAppUnread", (Data) => {
        UnreadApps[Data.App] = true;
    });

    OnEvent("SetCurrentNetwork", (Data) => {
        CurrentNetwork = Data.Network;
        CurrentNetworkStore.set(Data.Network || "");
    });

    OnEvent("SetJobManager", (Data) => {
        JobManager.set(Data.JobManager);
    });

    OnEvent("Documents/SetDocument", (Data) => {
        CurrentDocument.set(Data.Document);
        DocumentIsDrop.set(Data.IsDrop);
        CurrentApp = "documents";
    });

    OnEvent("AppInstalled", (Data) => {
        InstalledApps.update((n) => {
            n[Data.AppId] = true;
            return n;
        });
    });

    OnEvent("AppUninstalled", (Data) => {
        InstalledApps.update((n) => {
            let newApps = { ...n };
            delete newApps[Data.AppId];
            return newApps;
        });
    });

    // Auto-switch to app (used by Facetime when call is answered)
    OnEvent("SwitchToApp", (Data) => {
        if (Data.App) {
            CurrentApp = Data.App;
            SendEvent("SetCurrentApp", { App: Data.App });
        }
    });

    SetExitHandler("ClosePhone", "ClosePhone", () => {
        return PhoneVisible;
    });

    // Pagination & App Data Logic
    let CurrentPage = 0;
    const AppsPerPage = 20; // Changed to 20 as requested

    $: Apps = [
        {
            id: "details",
            tooltip: "Information",
            image: "nui://peak-phone/web/public/images/details.png",
            unread: UnreadApps["details"],
        },

        {
            id: "settings",
            tooltip: "Settings",
            image: "nui://peak-phone/web/public/images/settings.png",
            unread: UnreadApps["settings"],
        },
        {
            id: "store",
            tooltip: "App Store",
            icon: "store", // FontAwesome
            action: () => SetCurrentApp("store"),
        },
        {
            id: "camera",
            tooltip: "Camera",
            image: "nui://peak-phone/web/public/images/camera.png",
            action: Selfie,
        },
        {
            id: "contacts",
            tooltip: "Contacts",
            image: "nui://peak-phone/web/public/images/contacts.png",
            unread: UnreadApps["contacts"],
        },
        {
            id: "calls",
            tooltip: "Calls",
            image: "nui://peak-phone/web/public/images/calls.png",
            unread: UnreadApps["calls"],
        },
        {
            id: "messages",
            tooltip: "Messages",
            image: "nui://peak-phone/web/public/images/conversations.png",
            unread: UnreadApps["messages"],
        },
        {
            id: "mails",
            tooltip: "Emails",
            image: "nui://peak-phone/web/public/images/email.png",
            unread: UnreadApps["mails"],
        },
        {
            id: "yellowpages",
            tooltip: "Yellow Pages",
            image: "nui://peak-phone/web/public/images/yellowpages.png",
            unread: UnreadApps["yellowpages"],
        },
        {
            id: "y",
            tooltip: "Y",
            image: "nui://peak-phone/web/public/images/y.png",
            unread: UnreadApps["y"],
        },
        {
            id: "vehicles",
            tooltip: "Vehicles",
            image: "nui://peak-phone/web/public/images/vehicles.png",
            unread: UnreadApps["vehicles"],
        },
        {
            id: "wenmo",
            tooltip: "Wenmo",
            image: "nui://peak-phone/web/public/images/wenmo.png",
            unread: UnreadApps["wenmo"],
        },
        {
            id: "peakify",
            tooltip: "Peakify",
            image: "nui://peak-phone/web/public/images/peakify.svg",
            unread: UnreadApps["peakify"],
        },
        {
            id: "documents",
            tooltip: "Documents",
            image: "nui://peak-phone/web/public/images/documents.png",
            unread: UnreadApps["documents"],
        },
        {
            id: "housing",
            tooltip: "Housing",
            image: "nui://peak-phone/web/public/images/housing.png",
            unread: UnreadApps["housing"],
        },
        {
            id: "jobcenter",
            tooltip: "Job Center",
            image: "nui://peak-phone/web/public/images/jobcenter.png",
            unread: UnreadApps["jobcenter"],
        },
        {
            id: "busdriver",
            tooltip: "Bus Driver",
            image: "nui://peak-phone/web/public/images/bus.png",
            unread: UnreadApps["busdriver"],
        },
        {
            id: "lumberjack",
            tooltip: "Lumberjack",
            image: "nui://peak-phone/web/public/images/lumberjack.png",
            unread: UnreadApps["lumberjack"],
        },
        {
            id: "bin",
            tooltip: "Binsbergen International Network",
            image: "nui://peak-phone/web/public/images/binsbergen.png",
            unread: UnreadApps["bin"],
        },
        $HasPDRacingUsb
            ? {
                  id: "time-trials",
                  tooltip: "Time Trials",
                  image: "nui://peak-phone/web/public/images/time-trials.png",
                  unread: UnreadApps["time-trials"],
              }
            : null,
        !$HasPDRacingUsb && $HasRacingUsb
            ? {
                  id: "racing",
                  tooltip: "Racing",
                  image: "nui://peak-phone/web/public/images/racing.png",
                  unread: UnreadApps["racing"],
              }
            : null,
        {
            id: "calculator",
            tooltip: "Calculator",
            image: "nui://peak-phone/web/public/images/calculator.png",
            unread: UnreadApps["calculator"],
        },
        {
            id: "gallery",
            tooltip: "Gallery",
            image: "nui://peak-phone/web/public/images/gallery.png",
            unread: UnreadApps["gallery"],
        },
        // Networked Apps
        CurrentNetwork == "pdm"
            ? {
                  id: "cars",
                  tooltip: "Premium Deluxe Motorsports",
                  icon: "CarFront",
                  unread: UnreadApps["cars"],
              }
            : null,
        CurrentNetwork == "bennys"
            ? {
                  id: "cars",
                  tooltip: "Bennys Motorworks",
                  icon: "CarFront",
                  unread: UnreadApps["cars"],
              }
            : null,
        CurrentNetwork == "flightschool"
            ? {
                  id: "cars",
                  tooltip: "Los Santos Flight School",
                  icon: "CarFront",
                  unread: UnreadApps["cars"],
              }
            : null,
        CurrentNetwork == "lostmc"
            ? {
                  id: "cars",
                  tooltip: "The Lost Holland",
                  icon: "Motorbike",
                  unread: UnreadApps["cars"],
              }
            : null,
        CurrentNetwork == "losmuertos"
            ? {
                  id: "cars",
                  tooltip: "Muertos Motorcycle Shop",
                  icon: "Motorbike",
                  unread: UnreadApps["cars"],
              }
            : null,
        CurrentNetwork == "deathsinners"
            ? {
                  id: "cars",
                  tooltip: "Death Sinners MC",
                  icon: "Motorbike",
                  unread: UnreadApps["cars"],
              }
            : null,
        CurrentNetwork == "darkwolves"
            ? {
                  id: "cars",
                  tooltip: "Dark Wolves MC",
                  icon: "Motorbike",
                  unread: UnreadApps["cars"],
              }
            : null,
        CurrentNetwork == "darkwolves"
            ? {
                  id: "cars",
                  tooltip: "Dark Wolves MC",
                  icon: "Motorbike",
                  unread: UnreadApps["cars"],
              }
            : null,
    ].filter((x) => x !== null);

    // Dynamic filtering for Installed Apps
    $: InstalledList = $InstalledApps;
    $: FilteredApps = Apps.filter((app) => {
        // Always Keep List
        const KeepList = [
            "settings",
            "camera",
            "details",
            "gallery",
            "documents",
            "store",
            "calls",
            "messages",
            "mails",
            "contacts",
        ];
        if (KeepList.includes(app.id)) return true;

        // Conditional/Network/Hidden Apps (Keep if they exist in the list, as they are already conditional in Apps array)
        // We identify them by ID.
        const HiddenList = [
            "time-trials",
            "racing",
            "cars",
        ];
        // Note: 'cars' is used for multiple network apps, so checking ID 'cars' works.
        if (HiddenList.includes(app.id)) return true;

        // Otherwise check if installed
        return InstalledList[app.id];
    });

    // Filter Dock Apps vs Home Apps
    $: DockList = ["calls", "messages", "mails", "contacts"];
    $: DockApps = FilteredApps.filter((app) => DockList.includes(app.id));
    $: HomeApps = FilteredApps.filter((app) => !DockList.includes(app.id));

    // Pagination for HomeApps only
    $: TotalPages = Math.ceil(HomeApps.length / AppsPerPage);
    $: PagedApps = HomeApps.slice(
        CurrentPage * AppsPerPage,
        (CurrentPage + 1) * AppsPerPage,
    );

    // Swipe Logic
    let TouchStartX = 0;
    let TouchEndX = 0;

    const HandleTouchStart = (e) => {
        TouchStartX = e.changedTouches
            ? e.changedTouches[0].screenX
            : e.screenX;
    };

    const HandleTouchEnd = (e) => {
        TouchEndX = e.changedTouches ? e.changedTouches[0].screenX : e.screenX;
        HandleSwipe();
    };

    const HandleSwipe = () => {
        if (TouchEndX < TouchStartX - 50) {
            // Swipe Left -> Next Page
            if (CurrentPage < TotalPages - 1) CurrentPage++;
        }
        if (TouchEndX > TouchStartX + 50) {
            // Swipe Right -> Prev Page
            if (CurrentPage > 0) CurrentPage--;
        }
    };
</script>

<div class="phone-wrapper">
    <!-- <h1 style="margin-left: 37vh; margin-top: 1vh;">Current Network: {CurrentNetwork}</h1>
    <h1 style="margin-left: 37vh; margin-top: 1vh;">Current App: {CurrentApp}</h1>
    <h1 style="margin-left: 37vh; margin-top: 1vh;">Input Modal JSON:</h1>
    <pre style="font-size: 1.25vh; margin-left: 37vh; margin-top: 1vh; border: 0.1vh solid rgba(0, 0, 0, 0.15); background-color: rgba(0, 0, 0, 0.05); width: fit-content; padding: 1vh;">{JSON.stringify($InputModal, undefined, 2)}</pre>

    <h1 style="margin-left: 37vh; margin-top: 1vh;">Notifications JSON:</h1>
    <pre style="font-size: 1.25vh; margin-left: 37vh; margin-top: 1vh; border: 0.1vh solid rgba(0, 0, 0, 0.15); background-color: rgba(0, 0, 0, 0.05); width: fit-content; padding: 1vh;">{JSON.stringify($Notifications, undefined, 2)}</pre> -->

    <Container
        class="phone-container {IsEnvBrowser()
            ? 'phone-debug'
            : ''} {PhoneVisible
            ? 'phone-visible'
            : $Notifications.length > 0
              ? 'phone-half'
              : 'phone-hidden'}"
    >
        {#if $LoaderModal}
            <Loader />
        {/if}

        {#if $SuccessModal}
            <Success />
        {/if}

        {#if $InputModal.Visible}
            <Input />
        {/if}

        {#if CurrentApp == "home"}
            <!-- Main Grid Applications -->
            <div
                class="phone-applications-wrapper"
                on:touchstart={HandleTouchStart}
                on:touchend={HandleTouchEnd}
                on:mousedown={HandleTouchStart}
                on:mouseup={HandleTouchEnd}
            >
                {#key CurrentPage}
                    <div in:fade={{ duration: 200 }} class="phone-applications">
                        {#each PagedApps as app}
                            <Application
                                on:click={() => {
                                    app.action
                                        ? app.action()
                                        : SetCurrentApp(app.id);
                                }}
                                HasUnread={app.unread}
                                Tooltip={app.tooltip}
                                Icon={app.icon}
                                Image={app.image}
                            />
                        {/each}
                    </div>
                {/key}
                {#if TotalPages > 1}
                    <div class="phone-pagination">
                        {#each Array(TotalPages) as _, i}
                            <div
                                class="phone-pagination-dot {CurrentPage === i
                                    ? 'active'
                                    : ''}"
                                on:click={() => (CurrentPage = i)}
                            />
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Bottom Dock -->
            <div class="phone-dock-wrapper">
                <div class="phone-dock-glass">
                    {#each DockApps as app}
                        <Application
                            class="dock-app"
                            on:click={() => {
                                app.action
                                    ? app.action()
                                    : SetCurrentApp(app.id);
                            }}
                            HasUnread={app.unread}
                            Tooltip={null}
                            Icon={app.icon}
                            Image={app.image}
                            IconSize="2.8vh"
                        />
                    {/each}
                </div>
            </div>
        {:else if CurrentApp == "store"}
            <AppStore />
        {:else}
            <AppProvider App={CurrentApp} />
        {/if}

        <!-- Split HUD Topbar (No Island) -->
        <div class="phone-topbar">
            <!-- Left: Time (Floating) -->
            <div class="status-pill status-left">
                <span class="status-time">
                    {CurrentTime[0] < 10
                        ? `0${CurrentTime[0]}`
                        : CurrentTime[0]}:{CurrentTime[1] < 10
                        ? `0${CurrentTime[1]}`
                        : CurrentTime[1]}
                </span>
                <span class="status-id">ID {$PlayerData?.Id ?? "--"}</span>
            </div>

            <!-- Center: Empty or minimalist indicator (optional) -->

            <!-- Right: Status Icons (Floating) -->
            <div class="status-pill status-right">
                <div class="status-icons">
                    {#if IsNetworkEnabled}
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <div
                            class="status-clickable-area"
                            on:click|stopPropagation={ConnectNetwork}
                            style="pointer-events: auto;"
                        >
                            <i
                                class:fa-signal={!IsNearNetwork}
                                class:fa-wifi={IsNearNetwork}
                                class="fas status-icon {IsNearNetwork ||
                                CurrentNetwork
                                    ? 'active'
                                    : ''}"
                            />
                        </div>
                    {:else}
                        <i class="fas fa-signal-slash status-icon"></i>
                    {/if}

                    {#if $HasVpn}
                        <i class="fas fa-lock status-icon vpn-active" />
                    {/if}

                    <i
                        class="fas fa-{WheaterIcons[
                            CurrentWeather
                        ]} status-icon weather"
                    />

                    <span class="battery-text">100%</span>
                    <i class="fas fa-battery-full status-icon battery"></i>
                </div>
            </div>
        </div>

        <div class="phone-bottombar">
            <div
                on:keyup
                on:click={GoHome}
                on:mouseenter={HomeEnter}
                on:mouseleave={MouseLeave}
                class="phone-bottombar-home"
            >
                {#if ShowHomeEaster}
                    <div class="phone-bottembar-home-mint" />
                {:else}
                    <div class="phone-bottembar-home-circle" />
                {/if}
            </div>
        </div>
    </Container>

</div>

<style>
    .phone-wrapper {
        position: absolute;
        top: 0;
        left: 0;

        font-family: Roboto;
        font-size: 1vh;

        color: white;

        width: 100vw;
        height: 100vh;

        user-select: none;
    }

    .phone-bottombar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2.5vh;
        padding: 0.4vh 0;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .phone-bottombar > .phone-bottombar-notifications {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 50%;
        color: var(--color-text-primary);
        text-align: center;
        font-size: 1.4vh;
        cursor: pointer;
        transition: all var(--transition-fast);
        padding: 0.8vh 0;
        min-height: 2.8vh;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .phone-bottombar > .phone-bottombar-notifications:hover {
        color: var(--color-primary);
        transform: translateY(-50%) scale(1.1);
    }

    .phone-bottombar > .phone-bottombar-camera {
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 50%;
        color: var(--color-text-primary);
        text-align: center;
        font-size: 1.4vh;
        cursor: pointer;
        transition: all var(--transition-fast);
        padding: 0.8vh 0;
        min-height: 2.8vh;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .phone-bottombar > .phone-bottombar-camera:hover {
        color: var(--color-primary);
        transform: translateY(-50%) scale(1.1);
    }

    .phone-bottombar-home {
        position: relative;
        width: 10vh;
        height: 0.5vh;
        cursor: pointer;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .phone-bottombar-home > .phone-bottembar-home-circle {
        position: relative;
        width: 10vh;
        height: 0.5vh;
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.3) 10%,
            rgba(255, 255, 255, 0.5) 50%,
            rgba(255, 255, 255, 0.3) 90%,
            transparent 100%
        );
        border-radius: var(--radius-full);
        transition: all var(--transition-base);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .phone-bottombar-home:hover > .phone-bottembar-home-circle {
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(74, 222, 128, 0.4) 10%,
            rgba(74, 222, 128, 0.7) 50%,
            rgba(74, 222, 128, 0.4) 90%,
            transparent 100%
        );
        box-shadow:
            0 2px 12px rgba(74, 222, 128, 0.5),
            0 0 20px rgba(74, 222, 128, 0.3);
        transform: scaleX(1.1);
    }

    .phone-bottombar-home:active > .phone-bottembar-home-circle {
        transform: scaleX(0.95);
        transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .phone-bottombar-home > .phone-bottembar-home-mint {
        position: relative;
        width: 10vh;
        height: 0.5vh;
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(74, 222, 128, 0.5) 10%,
            rgba(74, 222, 128, 0.85) 50%,
            rgba(74, 222, 128, 0.5) 90%,
            transparent 100%
        );
        border-radius: var(--radius-full);
        box-shadow:
            0 0 20px rgba(74, 222, 128, 0.6),
            0 2px 12px rgba(74, 222, 128, 0.5);
        animation: pulseGesture 2s ease-in-out infinite;
    }

    @keyframes pulseGesture {
        0%,
        100% {
            opacity: 0.8;
            box-shadow:
                0 0 20px rgba(74, 222, 128, 0.6),
                0 2px 12px rgba(74, 222, 128, 0.5);
        }
        50% {
            opacity: 1;
            box-shadow:
                0 0 30px rgba(74, 222, 128, 0.8),
                0 2px 16px rgba(74, 222, 128, 0.7);
        }
    }

    .phone-topbar {
        position: absolute;
        top: 0;
        width: 100%;
        height: 6vh; /* Sufficient height */
        background: transparent;
        padding: 0 1.5vh;
        z-index: 999; /* Higher z-index to ensure clicks work */
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding-top: 1.2vh;
        pointer-events: none; /* Container doesn't block */
        box-sizing: border-box;
    }

    /* Split HUD Pills */
    .status-pill {
        display: flex;
        align-items: center;
        height: 3vh;
        padding: 0 1vh;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 2vh;
        pointer-events: auto; /* Clickable */
        color: white;
        transition: all 0.2s ease;
    }

    .status-left {
        justify-content: center;
        gap: 0.7vh;
    }

    .status-right {
        justify-content: center;
    }

    .status-time {
        font-weight: 600;
        font-size: 1.4vh;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        letter-spacing: 0.05em;
    }

    .status-id {
        font-size: 1.1vh;
        font-weight: 600;
        opacity: 0.9;
        letter-spacing: 0.04em;
        white-space: nowrap;
    }

    .status-icons {
        display: flex;
        align-items: center;
        gap: 1vh;
    }

    .status-clickable-area {
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s;
    }

    .status-clickable-area:hover {
        opacity: 0.7;
    }

    .status-icon {
        font-size: 1.3vh;
        color: white;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    .status-icon.active {
        color: #fff;
    }

    .vpn-active {
        color: #4ade80;
    }

    .battery-text {
        font-size: 1.1vh;
        font-weight: 600;
        margin-right: 0.2vh;
    }

    /* Main Grid Wrapper */
    .phone-applications-wrapper {
        position: relative;
        width: 100%;
        height: 100%;
        padding-top: 5vh; /* Increased clearance for top bar */
        padding-bottom: 14vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .phone-applications {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(5, min-content);
        gap: 2.4vh 1.8vh; /* Slightly increased vertical gap */
        padding: 0 3.2vh; /* Balanced side padding */
        width: 100%;
        box-sizing: border-box;
        align-content: start;
        justify-items: center; /* Ensure items are centered within their grid cells */
    }

    .phone-applications :global(.phone-application) {
        /* Ensure labels don't wrap weirdly */
        width: 100%;
    }

    /* Pagination moved up slightly */
    /* Pagination styled & positioned */
    .phone-pagination {
        position: absolute;
        bottom: 12.5vh; /* Positioned between grid and dock */
        left: 0;
        right: 0;
        margin: 0 auto; /* Center horizontally */
        width: fit-content;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.8vh;
        z-index: 10;
        pointer-events: all;

        /* Glassmorphism Pill Style */
        background: rgba(0, 0, 0, 0.5);
        border-radius: 2vh;
        padding: 0.6vh 1.4vh;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .phone-pagination-dot {
        width: 0.8vh;
        height: 0.8vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        transition: all 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .phone-pagination-dot.active {
        background: #ffffff;
        transform: scale(1.1);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.6);
        border-color: white;
    }

    /* Dock Styles */
    .phone-dock-wrapper {
        position: absolute;
        bottom: 3.5vh; /* Lifted slightly */
        left: 0;
        right: 0;
        height: auto;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 101; /* Above applications */
        pointer-events: none;
    }

    .phone-dock-glass {
        pointer-events: auto;
        width: 90%;
        padding: 1.5vh 1vh;
        /* Match Top Bar Pill Style Exactly */
        background: rgba(0, 0, 0, 0.5);
        border-radius: 3vh;
        display: flex;
        justify-content: space-evenly;
        align-items: center;
        color: white;
        transition: all 0.2s ease;
        /* Remove borders/shadows to match the cleaner pill look if desired, or keep subtle */
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }

    /* Dock App Specifics */
    :global(.dock-app .phone-app-label) {
        display: none !important;
    }

    :global(.dock-app .phone-app-icon-container) {
        margin-bottom: 0 !important;
        /* Width/Height removed to inherit from Application.svelte (5.0vh) */
        /* width: 6vh !important;  <-- Removed */
        /* height: 6vh !important; <-- Removed */
    }

    :global(.dock-app) {
        width: auto !important;
        flex-grow: 1;
        justify-content: center;
    }
</style>
