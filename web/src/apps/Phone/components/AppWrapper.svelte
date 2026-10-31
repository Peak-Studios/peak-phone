<script>
    import { fade } from "svelte/transition";
</script>

<div
    {...$$restProps}
    in:fade={{ duration: 250 }}
    class="phone-app-wrapper {$$restProps?.class}"
>
    <slot />
</div>

<style>
    .phone-app-wrapper {
        color: white;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
            180deg,
            rgba(26, 29, 41, 0.95) 0%,
            rgba(15, 17, 23, 0.98) 100%
        );
        overflow: hidden;
    }

    .phone-app-wrapper::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: radial-gradient(
                circle at 20% 30%,
                rgba(102, 126, 234, 0.15) 0%,
                transparent 50%
            ),
            radial-gradient(
                circle at 80% 70%,
                rgba(118, 75, 162, 0.1) 0%,
                transparent 50%
            );
        pointer-events: none;
        z-index: 0;
    }

    .phone-app-wrapper::after {
        content: "";
        position: absolute;
        inset: 0;
        background-image: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(255, 255, 255, 0.03) 2px,
            rgba(255, 255, 255, 0.03) 4px
        );
        pointer-events: none;
        z-index: 0;
        opacity: 0.5;
    }

    .phone-app-wrapper > :global(*) {
        position: relative;
        z-index: 1;
    }
</style>
