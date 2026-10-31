<script>
    import { AvailableApps } from "../available_apps";
    import { InstalledApps } from "../phone.stores";
    import { SendEvent, IsEnvBrowser } from "../../../utils/Utils";
    import { fade } from "svelte/transition";

    let SearchQuery = "";

    $: FilteredApps = AvailableApps.filter(
        (app) =>
            app.name.toLowerCase().includes(SearchQuery.toLowerCase()) ||
            app.description.toLowerCase().includes(SearchQuery.toLowerCase()),
    );

    const InstallApp = (AppId) => {
        if (IsEnvBrowser()) {
            console.log("Mock Installing: " + AppId);
            InstalledApps.update((n) => {
                n[AppId] = true;
                return n;
            });
            return;
        }
        SendEvent("InstallApp", { AppId });
    };

    const UninstallApp = (AppId) => {
        if (IsEnvBrowser()) {
            console.log("Mock Uninstalling: " + AppId);
            InstalledApps.update((n) => {
                let newApps = { ...n };
                delete newApps[AppId];
                return newApps;
            });
            return;
        }
        SendEvent("UninstallApp", { AppId });
    };
</script>

<div class="app-store-container" in:fade={{ duration: 150 }}>
    <div class="header">
        <div class="title">App Store</div>
        <input
            type="text"
            placeholder="Search apps..."
            bind:value={SearchQuery}
        />
    </div>

    <div class="apps-list">
        {#each FilteredApps as app}
            <div class="app-item">
                <img src={app.image} alt={app.name} class="app-icon" />
                <div class="app-info">
                    <div class="app-name">{app.name}</div>
                    <div class="app-desc">{app.description}</div>
                </div>
                <div class="app-action">
                    {#if $InstalledApps[app.id]}
                        <button
                            class="btn-uninstall"
                            on:click={() => UninstallApp(app.id)}>REMOVE</button
                        >
                    {:else}
                        <button
                            class="btn-get"
                            on:click={() => InstallApp(app.id)}>GET</button
                        >
                    {/if}
                </div>
            </div>
        {/each}
        {#if FilteredApps.length === 0}
            <div class="no-results">No apps found.</div>
        {/if}
    </div>
</div>

<style>
    .app-store-container {
        width: 100%;
        height: 100%;
        background: rgba(22, 22, 30, 0.97); /* Dark premium bg */
        display: flex;
        flex-direction: column;
        color: white;
        padding: 3vh 2vh;
        box-sizing: border-box;
        overflow: hidden;
    }

    /* Header */
    .header {
        margin-bottom: 2vh;
        flex-shrink: 0;
    }
    .title {
        font-size: 3vh;
        font-weight: 800;
        margin-bottom: 1.5vh;
        background: linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: -0.05vh;
    }
    input {
        width: 100%;
        padding: 1.5vh;
        border-radius: 1.2vh;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.05);
        color: white;
        font-size: 1.6vh;
        outline: none;
        box-sizing: border-box;
        transition: all 0.2s ease;
    }
    input:focus {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.3);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.05);
    }
    input::placeholder {
        color: rgba(255, 255, 255, 0.3);
    }

    /* Apps List */
    .apps-list {
        flex: 1;
        overflow-y: scroll; /* Force show scroll context */
        padding-right: 0.5vh;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }
    .apps-list::-webkit-scrollbar {
        width: 0.4vh;
    }
    .apps-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 0.2vh;
    }

    .app-item {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1.8vh;
        padding: 1.5vh;
        margin-bottom: 1.5vh;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .app-item:hover {
        background: rgba(255, 255, 255, 0.08);
        transform: translateY(-2px) scale(1.01);
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        border-color: rgba(255, 255, 255, 0.1);
    }

    .app-icon {
        width: 6.5vh;
        height: 6.5vh;
        border-radius: 1.5vh; /* Squircle matching phone theme */
        object-fit: cover;
        margin-right: 2vh;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
        background: #000;
    }

    .app-info {
        flex: 1;
        min-width: 0; /* Text truncation fix */
        padding-right: 1vh;
    }
    .app-name {
        font-size: 1.8vh;
        font-weight: 600;
        margin-bottom: 0.5vh;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .app-desc {
        font-size: 1.3vh;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .app-action {
        display: flex;
        flex-shrink: 0;
    }

    .app-action button {
        padding: 0.8vh 2.5vh;
        border-radius: 2vh;
        border: none;
        font-size: 1.4vh;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        text-transform: uppercase;
        letter-spacing: 0.05vh;
    }

    .btn-get {
        background: rgba(50, 50, 60, 0.95);
        color: #fff;
    }
    .btn-get:hover {
        background: rgba(255, 255, 255, 0.35);
        transform: scale(1.05);
        box-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
    }

    .btn-uninstall {
        background: rgba(255, 59, 48, 0.15); /* Red tinted */
        color: #ff3b30;
    }
    .btn-uninstall:hover {
        background: rgba(255, 59, 48, 0.25);
    }

    .no-results {
        text-align: center;
        color: rgba(255, 255, 255, 0.4);
        margin-top: 5vh;
        font-size: 1.5vh;
    }
</style>
