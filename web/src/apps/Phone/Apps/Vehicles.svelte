<script>
    import { onMount } from "svelte";
    import AppWrapper from "../components/AppWrapper.svelte";
    import { SendEvent, ShowSuccessModal } from "../../../utils/Utils";
    import { InputModal, LoaderModal } from "../phone.stores";

    let Vehicles = [];
    let FilteredVehicles = [];
    let SearchQuery = "";
    let SelectedVehicle = null;
    let ActiveTab = "All"; // All, Garage, Outside, Impound

    // Tabs configuration
    const Tabs = ["All", "Garage", "Outside", "Impound"];

    // Filter logic
    $: {
        let temp = Vehicles;

        // Tab filter
        if (ActiveTab !== "All") {
            if (ActiveTab === "Garage") {
                // Garage includes "Inside" and specific garage names, basically anything not Outside or Depot
                temp = temp.filter(
                    (v) =>
                        v.State !== "Outside" &&
                        v.State !== "Depot" &&
                        v.State !== "Impound",
                );
            } else if (ActiveTab === "Outside") {
                temp = temp.filter((v) => v.State === "Outside");
            } else if (ActiveTab === "Impound") {
                temp = temp.filter(
                    (v) => v.State === "Depot" || v.State === "Impound",
                );
            }
        }

        // Search filter
        if (SearchQuery) {
            const query = SearchQuery.toLowerCase();
            temp = temp.filter(
                (v) =>
                    v.Plate.toLowerCase().includes(query) ||
                    v.Label.toLowerCase().includes(query) ||
                    v.Garage.toLowerCase().includes(query),
            );
        }

        FilteredVehicles = temp;
    }

    /* --- Helpers from Card/Details --- */
    const getImage = (model) => {
        if (!model) return "nui://peak-ui/web/dist/images/pdm/adder.jpg";
        return `nui://peak-ui/web/dist/images/pdm/${model.toLowerCase()}.jpg`;
    };

    const getStatusClass = (state) => {
        if (state === "Outside") return "status-out";
        if (state === "Depot") return "status-impound";
        return "status-in";
    };

    const getStateLabel = (state) => {
        switch (state) {
            case "Outside":
                return "Street";
            case "Depot":
                return "Impound";
            default:
                return "Garage";
        }
    };

    const getFillColor = (val) => {
        if (val < 40) return "#EF4444";
        if (val < 70) return "#EAB308";
        return "#6366f1"; // Indigo/Primary
    };

    /* --- Stats Logic for Details --- */
    let enginePerc = 0;
    let bodyPerc = 0;
    let fuelPerc = 0;

    $: if (SelectedVehicle) {
        enginePerc = Math.floor(SelectedVehicle.Engine / 10);
        bodyPerc = Math.floor(SelectedVehicle.Body / 10);
        fuelPerc = Math.floor(SelectedVehicle.Fuel);
    }

    const SetTab = (tab) => {
        ActiveTab = tab;
    };

    const SelectVehicle = (vehicle) => {
        SelectedVehicle = vehicle;
    };

    const ClearSelection = () => {
        SelectedVehicle = null;
    };

    const SpawnVehicle = (Data) => {
        SendEvent("Vehicles/SpawnVehicle", { Plate: Data.Plate }, (Success) => {
            if (Success) ShowSuccessModal();
        });
    };

    const TrackVehicle = (Data) => {
        SendEvent("Vehicles/TrackVehicle", { Plate: Data.Plate });
        ShowSuccessModal();
    };

    const TransferVehicle = (Data) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Cid",
                    Type: "TextField",
                    Data: { Title: "Citizen ID", Icon: "id-card" },
                },
                {
                    Id: "Amount",
                    Type: "TextField",
                    Data: {
                        Title: "Price",
                        Icon: "dollar-sign",
                        Type: "number",
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (Result.Cid.length <= 0) return;
                if (Result.Amount.length <= 0 || Result.Amount < 0) return;

                LoaderModal.set(true);
                SendEvent(
                    "Vehicles/SellVehicle",
                    { ...Result, Plate: Data.Plate },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        ShowSuccessModal();
                    },
                );
            },
        });
    };

    const Initialize = () => {
        SendEvent("Vehicles/GetVehicles", {}, (Success, Data) => {
            if (!Success) return;
            Vehicles = Data;
        });
    };

    onMount(() => {
        Initialize();
    });
</script>

{#if SelectedVehicle}
    <!-- DETAILS VIEW (Inline) -->
    <div class="vehicle-details-overlay">
        <!-- SCROLLABLE CONTENT AREA -->
        <div class="details-content-area">
            <!-- 1. Hero Card (Fixed Height in CSS) -->
            <div class="glass-panel details-hero-card">
                <div class="hero-top-row">
                    <div class="back-btn-float" on:click={ClearSelection}>
                        <i class="fas fa-arrow-left"></i>
                    </div>
                    <div
                        class="status-badge {getStatusClass(
                            SelectedVehicle.State,
                        )}"
                    >
                        {SelectedVehicle.State === "Outside"
                            ? "Street"
                            : SelectedVehicle.State === "Depot"
                              ? "Impound"
                              : "Garage"}
                    </div>
                </div>

                <!-- Image Removed as requested -->

                <div class="hero-bottom-info">
                    <div class="details-name">{SelectedVehicle.Label}</div>
                    <div class="details-plate">{SelectedVehicle.Plate}</div>
                    <div
                        style="font-size: 1.1vh; color: #aaa; margin-top: 0.5vh;"
                    >
                        <i class="fas fa-map-marker-alt"></i>
                        {SelectedVehicle.Garage}
                    </div>
                </div>
            </div>

            <!-- 2. Stats Grid -->
            <div class="details-stats-grid">
                <div class="stat-box">
                    <div class="gauge-bg"></div>
                    <div
                        class="gauge-ring"
                        style="--deg: {enginePerc *
                            3.6}deg; --fill-color: {getFillColor(enginePerc)}"
                    >
                        <i class="fas fa-engine stat-icon"></i>
                    </div>
                    <div class="stat-label">Engine</div>
                    <div class="stat-value">{enginePerc}%</div>
                </div>
                <div class="stat-box">
                    <div class="gauge-bg"></div>
                    <div
                        class="gauge-ring"
                        style="--deg: {fuelPerc *
                            3.6}deg; --fill-color: {getFillColor(fuelPerc)}"
                    >
                        <i class="fas fa-gas-pump stat-icon"></i>
                    </div>
                    <div class="stat-label">Fuel</div>
                    <div class="stat-value">{fuelPerc}%</div>
                </div>
                <div class="stat-box">
                    <div class="gauge-bg"></div>
                    <div
                        class="gauge-ring"
                        style="--deg: {bodyPerc *
                            3.6}deg; --fill-color: {getFillColor(bodyPerc)}"
                    >
                        <i class="fas fa-car-crash stat-icon"></i>
                    </div>
                    <div class="stat-label">Body</div>
                    <div class="stat-value">{bodyPerc}%</div>
                </div>
            </div>
        </div>

        <!-- FOOTER (Action Buttons) -->
        <div class="details-footer">
            <div class="details-actions-row">
                {#if SelectedVehicle.State === "Outside"}
                    <button
                        class="glass-btn primary"
                        on:click={() => TrackVehicle(SelectedVehicle)}
                    >
                        <i class="fas fa-location-arrow"></i> Track
                    </button>
                    <button
                        class="glass-btn secondary"
                        on:click={() => TransferVehicle(SelectedVehicle)}
                    >
                        <i class="fas fa-exchange-alt"></i> Transfer
                    </button>
                {:else if SelectedVehicle.State === "Inside" || SelectedVehicle.State === "Garage"}
                    <button
                        class="glass-btn primary"
                        on:click={() => TrackVehicle(SelectedVehicle)}
                    >
                        <i class="fas fa-location-arrow"></i> Set GPS
                    </button>
                    <button
                        class="glass-btn secondary"
                        on:click={() => TransferVehicle(SelectedVehicle)}
                    >
                        <i class="fas fa-exchange-alt"></i> Transfer
                    </button>
                {:else if SelectedVehicle.State === "Depot" || SelectedVehicle.State === "Impound"}
                    <button
                        class="glass-btn secondary"
                        disabled
                        style="opacity: 0.5;"
                    >
                        <i class="fas fa-lock"></i> Impounded
                    </button>
                {:else}
                    <button
                        class="glass-btn primary"
                        on:click={() => TrackVehicle(SelectedVehicle)}
                    >
                        <i class="fas fa-location-arrow"></i> Set GPS
                    </button>
                {/if}
            </div>
        </div>
    </div>
{:else}
    <!-- APP WRAPPER ONLY FOR LIST VIEW -->
    <AppWrapper>
        <div class="garage-app">
            <div class="garage-header">
                <i class="fas fa-chevron-left" style="opacity: 0;"></i>
                <div class="garage-header-title">My Garage</div>
                <i
                    class="fas fa-sync-alt garage-header-icon"
                    on:click={Initialize}
                ></i>
            </div>

            <div class="garage-tabs">
                {#each Tabs as tab}
                    <div
                        class="garage-tab {ActiveTab === tab ? 'active' : ''}"
                        on:click={() => SetTab(tab)}
                    >
                        {tab}
                    </div>
                {/each}
            </div>

            <div class="garage-search-container">
                <input
                    type="text"
                    class="garage-search-input"
                    placeholder="Search by name, plate..."
                    bind:value={SearchQuery}
                />
            </div>

            <div class="garage-vehicle-list">
                {#if FilteredVehicles.length > 0}
                    {#each FilteredVehicles as car}
                        <!-- INLINE VEHICLE CARD -->
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <div
                            class="vehicle-card"
                            on:click={() => SelectVehicle(car)}
                        >
                            <div class="vehicle-card-img-container">
                                <img
                                    src={getImage(car.Model)}
                                    alt={car.Label}
                                    class="vehicle-card-image"
                                    on:error={(e) =>
                                        (e.target.src =
                                            "nui://peak-ui/web/dist/images/pdm/adder.jpg")}
                                />
                            </div>

                            <div class="vehicle-card-content">
                                <div class="vehicle-card-header">
                                    <div>
                                        <div class="vehicle-card-name">
                                            {car.Label}
                                        </div>
                                        <div class="vehicle-card-plate">
                                            {car.Plate}
                                        </div>
                                    </div>
                                    <div
                                        class="vehicle-card-status {getStatusClass(
                                            car.State,
                                        )}"
                                    >
                                        {getStateLabel(car.State)}
                                    </div>
                                </div>

                                <div class="vehicle-card-footer">
                                    <div class="stat-pill">
                                        <i class="fas fa-gas-pump"></i>
                                        {Math.floor(car.Fuel)}%
                                    </div>
                                    <div class="stat-pill">
                                        <i class="fas fa-engine"></i>
                                        {Math.floor(car.Engine / 10)}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/each}
                {:else}
                    <div class="empty-state">
                        <i class="fas fa-car-side empty-icon"></i>
                        <div>No vehicles found</div>
                    </div>
                {/if}
            </div>
        </div>
    </AppWrapper>
{/if}

<style>
    /* Modern Clean Glass Styling */
    :root {
        --glass-bg: #050510;
        --glass-surface: rgba(255, 255, 255, 0.03);
        --glass-surface-hover: rgba(255, 255, 255, 0.08);
        --glass-border: rgba(255, 255, 255, 0.06);
        --glass-primary: #6366f1;
        /* Indigo - Clean & Premium */
        --glass-accent: #00f2ea;
        --glass-text: #ffffff;
        --glass-text-muted: #9ca3af;
        --glass-radius: 1.6vh;
    }

    .garage-app {
        width: 100%;
        height: 100%;
        background: radial-gradient(
            circle at top right,
            #1e1b4b 0%,
            #050510 50%
        );
        color: var(--glass-text);
        font-family: "Inter", sans-serif;
        /* Clean sans */
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
    }

    /* Header */
    .garage-header {
        flex-shrink: 0;
        height: 8vh;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 2.5vh;
        z-index: 2;
        margin-bottom: 0.5vh;
    }

    .garage-header-title {
        font-size: 2.2vh;
        font-weight: 700;
        letter-spacing: -0.05vh;
        background: linear-gradient(to right, #fff, #c7d2fe);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .garage-header-icon {
        font-size: 1.8vh;
        color: var(--glass-text-muted);
        cursor: pointer;
        transition: all 0.2s;
        background: rgba(255, 255, 255, 0.05);
        /* Softer bg */
        width: 3.5vh;
        height: 3.5vh;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 1px solid var(--glass-border);
    }

    .garage-header-icon:hover {
        background: var(--glass-surface-hover);
        color: #fff;
        transform: rotate(180deg);
    }

    /* Tabs */
    .garage-tabs {
        flex-shrink: 0;
        display: flex;
        gap: 0.8vh;
        /* Tighter gap */
        padding: 0 2.5vh 1vh 2.5vh;
        z-index: 2;
        overflow-x: auto;
        scrollbar-width: none;
        /* Hide scrollbar Firefox */
    }

    .garage-tabs::-webkit-scrollbar {
        display: none;
    }

    /* Hide scrollbar Chrome */

    .garage-tab {
        padding: 0.8vh 1.6vh;
        /* Reduced padding */
        font-size: 1.2vh;
        /* Smaller font */
        font-weight: 600;
        color: var(--glass-text-muted);
        cursor: pointer;
        border-radius: 0.8vh;
        /* Slightly less rounded, more button-like */
        transition: all 0.2s;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid transparent;
        white-space: nowrap;
        /* Prevent wrap */
        flex-shrink: 0;
        /* Prevent shrinking */
    }

    .garage-tab:hover {
        background: var(--glass-surface);
        color: var(--glass-text);
    }

    .garage-tab.active {
        background: var(--glass-primary);
        color: #fff;
        box-shadow: 0 0.5vh 1.5vh rgba(99, 102, 241, 0.25);
    }

    /* Search */
    .garage-search-container {
        flex-shrink: 0;
        padding: 1vh 3vh 2vh 3vh;
        z-index: 2;
    }

    .garage-search-input {
        width: 100%;
        background: var(--glass-surface);
        border: 1px solid var(--glass-border);
        padding: 1.4vh 2vh;
        border-radius: 1.2vh;
        color: var(--glass-text);
        font-family: inherit;
        font-size: 1.4vh;
        transition: all 0.2s;
    }

    .garage-search-input:focus {
        background: var(--glass-surface-hover);
        border-color: var(--glass-primary);
        outline: none;
    }

    /* Vehicle List */
    .garage-vehicle-list {
        flex: 1;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
        padding: 0 3vh 3vh 3vh;
        display: flex;
        flex-direction: column;
        gap: 1.8vh;
        z-index: 1;
    }

    .garage-vehicle-list::-webkit-scrollbar {
        display: none;
    }

    /* --- Card Styles (Modern Glass) --- */
    .vehicle-card {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        background: var(--glass-surface);
        border-radius: var(--glass-radius);
        overflow: hidden;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        border: 1px solid var(--glass-border);
    }

    .vehicle-card:hover {
        transform: translateY(-0.5vh);
        background: var(--glass-surface-hover);
        box-shadow: 0 1vh 4vh rgba(0, 0, 0, 0.2);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .vehicle-card-img-container {
        height: 16vh;
        width: 100%;
        position: relative;
        overflow: hidden;
    }

    .vehicle-card-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s ease;
    }

    .vehicle-card:hover .vehicle-card-image {
        transform: scale(1.05);
    }

    .vehicle-card-content {
        padding: 1.8vh;
    }

    .vehicle-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.8vh;
    }

    .vehicle-card-name {
        font-size: 1.8vh;
        font-weight: 600;
    }

    .vehicle-card-plate {
        font-size: 1.2vh;
        color: var(--glass-text-muted);
        font-family: monospace;
        background: rgba(0, 0, 0, 0.2);
        padding: 0.3vh 0.8vh;
        border-radius: 0.6vh;
    }

    .vehicle-card-status {
        font-size: 1.1vh;
        font-weight: 600;
        padding: 0.4vh 1vh;
        border-radius: 2vh;
    }

    .status-out {
        background: rgba(234, 179, 8, 0.15);
        color: #facc15;
    }

    .status-impound {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
    }

    .status-in {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
    }

    .vehicle-card-footer {
        display: flex;
        gap: 1.5vh;
        margin-top: 1vh;
    }

    .stat-pill {
        display: flex;
        align-items: center;
        gap: 0.6vh;
        font-size: 1.1vh;
        color: var(--glass-text-muted);
        background: rgba(255, 255, 255, 0.03);
        padding: 0.5vh 1vh;
        border-radius: 0.8vh;
    }

    /* --- Details View (Creative Clean) --- */
    .vehicle-details-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #050510;
        z-index: 20;
        display: flex;
        flex-direction: column;
        padding: 2vh;
        /* Reduced padding slightly */
        gap: 1.5vh;
        /* Reduced gap */
        overflow-y: hidden;
        box-sizing: border-box;
        /* Reduced gap */
        overflow-y: hidden;
        box-sizing: border-box;
        /* CRITICAL: Prevents padding from causing overflow */
    }

    .details-content-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1.5vh;
        overflow-y: auto;
    }

    /* Base Glass Panel */
    .glass-panel {
        background: var(--glass-surface);
        border-radius: 2vh;
        border: 1px solid var(--glass-border);
        padding: 2vh;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
    }

    /* 1. Hero Card: Combined Image & Header */
    .details-hero-card {
        flex: 0 0 auto;
        /* Takes available space */
        min-height: auto;
        /* Reduced min-height to allow more room */
        position: relative;
        overflow: hidden;
        padding: 2vh;
        background: radial-gradient(
                circle at center,
                rgba(30, 27, 75, 0.5) 0%,
                rgba(5, 5, 16, 0.8) 100%
            ),
            var(--glass-surface);
        display: flex;
        flex-direction: column;
    }

    .hero-top-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        z-index: 2;
        position: relative;
        flex-shrink: 0;
    }

    .back-btn-float {
        width: 4.5vh;
        height: 4.5vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: white;
        transition: all 0.2s;
    }

    .back-btn-float:hover {
        background: white;
        color: black;
    }

    .details-image-container {
        flex: 1;
        /* Allow container to grow/shrink in the flex space */
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
        margin: 1vh 0;
    }

    .details-img {
        max-width: 95%;
        max-height: 95%;
        object-fit: contain;
        filter: drop-shadow(0 2vh 4vh rgba(0, 0, 0, 0.6));
        transition: transform 0.5s ease-out;
    }

    .details-hero-card:hover .details-img {
        transform: scale(1.05);
    }

    .hero-info-overlay {
        z-index: 2;
        flex-shrink: 0;
    }

    .details-name {
        font-size: 3vh;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: -0.05vh;
        line-height: 1;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }

    .details-plate {
        font-size: 1.5vh;
        color: rgba(255, 255, 255, 0.7);
        font-family: monospace;
        font-weight: 600;
        margin-top: 0.5vh;
        background: rgba(0, 0, 0, 0.5);
        padding: 0.2vh 0.8vh;
        border-radius: 0.5vh;
        display: inline-block;
    }

    /* 2. Stats Grid */
    .details-stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 1.5vh;
        height: 14vh;
        flex-shrink: 0;
        /* Prevent stats from squishing */
    }

    .stat-box {
        background: var(--glass-surface);
        border: 1px solid var(--glass-border);
        border-radius: 1.5vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 1vh;
        position: relative;
        overflow: hidden;
        box-sizing: border-box;
    }

    /* Clean Gauge Ring */
    .gauge-ring {
        width: 5.5vh;
        height: 5.5vh;
        /* Slightly smaller */
        border-radius: 50%;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 0.8vh;
        background: conic-gradient(
            var(--fill-color) var(--deg),
            rgba(255, 255, 255, 0.05) 0deg
        );
        /* Inner cutout to make it a ring */
        mask: radial-gradient(transparent 55%, black 56%);
        -webkit-mask: radial-gradient(transparent 55%, black 56%);
    }

    /* Center circle background */
    .gauge-bg {
        position: absolute;
        width: 5.5vh;
        height: 5.5vh;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.2);
    }

    .stat-icon {
        font-size: 1.8vh;
        color: rgba(255, 255, 255, 0.8);
        z-index: 2;
    }

    .stat-label {
        font-size: 1.1vh;
        color: var(--glass-text-muted);
        font-weight: 600;
        text-transform: uppercase;
    }

    .stat-value {
        font-size: 1.3vh;
        font-weight: 700;
        margin-top: 0.3vh;
    }

    /* 3. Actions */
    .details-actions-row {
        display: flex;
        flex-direction: row;
        /* FORCE ROW */
        gap: 1.5vh;
        height: 6vh;
        /* Slight reduction to ensure fit */
        flex-shrink: 0;
        /* Prevent squishing */
        margin-top: 0;
        /* Flex gap handles spacing now */
    }

    .glass-btn {
        flex: 1;
        height: 100%;
        border-radius: 1.5vh;
        font-size: 1.5vh;
        font-weight: 700;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1vh;
        text-transform: uppercase;
        transition: all 0.2s;
    }

    .glass-btn.primary {
        background: linear-gradient(
            135deg,
            var(--glass-primary) 0%,
            #4f46e5 100%
        );
        color: white;
        box-shadow: 0 0.5vh 2vh rgba(99, 102, 241, 0.4);
    }

    .glass-btn.secondary {
        background: rgba(255, 255, 255, 0.08);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .glass-btn:hover {
        transform: translateY(-0.3vh);
        filter: brightness(1.2);
    }

    .glass-btn:active {
        transform: scale(0.98);
    }

    .details-empty-state {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--glass-text-muted);
    }

    /* Reuse progress bars from before */
    .progress-track {
        width: 100%;
        height: 0.8vh;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 1vh;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        border-radius: 1vh;
        background: var(--glass-primary);
        box-shadow: 0 0 1vh rgba(99, 102, 241, 0.4);
        transition: width 1s ease-out;
    }

    .progress-fill.warning {
        background: #eab308;
        box-shadow: 0 0 1vh rgba(234, 179, 8, 0.4);
    }

    .progress-fill.danger {
        background: #ef4444;
        box-shadow: 0 0 1vh rgba(239, 68, 68, 0.4);
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 30vh;
        color: var(--glass-text-muted);
    }

    .empty-icon {
        font-size: 5vh;
        opacity: 0.3;
        margin-bottom: 1.5vh;
    }
</style>
