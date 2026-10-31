<script>
    import { onMount } from "svelte";
    import { fade, fly } from "svelte/transition";
    import { LicensesLocale } from "../../../config";
    import { FormatCurrency, SendEvent } from "../../../utils/Utils";
    import { PlayerData, ProfilePicture } from "../phone.stores";

    import AppWrapper from "../components/AppWrapper.svelte";

    let MyLicenses = {};
    let isCopied = null;

    onMount(() => {
        SendEvent("Details/GetLicenses", {}, (Success, Data) => {
            if (!Success) return;
            if (Data && typeof Data === "object") {
                MyLicenses = Data;
            } else {
                MyLicenses = {};
            }
        });
    });

    const copyToClipboard = (text, label) => {
        if (!text) return;
        const el = document.createElement("textarea");
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);

        isCopied = label;
        setTimeout(() => {
            isCopied = null;
        }, 2000);
    };

    const getLicenseIcon = (type) => {
        switch (type) {
            case "driver":
                return "fas fa-car";
            case "handgun":
                return "fas fa-pistol";
            case "heavy_weapon":
                return "fas fa-gun";
            case "hunting":
                return "fas fa-crosshairs";
            case "fishing":
                return "fas fa-fish";
            case "flying":
                return "fas fa-plane";
            case "business":
                return "fas fa-briefcase";
            default:
                return "fas fa-id-card";
        }
    };
</script>

<AppWrapper>
    <div class="app-container" in:fade={{ duration: 300 }}>
        <!-- Profile Header -->
        <div
            class="profile-header"
            in:fly={{ y: 20, duration: 400, delay: 100 }}
        >
            <div class="profile-image-container">
                {#if $ProfilePicture}
                    <img
                        src={$ProfilePicture}
                        alt="Profile"
                        class="profile-img"
                    />
                {:else}
                    <div class="profile-placeholder">
                        <i class="fas fa-user"></i>
                    </div>
                {/if}
                <div class="status-indicator online"></div>
            </div>
            <div class="profile-info">
                <h1 class="player-name">
                    {$PlayerData?.CharName || "Unknown Citizen"}
                </h1>
                <div
                    class="citizen-id-badge"
                    on:click={() => copyToClipboard($PlayerData?.Cid, "cid")}
                >
                    <span class="badget-label">ID:</span>
                    <span class="badge-value">{$PlayerData?.Cid}</span>
                    <i
                        class="fas fa-{isCopied === 'cid'
                            ? 'check'
                            : 'copy'} copy-icon"
                    ></i>
                </div>
            </div>
        </div>

        <!-- Quick Stats Grid -->
        <div class="stats-grid" in:fly={{ y: 20, duration: 400, delay: 200 }}>
            <div
                class="stat-card mobile"
                on:click={() =>
                    copyToClipboard($PlayerData?.PhoneNumber, "phone")}
            >
                <div class="stat-icon-wrapper blue">
                    <i class="fas fa-mobile-alt"></i>
                </div>
                <div class="stat-content">
                    <span class="stat-label">Phone Number</span>
                    <span class="stat-value">{$PlayerData?.PhoneNumber}</span>
                </div>
                <div class="copy-feedback">
                    <i class="fas fa-{isCopied === 'phone' ? 'check' : 'copy'}"
                    ></i>
                </div>
            </div>

            <div
                class="stat-card bank"
                on:click={() => copyToClipboard($PlayerData?.BankId, "bank")}
            >
                <div class="stat-icon-wrapper purple">
                    <i class="fas fa-university"></i>
                </div>
                <div class="stat-content">
                    <span class="stat-label">Account No.</span>
                    <span class="stat-value">{$PlayerData?.BankId}</span>
                </div>
                <div class="copy-feedback">
                    <i class="fas fa-{isCopied === 'bank' ? 'check' : 'copy'}"
                    ></i>
                </div>
            </div>
        </div>

        <!-- Wallet Section -->
        <div
            class="section-container"
            in:fly={{ y: 20, duration: 400, delay: 300 }}
        >
            <div class="section-header">
                <h2>Wallet</h2>
                <div class="header-line"></div>
            </div>

            <div class="wallet-cards">
                <div class="wallet-card cash-card">
                    <div class="card-bg-icon">
                        <i class="fas fa-money-bill-wave"></i>
                    </div>
                    <div class="card-content">
                        <span class="wallet-label">Cash Balance</span>
                        <span class="wallet-amount"
                            >{FormatCurrency.format($PlayerData?.Cash)}</span
                        >
                    </div>
                </div>

                <div class="wallet-card bank-card">
                    <div class="card-bg-icon">
                        <i class="fas fa-credit-card"></i>
                    </div>
                    <div class="card-content">
                        <span class="wallet-label">Bank Savings</span>
                        <span class="wallet-amount"
                            >{FormatCurrency.format($PlayerData?.Bank)}</span
                        >
                    </div>
                    <div class="card-chip">
                        <i class="fas fa-microchip"></i>
                    </div>
                </div>

                {#if $PlayerData?.Casino > 0}
                    <div class="wallet-card casino-card">
                        <div class="card-bg-icon">
                            <i class="fas fa-dice"></i>
                        </div>
                        <div class="card-content">
                            <span class="wallet-label">Casino Chips</span>
                            <span class="wallet-amount"
                                >{FormatCurrency.format(
                                    $PlayerData?.Casino,
                                )}</span
                            >
                        </div>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Licenses Section -->
        <div
            class="section-container"
            in:fly={{ y: 20, duration: 400, delay: 400 }}
        >
            <div class="section-header">
                <h2>Licenses</h2>
                <div class="header-line"></div>
            </div>

            <div class="licenses-grid">
                {#each Object.entries(LicensesLocale) as [Type, Label]}
                    <div
                        class="license-item {MyLicenses && MyLicenses[Type]
                            ? 'active'
                            : 'inactive'}"
                    >
                        <div class="license-icon">
                            <i class={getLicenseIcon(Type)}></i>
                        </div>
                        <div class="license-details">
                            <span class="license-name">{Label}</span>
                            <span class="license-status-text">
                                {MyLicenses && MyLicenses[Type]
                                    ? "VALID"
                                    : "REVOKED"}
                            </span>
                        </div>
                        <div class="license-indicator">
                            <i
                                class="fas fa-{MyLicenses && MyLicenses[Type]
                                    ? 'check-circle'
                                    : 'ban'}"
                            ></i>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <div class="spacer"></div>
    </div>
</AppWrapper>

<style>
    @import url("https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap");

    .app-container {
        height: 100%;
        width: 100%;
        padding: 3vh 2vh;
        overflow-y: auto;
        font-family: "Outfit", sans-serif;
        background: linear-gradient(
            180deg,
            rgba(8, 12, 19, 0.95) 0%,
            rgba(17, 24, 39, 0.98) 100%
        );
        display: flex;
        flex-direction: column;
        gap: 3vh;
        color: white;
    }

    .app-container::-webkit-scrollbar {
        width: 0;
        background: transparent;
    }

    /* Profile Header */
    .profile-header {
        display: flex;
        align-items: center;
        gap: 2vh;
        padding-bottom: 2vh;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .profile-image-container {
        position: relative;
        width: 8vh;
        height: 8vh;
    }

    .profile-img {
        width: 100%;
        height: 100%;
        border-radius: 2.5vh;
        object-fit: cover;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        border: 2px solid rgba(255, 255, 255, 0.1);
    }

    .profile-placeholder {
        width: 100%;
        height: 100%;
        border-radius: 2.5vh;
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3vh;
        color: white;
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    }

    .status-indicator {
        position: absolute;
        bottom: -0.2vh;
        right: -0.2vh;
        width: 2.2vh;
        height: 2.2vh;
        background: #10b981;
        border: 0.3vh solid #111827;
        border-radius: 50%;
    }

    .profile-info {
        display: flex;
        flex-direction: column;
        gap: 0.5vh;
    }

    .player-name {
        font-size: 2.2vh;
        font-weight: 700;
        margin: 0;
        letter-spacing: -0.05vh;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }

    .citizen-id-badge {
        display: inline-flex;
        align-items: center;
        gap: 1vh;
        background: rgba(255, 255, 255, 0.08);
        padding: 0.6vh 1.2vh;
        border-radius: 1vh;
        font-size: 1.3vh;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .citizen-id-badge:active {
        transform: scale(0.95);
        background: rgba(255, 255, 255, 0.15);
    }

    .badge-value {
        font-family: "Courier New", monospace;
        font-weight: 700;
        letter-spacing: 0.1vh;
        color: #e2e8f0;
    }

    .copy-icon {
        font-size: 1.1vh;
        color: rgba(255, 255, 255, 0.5);
    }

    /* Stats Grid */
    .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5vh;
    }

    .stat-card {
        background: rgba(31, 41, 55, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 2vh;
        padding: 1.5vh;
        display: flex;
        flex-direction: column;
        gap: 1vh;
        position: relative;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .stat-card:active {
        transform: scale(0.98);
        background: rgba(31, 41, 55, 0.8);
    }

    .stat-icon-wrapper {
        width: 3.5vh;
        height: 3.5vh;
        border-radius: 1vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5vh;
    }

    .stat-icon-wrapper.blue {
        background: rgba(59, 130, 246, 0.2);
        color: #60a5fa;
    }
    .stat-icon-wrapper.purple {
        background: rgba(139, 92, 246, 0.2);
        color: #a78bfa;
    }

    .stat-content {
        display: flex;
        flex-direction: column;
    }

    .stat-label {
        font-size: 1.1vh;
        color: rgba(156, 163, 175, 1);
        font-weight: 500;
    }

    .stat-value {
        font-size: 1.4vh;
        font-weight: 600;
        color: white;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .copy-feedback {
        position: absolute;
        top: 1.5vh;
        right: 1.5vh;
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.3);
    }

    /* Section Headers */
    .section-header {
        display: flex;
        align-items: center;
        gap: 1.5vh;
        margin-bottom: 1.5vh;
    }

    .section-header h2 {
        font-size: 1.6vh;
        font-weight: 600;
        margin: 0;
        color: rgba(255, 255, 255, 0.9);
        letter-spacing: 0.05vh;
    }

    .header-line {
        flex: 1;
        height: 1px;
        background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.1) 0%,
            transparent 100%
        );
    }

    /* Wallet Stats */
    .wallet-cards {
        display: flex;
        flex-direction: column;
        gap: 1.2vh;
    }

    .wallet-card {
        padding: 2vh;
        border-radius: 2vh;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }

    .cash-card {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
    }

    .bank-card {
        background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
    }

    .casino-card {
        background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
    }

    .card-bg-icon {
        position: absolute;
        right: -1vh;
        bottom: -2vh;
        font-size: 8vh;
        color: rgba(255, 255, 255, 0.1);
        transform: rotate(-15deg);
        pointer-events: none;
    }

    .card-content {
        display: flex;
        flex-direction: column;
        z-index: 1;
    }

    .wallet-label {
        font-size: 1.2vh;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.7);
        text-transform: uppercase;
        letter-spacing: 0.1vh;
    }

    .wallet-amount {
        font-size: 2.6vh;
        font-weight: 700;
        color: white;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        font-family: "Outfit", sans-serif;
    }

    .card-chip {
        position: absolute;
        top: 2vh;
        right: 2vh;
        color: rgba(255, 255, 255, 0.4);
        font-size: 2.5vh;
    }

    /* Licenses Grid */
    .licenses-grid {
        display: flex;
        flex-direction: column;
        gap: 1vh;
    }

    .license-item {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1.5vh;
        padding: 1.2vh 2vh;
        display: flex;
        align-items: center;
        gap: 2vh;
        transition: all 0.3s ease;
    }

    .license-item.active {
        background: linear-gradient(
            90deg,
            rgba(16, 185, 129, 0.1) 0%,
            transparent 100%
        );
        border-left: 0.4vh solid #10b981;
    }

    .license-item.inactive {
        background: linear-gradient(
            90deg,
            rgba(239, 68, 68, 0.05) 0%,
            transparent 100%
        );
        border-left: 0.4vh solid #ef4444;
        opacity: 0.8;
    }

    .license-icon {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5vh;
        color: rgba(255, 255, 255, 0.7);
    }

    .active .license-icon {
        background: rgba(16, 185, 129, 0.2);
        color: #34d399;
    }

    .inactive .license-icon {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
    }

    .license-details {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .license-name {
        font-size: 1.4vh;
        font-weight: 500;
        color: #f3f4f6;
    }

    .license-status-text {
        font-size: 1vh;
        font-weight: 600;
        letter-spacing: 0.1vh;
        margin-top: 0.2vh;
    }

    .active .license-status-text {
        color: #34d399;
    }
    .inactive .license-status-text {
        color: #f87171;
    }

    .license-indicator {
        font-size: 2vh;
    }

    .active .license-indicator {
        color: #34d399;
    }
    .inactive .license-indicator {
        color: #f87171;
    }

    .spacer {
        min-height: 4vh;
    }
</style>
