<script>
    import { IsEnvBrowser } from "../../../utils/Utils";

    import {
        BadgeDollarSign,
        Bird,
        BookOpenText,
        BookUser,
        BriefcaseBusiness,
        Bus,
        Calculator,
        Camera,
        CarFront,
        ClipboardCheck,
        Coins,
        FileText,
        Flag,
        Globe,
        Gavel,
        Home,
        IdCard,
        Images,
        Mail,
        MessagesSquare,
        Music4,
        Motorbike,
        Newspaper,
        Phone,
        PhoneCall,
        PiggyBank,
        Settings,
        Timer,
        TrainFront,
        Trophy,
        Video,
        WalletCards,
        Wifi,
    } from "lucide-svelte";

    export let App = "details";
    export let Tooltip = "Details";
    export let Icon = false; // Font Awesome fallback
    export let Image = null; // Image path for PNG icons
    export let IconComponent = null; // Lucide component
    export let IconColor = "white";
    export let IconSize = "3.2vh"; // Slightly adjusted size
    export let IconStroke = 2;
    export let HasUnread = false;

    const LucideIcons = {
        BadgeDollarSign,
        Bird,
        BookOpenText,
        BookUser,
        BriefcaseBusiness,
        Bus,
        Calculator,
        Camera,
        CarFront,
        ClipboardCheck,
        Coins,
        FileText,
        Flag,
        Globe,
        Gavel,
        Home,
        IdCard,
        Images,
        Mail,
        MessagesSquare,
        Music4,
        Motorbike,
        Newspaper,
        Phone,
        PhoneCall,
        PiggyBank,
        Settings,
        Timer,
        TrainFront,
        Trophy,
        Video,
        WalletCards,
        Wifi,
    };
</script>

<div
    {...$$restProps}
    class="phone-application {$$restProps.class}"
    on:keyup
    on:click
>
    <!-- Icon Container -->
    <div class="phone-app-icon-container">
        <div class="phone-app-backdrop"></div>
        <div class="phone-app-content">
            {#if Image}
                <img src={Image} alt={Tooltip} class="app-icon app-image" />
            {:else if IconComponent || LucideIcons[Icon]}
                <svelte:component
                    this={IconComponent || LucideIcons[Icon]}
                    class="app-icon lucide-icon"
                    color={IconColor}
                    stroke-width={IconStroke}
                    style={`width:${IconSize};height:${IconSize};`}
                />
            {:else if Icon}
                <i class="fas fa-{Icon}" style="font-size: {IconSize};"></i>
            {/if}
        </div>
        {#if HasUnread}
            <div class="phone-app-unread">
                <div class="phone-app-unread-dot"></div>
            </div>
        {/if}
    </div>

    <!-- App Label -->
    <div class="phone-app-label">
        {Tooltip}
    </div>
</div>

<style>
    .phone-application {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        /* Width is determined by grid, but we want it to center content */
        width: 100%;
        min-width: 0; /* Critical: prevent labels from pushing grid columns */
        height: auto;
        cursor: pointer;
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        transform: translateZ(0);
        will-change: transform;
    }

    .phone-application:hover {
        transform: scale(1.05);
    }

    .phone-application:active {
        transform: scale(0.95);
    }

    /* Icon Container - Squircle Shape */
    .phone-app-icon-container {
        position: relative;
        width: 4.5vh; /* Reduced for better clearance */
        height: 4.5vh;
        border-radius: 1vh;
        background: rgba(40, 40, 50, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 0.6vh;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
        transition: all 0.2s ease;
    }

    .phone-application:hover .phone-app-icon-container {
        box-shadow: 0 5px 12px rgba(0, 0, 0, 0.25);
        background: rgba(255, 255, 255, 0.2);
        transform: translateY(-2px);
    }

    .phone-app-backdrop {
        display: none;
    }

    .phone-app-content {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
    }

    .phone-application .phone-app-content > .app-image {
        width: 100%;
        height: 100%;
        object-fit: cover; /* Cover the squircle */
        border-radius: 1.1vh;
    }

    /* Lucide / FontAwesome styling */
    .phone-application .phone-app-content > i,
    :global(.phone-application .phone-app-content > .lucide-icon) {
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        color: #fff;
    }

    .phone-app-label {
        color: #ffffff;
        font-family: inherit;
        font-size: 1vh; /* Slightly smaller */
        font-weight: 500;
        text-align: center;
        width: 130%; /* Wider to prevent cut-off */
        max-width: 9vh;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
        letter-spacing: 0.02em;
        margin-top: -0.1vh;
    }

    .phone-app-unread {
        position: absolute;
        top: -0.4vh;
        right: -0.4vh;
        width: 1.8vh;
        height: 1.8vh;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .phone-app-unread-dot {
        width: 100%;
        height: 100%;
        background: #ff3b30; /* Use standard red for notification badge */
        border: 2px solid rgba(0, 0, 0, 0.2);
        border-radius: 50%;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        animation: pulse-unread 2s infinite;
    }

    @keyframes pulse-unread {
        0%,
        100% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.1);
        }
    }
</style>
