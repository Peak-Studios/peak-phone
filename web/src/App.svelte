<script>
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import Dropdown from './components/Dropdown/Dropdown.svelte';
    import AppProvider from './providers/AppProvider.svelte';
    import { DropdownData, ImageHoverData, Tax } from './stores';
    import { IsEnvBrowser, OnEvent, SendEvent } from './utils/Utils';

    onMount(() => {
        if (!IsEnvBrowser()) return;
        document.body.style.background = 'gray';
    });

    OnEvent("SetTax", (Data) => {
        Tax.set(Data.Tax);
    })

    // Camera overlay state
    let CameraOverlayVisible = false;
    let CameraIsSelfie = true;

    OnEvent("ShowCameraOverlay", (Data) => {
        CameraOverlayVisible = Data.Visible;
        if (Data.IsSelfie !== undefined) {
            CameraIsSelfie = Data.IsSelfie;
        }
    });

    const FlipCamera = () => {
        SendEvent("Phone/FlipCamera", {}, (Success, Data) => {});
    };

    const CapturePhoto = () => {
        SendEvent("Phone/CapturePhoto", {}, (Success, Data) => {});
    };

    const ExitCamera = () => {
        SendEvent("Phone/ExitCamera", {}, (Success, Data) => {
            CameraOverlayVisible = false;
        });
    };
</script>

{#if !(window).GetParentResourceName || (window).GetParentResourceName() == "peak-phone"}
    {#if $ImageHoverData.Show}
        <div style="position: absolute; top: {$ImageHoverData.Top}px; left: {$ImageHoverData.Left}px; z-index: 999; pointer-events: none;">
            <img alt="" src="{$ImageHoverData.Source}" style="max-width: {$ImageHoverData.MaxWidth}%; height: auto"/>
        </div>
    {/if}

    {#if $DropdownData.Show}
        <Dropdown Options={$DropdownData.Options} Positioning={{
            Width: $DropdownData.Positioning?.Width,
            Top: $DropdownData.Positioning?.Top,
            Left: $DropdownData.Positioning?.Left
        }}/>
    {/if}

    <div class="root">
        <AppProvider />
    </div>

    {#if CameraOverlayVisible}
        <div class="camera-overlay" transition:fade={{ duration: 150 }}>
            <div class="camera-overlay-bar">
                <button class="camera-btn camera-btn-exit" on:click={ExitCamera}>
                    <i class="fas fa-times"></i>
                </button>
                <button class="camera-btn camera-btn-capture" on:click={CapturePhoto}>
                    <div class="capture-circle"></div>
                </button>
                <button class="camera-btn camera-btn-flip" on:click={FlipCamera}>
                    <i class="fas fa-sync-alt"></i>
                    <span class="camera-btn-label">{CameraIsSelfie ? 'Front' : 'Rear'}</span>
                </button>
            </div>
        </div>
    {/if}
{:else}
    <h6 style="width: 100%; text-align: center; font-size: 40vh; font-family: Roboto; color: red;">loser</h6>
{/if}

<style>
    :global(html, body) {
        cursor: url("nui://peak-cursor/cursor.png") 0 0, auto !important;
    }

    :global(a, button, [role="button"], .pointer, .cursor-pointer, [style*="cursor: pointer"]) {
        cursor: url("nui://peak-cursor/pointer.png") 0 0, pointer !important;
    }

    .camera-overlay {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        pointer-events: none;
    }

    .camera-overlay-bar {
        display: flex;
        align-items: center;
        justify-content: space-around;
        padding: 2vh 4vw 3vh 4vw;
        pointer-events: auto;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
    }

    .camera-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: none;
        background: none;
        color: white;
        cursor: pointer;
        font-size: 2.2vh;
        padding: 0.8vh;
        border-radius: 50%;
        transition: all 0.15s ease;
        text-shadow: 0 0.1vh 0.3vh rgba(0, 0, 0, 0.6);
    }

    .camera-btn:hover {
        transform: scale(1.15);
    }

    .camera-btn:active {
        transform: scale(0.95);
    }

    .camera-btn-exit {
        width: 5vh;
        height: 5vh;
        background: rgba(255, 255, 255, 0.15);
        font-size: 2vh;
    }

    .camera-btn-capture {
        width: 7vh;
        height: 7vh;
        border: 0.3vh solid white;
        border-radius: 50%;
        padding: 0;
    }

    .capture-circle {
        width: 5.5vh;
        height: 5.5vh;
        background: white;
        border-radius: 50%;
        transition: all 0.15s ease;
    }

    .camera-btn-capture:hover .capture-circle {
        background: rgba(255, 255, 255, 0.85);
    }

    .camera-btn-capture:active .capture-circle {
        transform: scale(0.9);
        background: rgba(255, 255, 255, 0.7);
    }

    .camera-btn-flip {
        width: 5vh;
        height: 5vh;
        background: rgba(255, 255, 255, 0.15);
        font-size: 1.8vh;
    }

    .camera-btn-label {
        font-size: 0.9vh;
        margin-top: 0.2vh;
        font-family: 'Roboto', sans-serif;
        letter-spacing: 0.05vh;
        text-transform: uppercase;
    }
</style>