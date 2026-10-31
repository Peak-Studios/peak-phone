import { onMount, onDestroy } from "svelte";

export const UseNuiEvent = (action, handler) => {
    const eventListener = (event) => {
        const { Action: eventAction } = event.data;
        if (`${eventAction}` === action) {
            handler(event.data);
        }
    };

    // Try to use lifecycle functions if in component context
    // Fall back to immediate registration if called outside component initialization
    try {
        onMount(() => window.addEventListener("message", eventListener));
        onDestroy(() => window.removeEventListener("message", eventListener));
    } catch (e) {
        // Not in component initialization context - register immediately
        // This can happen when phone restarts or component is recreated
        window.addEventListener("message", eventListener);

        // Note: Without onDestroy, listeners may accumulate on restart
        // This is a trade-off to prevent crashes. The listener will be
        // garbage collected when the page is fully reloaded.
    }
};