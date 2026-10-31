<script>
    import Android from "./Brands/Android.svelte"
    import Iphone from "./Brands/Iphone.svelte"
    import Notifications from "./Notifications.svelte";
    import { Brand } from "./phone.stores";

    export let backgroundOverride = false;
</script>

<div {...$$restProps} class="phone-container {$$restProps.class}">
    {#if $Brand == 'Android'}
        <Android {backgroundOverride}>
            <Notifications/>
            <slot></slot>
        </Android>
    {:else if $Brand == 'iOS'}
        <Iphone {backgroundOverride}>
            <Notifications/>
            <slot></slot>
        </Iphone>
    {/if}
</div>

<style>
    .phone-container {
        position: absolute;
        bottom: -70vh;
        right: 0vh;
        width: 46vh;
        height: 65vh;
        pointer-events: none; /* Ensure container itself doesn't block clicks around the phone */
        transition: bottom 800ms ease 0s;
        
        /* 3D Transform */
        transform-origin: right center;
        transform: perspective(150vh) rotateY(-12deg) rotateX(4deg);
        transform-style: preserve-3d;
    }

    .phone-debug {
        position: absolute;
        bottom: 0vh !important;
        right: 0vh !important;
        top: auto !important;
        left: auto !important;

        transform-origin: right center;
        transform: perspective(150vh) rotateY(-12deg) rotateX(4deg) scale(1);
        transform-style: preserve-3d;
    }

    .phone-container.phone-visible {
        bottom: 0vh;
        transition: bottom 800ms ease 0s
    }

    .phone-container.phone-half {
        bottom: -51vh;
        transition: none
    }

    .phone-container.phone-hidden {
        bottom: -70vh;
        transition: bottom 800ms ease 0s
    }
</style>