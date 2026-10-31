<div {...$$restProps} class="phone-paperlist {$$restProps.class}">
    <slot></slot>
</div>

<style>
    .phone-paperlist {
        overflow-y: auto;
        position: absolute;
        left: 0;
        right: 0;
        top: 9.7vh;
        margin: 0 auto;
        width: 89%;
        height: 46.5vh;
        
        /* Subtle glass effect */
        background: linear-gradient(180deg, 
            rgba(20, 35, 28, 0.2) 0%, 
            rgba(15, 28, 22, 0.1) 100%);
        border-radius: 1vh;
        padding: 0.5vh;
    }

    /* Custom scrollbar styling */
    .phone-paperlist::-webkit-scrollbar {
        width: 4px;
    }

    .phone-paperlist::-webkit-scrollbar-track {
        background: rgba(20, 35, 28, 0.3);
        border-radius: 2px;
    }

    .phone-paperlist::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, 
            rgba(134, 239, 172, 0.6) 0%, 
            rgba(74, 222, 128, 0.4) 100%);
        border-radius: 2px;
        transition: background 0.2s ease;
    }

    .phone-paperlist::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, 
            rgba(134, 239, 172, 0.8) 0%, 
            rgba(74, 222, 128, 0.6) 100%);
    }
</style>
