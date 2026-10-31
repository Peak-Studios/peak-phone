<script>
    import Ripple from '@smui/ripple';

    export var Color = 'primary';
</script>

<div {...$$restProps} on:keyup on:click use:Ripple={{ surface: false, active: false }} class="ui-button {Color} {$$restProps?.class}">
    <slot></slot>
</div>

<style>
    .ui-button {
        /* Flexbox for perfect centering */
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        
        user-select: none;
        
        position: relative;

        width: auto;
        height: max-content;
        min-width: 10vh;

        padding: 1.2vh 2.5vh;
        border-radius: var(--radius-lg);

        margin: 0.5vh;

        font-family: 'Roboto';
        font-weight: var(--font-weight-medium);
        font-size: 1.3vh;
        
        letter-spacing: 0.03vh;
        text-transform: uppercase;
        white-space: nowrap;

        cursor: pointer;

        transition: all var(--transition-base);
        border: 1px solid transparent;
        overflow: hidden;
        z-index: 1;
    }

    .ui-button::before {
        content: '';
        position: absolute;
        inset: 0;
        opacity: 0;
        transition: opacity var(--transition-base);
        pointer-events: none;
        z-index: -1;
        border-radius: inherit;
    }

    .ui-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
    }

    .ui-button:active {
        transform: translateY(0);
        transition: transform 80ms;
    }

    .ui-button :global(*) {
        pointer-events: none;
        position: relative;
        z-index: 2;
    }

    /* Disabled State */
    .ui-button.disabled {
        color: rgba(255, 255, 255, 0.3);
        background: rgba(40, 40, 50, 0.9);
        border-color: rgba(255, 255, 255, 0.1);
        cursor: not-allowed;
        box-shadow: none;
    }

    .ui-button.disabled:hover {
        transform: none;
    }

    /* Primary Actions - Gradient Purple */
    .ui-button.success, .ui-button.primary {
        background: linear-gradient(135deg, #4ade80 0%, #16a34a 100%);
        color: white;
        box-shadow: 0 4px 16px rgba(74, 222, 128, 0.35),
                    0 2px 8px rgba(0, 0, 0, 0.2);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .ui-button.success::before, .ui-button.primary::before {
        background: linear-gradient(135deg, 
            rgba(255, 255, 255, 0.15) 0%, 
            rgba(255, 255, 255, 0.05) 100%);
    }

    .ui-button.success:hover, .ui-button.primary:hover {
        box-shadow: 0 8px 28px rgba(74, 222, 128, 0.6),
                    0 4px 16px rgba(0, 0, 0, 0.3);
        border-color: rgba(255, 255, 255, 0.25);
    }

    .ui-button.success:hover::before, .ui-button.primary:hover::before {
        opacity: 0.8;
    }

    /* Secondary Actions - Glass Morphism */
    .ui-button.warning, .ui-button.default {
        background: rgba(40, 40, 50, 0.95);
        color: var(--color-text-primary);
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .ui-button.warning::before, .ui-button.default::before {
        background: linear-gradient(135deg, 
            rgba(255, 255, 255, 0.1) 0%, 
            rgba(255, 255, 255, 0.05) 100%);
    }

    .ui-button.warning:hover, .ui-button.default:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.3);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    }

    .ui-button.warning:hover::before, .ui-button.default:hover::before {
        opacity: 0.7;
    }

    /* Error State - Red Gradient */
    .ui-button.error {
        background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
        color: white;
        box-shadow: 0 4px 16px rgba(244, 67, 54, 0.35),
                    0 2px 8px rgba(0, 0, 0, 0.2);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .ui-button.error::before {
        background: linear-gradient(135deg, 
            rgba(255, 255, 255, 0.15) 0%, 
            rgba(255, 255, 255, 0.05) 100%);
    }

    .ui-button.error:hover {
        box-shadow: 0 8px 28px rgba(244, 67, 54, 0.6),
                    0 4px 16px rgba(0, 0, 0, 0.3);
        border-color: rgba(255, 255, 255, 0.25);
    }

    .ui-button.error:hover::before {
        opacity: 0.8;
    }
</style>