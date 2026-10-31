<script>
    import { clickOutside } from "../../utils/ClickOutside";
    import { SetDropdown } from "../../utils/Utils";

    import { onMount, onDestroy, afterUpdate } from "svelte";
    import { createEventDispatcher } from "svelte";

    export var Value = "";
    export var Options = [];
    export var Positioning = {};

    const Dispatch = createEventDispatcher();

    let DropdownContainer;
    let WindowHeight;
    let WindowWidth;
    let MaxTop;
    let DropdownContainerHeight = 0;

    function handleDropdown() {
        if (!DropdownContainer) return;

        Dispatch("dropdownClosed");
        MaxTop = WindowHeight - DropdownContainerHeight - 25;

        const dropdownWidth = DropdownContainer.offsetWidth;
        const MaxLeft = WindowWidth - dropdownWidth - 25;

        if (Positioning?.Top > MaxTop) {
            DropdownContainer.style.setProperty("top", `${MaxTop}px`);
        } else {
            DropdownContainer.style.setProperty("top", `${Positioning?.Top}px`);
        }
        
        if (Positioning?.Left > MaxLeft) {
            DropdownContainer.style.setProperty("left", `${MaxLeft}px`);
        } else {
            DropdownContainer.style.setProperty("left", `${Positioning?.Left}px`);
        }
    }

    function handleOptionsUpdate() {
        if (!DropdownContainer) return;
        DropdownContainerHeight = DropdownContainer.offsetHeight;
        MaxTop = WindowHeight - DropdownContainerHeight - 25;
        handleDropdown();
    }

    onMount(() => {
        WindowHeight = window.innerHeight;
        WindowWidth = window.innerWidth;
        handleOptionsUpdate();
    });

    afterUpdate(() => {
        handleOptionsUpdate();
    });

    onDestroy(() => {
        DropdownContainer = null;
    });

    $: {
        handleDropdown();
    }
</script>

<div
    use:clickOutside
    on:clickOutside={() => {
        SetDropdown(false);
    }}
    class="dropdown-container"
    style="width: {Positioning?.Width}; top: {Positioning?.Top}px; left: {Positioning?.Left}px; pointer-events: all;"
    bind:this={DropdownContainer}
>
    {#each Options as Data, Key}
        <div
            on:keyup
            on:click={(e) => {
                Value = Data.Value;
                if (Data.Cb) {
                    if (Data.ValueIsReal) {
                        Data.Cb(Data.Value, Data.Value);
                    } else {
                        Data.Cb(Data.Value || Data.Text, Data.Text);
                    }
                    SetDropdown(false);
                }
            }}
            class="dropdown-option"
        >
            {#if Data.Icon}
                <i class="fas fa-{Data.Icon}" />
            {/if}
            {Data.Text}
        </div>
    {/each}
</div>

<style>
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-0.5vh) scale(0.98);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    .dropdown-container {
        position: fixed;

        user-select: none;

        min-width: 10vh;
        height: max-content;
        max-height: 50vh;

        margin-top: 1vh;

        z-index: 99999;

        overflow-y: auto;

        padding: 0.6vh;

        border-radius: var(--radius-lg);

        background: rgba(28, 28, 36, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
                    0 4px 16px rgba(0, 0, 0, 0.2);

        animation: slideDown 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .dropdown-container::-webkit-scrollbar {
        width: 0.5vh;
    }

    .dropdown-container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: var(--radius-sm);
    }

    .dropdown-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: var(--radius-sm);
        transition: background var(--transition-fast);
    }

    .dropdown-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    .dropdown-option {
        height: max-content;
        min-height: 3.2vh;
        line-height: 1.5;

        padding: 0.8vh 1.2vh;

        cursor: pointer;

        font-family: Roboto, Helvetica, Arial, sans-serif;
        font-weight: var(--font-weight-normal);
        font-size: 1.4vh;

        color: var(--color-text-primary);
        letter-spacing: var(--letter-spacing-normal);

        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;

        border-radius: var(--radius-md);
        transition: all var(--transition-fast);

        display: flex;
        align-items: center;
        gap: 0.8vh;
    }

    .dropdown-option > i {
        font-size: 1.5vh;
        color: var(--color-text-secondary);
        transition: color var(--transition-fast);
    }

    .dropdown-option:hover {
        background: linear-gradient(135deg, 
            rgba(74, 222, 128, 0.18) 0%, 
            rgba(22, 163, 74, 0.18) 100%);
        color: white;
        transform: translateX(2px);
    }

    .dropdown-option:hover > i {
        color: var(--color-primary);
    }

    .dropdown-option:active {
        transform: scale(0.98);
        transition: transform 80ms;
    }
</style>
