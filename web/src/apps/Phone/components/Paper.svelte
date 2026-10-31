<script>
    export let Icon = false;
    export let Title = "";
    export let Description = "";
    export let DescriptionHtml = false;
    export let Aux = "";
    export let Notification = false;

    export let HasActions = false;
    export let HasDrawer = false;

    let ShowDrawer = false;
    const ToggleDrawer = (event) => {
        const PhoneCardDrawer = document.querySelector('.phone-card-drawer');
        if (event.target === PhoneCardDrawer || (PhoneCardDrawer && PhoneCardDrawer.contains(event.target))) return;
        ShowDrawer = !ShowDrawer;
    }
</script>

{#if !HasDrawer}
    <div class="phone-card-component" on:keyup on:click>
        {#if Notification}
            <div class="phone-card-notification phone-card-notification__{Notification}"></div>
        {/if}

        <div class="phone-card-container">
            {#if Icon}
                <div class="phone-card-icon">
                    <i class="fas fa-{Icon}" />
                </div>
            {/if}
            <div class="phone-card-details">
                <div class="phone-card-text">
                    {#if Array.isArray(Title)}
                        {#each Title as item}
                            <p>{item}</p>
                        {/each}
                    {:else}
                        <p>{Title}</p>
                    {/if}
                </div>
                <div class="phone-card-text">
                    {#if Array.isArray(Description)}
                        {#each Description as item}
                            {#if DescriptionHtml}
                                <p>{@html item}</p>
                            {:else}
                                <p>{item}</p>
                            {/if}
                        {/each}
                    {:else}
                        {#if DescriptionHtml}
                            <p>{@html Description}</p>
                        {:else}
                            <p>{Description}</p>
                        {/if}
                    {/if}
                </div>
                
            </div>
            {#if Aux}
                <div class="phone-car-details phone-card-details-aux">
                    <div class="phone-card-text">
                        <p>{Aux}</p>
                    </div>
                </div>
            {/if}

            {#if HasActions && $$slots.default}
                <div class="phone-card-actions">
                    <slot />
                    <!-- <i data-tooltip="Yeet" class="tooltip fas fa-user-slash" /> -->
                </div>
            {/if}
        </div>
    </div>
{:else}
    <div class="phone-card-component" on:keyup on:click={ToggleDrawer}>
        {#if Notification}
            <div class="phone-card-notification phone-card-notification__{Notification}"></div>
        {/if}

        <div class="phone-card-container">
            {#if Icon}
                <div class="phone-card-icon">
                    <i class="fas fa-{Icon}" />
                </div>
            {/if}
            <div class="phone-card-details">
                <div class="phone-card-text">
                    {#if Array.isArray(Title)}
                        {#each Title as item}
                            <p>{item}</p>
                        {/each}
                    {:else}
                        <p>{Title}</p>
                    {/if}
                </div>
                <div class="phone-card-text">
                    {#if Array.isArray(Description)}
                        {#each Description as item}
                            <p>{item}</p>
                        {/each}
                    {:else}
                        <p>{Description}</p>
                    {/if}
                </div>
                
            </div>
            {#if Aux}
                <div class="phone-car-details phone-card-details-aux">
                    <div class="phone-card-text">
                        <p>{Aux}</p>
                    </div>
                </div>
            {/if}

        </div>

        {#if ShowDrawer}
            <div class="phone-card-drawer">
                <slot />
            </div>
        {/if}
    </div>
{/if}

<style>
    :global(.phone-card-component) {
        position: relative;
        width: calc(100% - 1.6vh);
        background: rgba(40, 40, 50, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md);
        padding: 1.2vh;
        margin-bottom: 1vh;
        color: var(--color-text-primary);
        box-shadow: var(--shadow-sm);
        transition: all var(--transition-base);
        cursor: pointer;
        overflow: hidden;
    }

    :global(.phone-card-component::before) {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, 
            rgba(102, 126, 234, 0.1) 0%, 
            rgba(118, 75, 162, 0.05) 100%);
        opacity: 0;
        transition: opacity var(--transition-fast);
        pointer-events: none;
        z-index: 0;
    }

    :global(.phone-card-component:hover) {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.18);
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
    }

    :global(.phone-card-component:hover::before) {
        opacity: 1;
    }

    :global(.phone-card-component:active) {
        transform: translateY(0);
        transition: transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    :global(.phone-card-notification) {
        position: absolute;
        top: 1vh;
        right: 1vh;
        width: 0.8vh;
        height: 0.8vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: var(--radius-full);
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9),
                    0 2px 8px rgba(102, 126, 234, 0.5);
        z-index: 10;
        animation: pulse-notification 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    :global(.phone-card-notification__green) {
        background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9),
                    0 2px 8px rgba(34, 197, 94, 0.5);
    }

    :global(.phone-card-notification__red) {
        background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9),
                    0 2px 8px rgba(239, 68, 68, 0.5);
    }

    @keyframes pulse-notification {
        0%, 100% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.2);
            opacity: 0.8;
        }
    }

    :global(.phone-card-container) {
        display: flex;
        width: 100%;
        position: relative;
        z-index: 1;
    }

    :global(.phone-card-icon) {
        font-size: 4vh;
        width: 5.4vh;
        height: 4vh;
        margin-right: 1.2vh;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    :global(.phone-card-icon > i) {
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        transition: transform var(--transition-fast);
    }

    :global(.phone-card-component:hover .phone-card-icon > i) {
        transform: scale(1.1);
    }

    :global(.phone-card-details) {
        position: relative;
        display: flex;
        flex-direction: column;
        align-content: space-between;
        justify-content: space-between;
        flex: 1 1;
        overflow: hidden;
    }

    :global(.phone-card-details .phone-card-text) {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
    }

    :global(.phone-card-details .phone-card-text > p) {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        font-size: 1.4vh;
        letter-spacing: var(--letter-spacing-normal);
        text-overflow: ellipsis;
        overflow: hidden;
        font-weight: var(--font-weight-normal);
    }

    :global(.phone-card-details .phone-card-text:first-child > p) {
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
    }

    :global(.phone-card-details .phone-card-text:not(:first-child) > p) {
        color: var(--color-text-secondary);
        font-size: 1.3vh;
    }

    :global(.phone-card-details-aux) {
        display: flex;
        align-items: center;
        font-size: 1.4vh;
        letter-spacing: -0.035vh;
    }

    :global(.phone-card-actions) {
        display: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.92);
        justify-content: center;
        align-items: center;
        border-radius: var(--radius-md);
        z-index: 20;
        opacity: 0;
        transition: opacity var(--transition-fast);
    }

    :global(.phone-card-component:hover .phone-card-actions) {
        display: flex;
        opacity: 1;
    }

    :global(.phone-card-actions > i) {
        color: #e0e0e0;
        margin: 0.8vh 0.8vh 0;
        font-size: 1.8vh;
        cursor: pointer;
        padding: 0.8vh;
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
    }

    :global(.phone-card-actions > i *) {
        pointer-events: none;
    }

    :global(.phone-card-actions > i:hover) {
        color: var(--color-primary);
        background: rgba(255, 255, 255, 0.1);
        transform: scale(1.15);
    }

    :global(.phone-card-actions > i:active) {
        transform: scale(0.95);
        transition: transform 80ms;
    }

    :global(.phone-card-drawer) {
        display: flex;
        flex-direction: column;
        padding: 1vh 1.2vh 0;
        color: var(--color-text-secondary);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        margin-top: 1vh;
        animation: slideDown 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    :global(.phone-card-drawer-item) {
        padding: 0.8vh 0;
        display: flex;
        align-items: center;
        margin-bottom: 0.6vh;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 1.4vh;
        transition: color var(--transition-fast);
        cursor: pointer;
    }

    :global(.phone-card-drawer-item:hover) {
        color: var(--color-text-primary);
    }

    :global(.phone-card-drawer-item:last-child) {
        border-bottom: none;
        margin-bottom: 0;
    }

    :global(.phone-card-drawer-item > i) {
        width: 2vh;
        margin-right: 1vh;
        text-align: center;
        font-size: 1.6vh;
        color: var(--color-text-tertiary);
    }
</style>
