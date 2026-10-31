<script>
    import { fade } from "svelte/transition";
    import TextField from "../../../components/TextField/TextField.svelte";

    export let showBack = false;
    export let onBack = null;
    export let title = "";
    export let showSearch = false;
    export let searchPlaceholder = "Search";
    export let onSearch = null;
    export let actions = []; // Array of { icon: 'icon-name', tooltip: 'Tooltip', onClick: function }
</script>

<div class="phone-app-header" in:fade={{ duration: 250 }}>
    {#if showBack}
        <div class="phone-app-header-back">
            <i
                data-tooltip="Back"
                data-position="right"
                class="fas fa-arrow-left"
                on:keyup
                on:click={onBack}
            />
        </div>
    {/if}

    <div class="phone-app-header-center">
        {#if showSearch}
            <TextField
                Title={searchPlaceholder}
                Icon="search"
                SubSet={onSearch}
                class="phone-app-header-search"
            />
        {:else if title}
            <h3 class="phone-app-header-title">{title}</h3>
        {/if}
    </div>

    {#if actions.length > 0}
        <div class="phone-app-header-actions">
            {#each actions as action}
                <i
                    data-tooltip={action.tooltip}
                    data-position="left"
                    class="fas fa-{action.icon}"
                    on:keyup
                    on:click={action.onClick}
                />
            {/each}
        </div>
    {/if}
</div>

<style>
    .phone-app-header {
        position: absolute;
        top: 3.5vh;
        left: 0;
        right: 0;
        width: 90%;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 20;
        min-height: 3.5vh;
        gap: 1.5vh;
    }

    .phone-app-header-back {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .phone-app-header-back > i {
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all var(--transition-fast);
        padding: 0.8vh;
        border-radius: var(--radius-sm);
        font-size: 2vh;
    }

    .phone-app-header-back > i:hover {
        color: var(--color-primary);
        background: rgba(255, 255, 255, 0.1);
        transform: translateX(-2px);
    }

    .phone-app-header-back > i:active {
        transform: translateX(1px);
        transition: transform 80ms;
    }

    .phone-app-header-center {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
    }

    .phone-app-header-title {
        margin: 0;
        font-size: 2.2vh;
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    :global(.phone-app-header-search) {
        width: 100%;
    }

    .phone-app-header-actions {
        display: flex;
        align-items: center;
        gap: 1.1vh;
        flex-shrink: 0;
    }

    .phone-app-header-actions > i {
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all var(--transition-fast);
        padding: 0.8vh;
        border-radius: var(--radius-sm);
        font-size: 2vh;
    }

    .phone-app-header-actions > i:hover {
        color: var(--color-primary);
        background: rgba(255, 255, 255, 0.1);
        transform: scale(1.1);
    }

    .phone-app-header-actions > i:active {
        transform: scale(0.95);
        transition: transform 80ms;
    }
</style>

