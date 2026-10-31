<script>

    // Default: hide after 3 seconds
    // If COUNTDOWN it hides after 30 seconds
    // 
    // If action is clicked, hide it UNLESS defined otherwise.
    // If told otherwise OR a timer is shown, do NOT fade out AT ALL, unless 'RemoveNotification' is called.
    // 
    // Fade State SHOULD not be handled here, instead handle it in utils.
    // 
    // ## PLEASE DO NOT TOUCH. IT WILL BREAK ##

    import { onDestroy, onMount } from "svelte";
    import { Notifications, RemoveNotification, SendEvent } from "../../../utils/Utils";

    export let Id = "";
    export let IconColor = "white";
    export let BgColor = "rgb(144, 202, 249)";
    export let Icon = "user-circle";
    export let Title = "Title";
    export let Text = "";
    export let ShowTimer = false;
    export let ShowCountdown = false;
    export let HasAccept = false;
    export let HasReject = false;
    export let HasSpeaker = false;
    export let SpeakerEnabled = false;
    export let Data = {};
    export let State = "in";

    // Actions
    const OnReject = () => {
        SendEvent("Notifications/Click", {Id, Accepted: false});
        if (!Data.HideOnAction) return;

        HasAccept = false, HasReject = false;
        ForceFade();
    };

    const OnAccept = () => {
        SendEvent("Notifications/Click", {Id, Accepted: true});
        if (!Data.HideOnAction) return;

        HasAccept = false, HasReject = false;
        ForceFade();
    };

    const OnToggleSpeaker = () => {
        SendEvent("Contacts/ToggleSpeaker", {CallId: Data.CallId});
    };

    const SetState = (Value) => {
        let NewNotifications = $Notifications;
        const NotifIndex = NewNotifications.findIndex(Val => Val.Id == Id);
        if (NotifIndex == -1) return;
        NewNotifications[NotifIndex].State = Value;
        Notifications.set(NewNotifications);
    };

    // Fade In/Out
    let StateTimeout = setTimeout(() => {
        SetState("");
    }, 500);

    const FadeOut = () => {
        if (ShowTimer) return;
        if (HasAccept || HasReject && !Data.HideOnAction) return;
        if (Data.Sticky) return;

        StateTimeout = setTimeout(() => {
            SetState("out");
            setTimeout(() => {
                RemoveNotification({ Id });
            }, 500);
        }, ShowCountdown ? 30500 : 3500);
    };

    const ForceFade = () => {
        if ((HasAccept || HasReject) && !Data.HideOnAction) return;
        if ((ShowCountdown || ShowTimer) && !Data.HideOnAction) return;

        clearTimeout(StateTimeout);
        SetState("out");
        setTimeout(() => {
            RemoveNotification({ Id });
        }, 500);
    };

    // Timer
    let Prefix = "";
    let Timer = 0;
    let TimerInterval;
    if (ShowCountdown) Timer = 30;

    const FormatTime = () => {
        const Minutes = Math.floor(Timer / 60).toString().padStart(2, "0");
        const Seconds = (Timer % 60).toString().padStart(2, "0");
        return `${Minutes}:${Seconds}`;
    };

    onMount(() => {
        if (ShowTimer) {
            Prefix = FormatTime();
            TimerInterval = setInterval(() => {
                Timer = Timer + 1;
                Prefix = FormatTime();
            }, 1000);
            return;
        }

        if (ShowCountdown) {
            Prefix = FormatTime();
            TimerInterval = setInterval(() => {
                Timer = Timer - 1;
                Prefix = FormatTime();

                if (Timer <= 0 && State != "out") {
                    SetState("out");
                    setTimeout(() => {
                        RemoveNotification({ Id });
                    }, 500);
                }
            }, 1000);
        };

        FadeOut();
    });

    onDestroy(() => {
        clearInterval(TimerInterval);
    });

    $: if ((!ShowTimer && !ShowCountdown) && TimerInterval) {
        clearInterval(TimerInterval);
        Prefix = "";
    }
</script>

<div class="phone-notification phone-notification-{State}" on:keyup on:click={() => {
    if (HasAccept || HasReject) return;
    ForceFade(); 
}}>
    <div class="phone-notification-title">
        <div class="icon" style="color: {IconColor}; background-color: {BgColor};">
            <i class="{Icon}" />
        </div>
        <div class="app">
            <p>{Title}</p>
        </div>
        <p>just now</p>
    </div>
    <div class="phone-notification-message">
        <div class="text">
            <p>{Prefix}{(ShowTimer || ShowCountdown) && Text ? " - " + Text : Text}</p>
        </div>
        <div class="actions">
            {#if HasReject}
                <div on:keyup on:click={OnReject} data-tooltip="Decline" class="tooltip phone-notification-action action-reject">
                    <i class="fas fa-times-circle" />
                </div>
            {/if}
            {#if HasAccept}
                <div on:keyup on:click={OnAccept} data-tooltip="Accept" class="tooltip phone-notification-action action-accept">
                    <i class="fas fa-check-circle" />
                </div>
            {/if}
            {#if HasSpeaker}
                <div on:keyup on:click={OnToggleSpeaker} data-tooltip={SpeakerEnabled ? "Disable Speaker" : "Enable Speaker"} class="tooltip phone-notification-action action-speaker {SpeakerEnabled ? 'active' : ''}">
                    <i class="fas fa-volume-up" />
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .phone-notification {
        width: calc(100% - 2.96vh);
        height: 100%;
        padding: 1vh 1.2vh;
        border-radius: var(--radius-lg);
        color: var(--color-text-primary);
        max-width: 20.8vw;
        cursor: pointer;
        margin-bottom: 0.8vh;
        opacity: 1;
        transform: translateY(0);
        background: rgba(28, 28, 36, 0.97);
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: var(--shadow-md);
        transition: all var(--transition-base);
        overflow: hidden;
        position: relative;
    }

    .phone-notification::before {
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

    .phone-notification:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.2);
        box-shadow: var(--shadow-lg);
        transform: translateY(-2px);
    }

    .phone-notification:hover::before {
        opacity: 1;
    }

    .phone-notification-in {
        animation: PhoneNotifFadeIn;
        animation-duration: 0.5s;
        animation-iteration-count: 1;
        animation-fill-mode: forwards;
    }

    .phone-notification-out {
        animation: PhoneNotifFadeOut;
        animation-duration: 0.5s;
        animation-iteration-count: 1;
        animation-fill-mode: forwards;
    }

    .phone-notification p {
        margin: 0;
        font-size: 1.3vh;
        font-family: "Roboto";
        font-weight: 400;
        line-height: 1.43;
        letter-spacing: 0.0017136vh;
    }

    .phone-notification > .phone-notification-title {
        display: flex;
        align-items: center;
    }

    .phone-notification > .phone-notification-title > .icon {
        position: relative;
        border-radius: var(--radius-md);
        width: 2.8vh;
        height: 2.8vh;
        margin-right: 0.8vw;
        background: var(--color-primary-gradient);
        text-align: center;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
        flex-shrink: 0;
        z-index: 1;
    }

    .phone-notification > .phone-notification-title > .icon > i {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 1.3vh;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
        color: white;
    }

    .phone-notification > .phone-notification-title {
        position: relative;
        z-index: 1;
    }

    .phone-notification > .phone-notification-title > .app {
        flex: 1 1;
        text-transform: uppercase;
        overflow: hidden;
        font-weight: var(--font-weight-medium);
    }

    .phone-notification > .phone-notification-title > .app > p {
        font-size: 1.2vh;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding-right: 0.4vw;
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
    }

    .phone-notification > .phone-notification-title > p {
        font-size: 1vh;
        color: var(--color-text-tertiary);
        font-weight: var(--font-weight-normal);
    }

    .phone-notification > .phone-notification-message {
        margin-top: 0.6vh;
        display: flex;
        position: relative;
        z-index: 1;
    }

    .phone-notification > .phone-notification-message > .text {
        flex: 1 1;
        padding-right: 0.4vw;
    }

    .phone-notification > .phone-notification-message > .text > p {
        font-size: 1.1vh;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        color: var(--color-text-secondary);
        line-height: 1.4;
    }

    .phone-notification > .phone-notification-message > .actions {
        display: flex;
        align-items: center;
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .phone-notification-action {
        font-size: 1.6vh;
        margin: 0 0.4vh;
        cursor: pointer;
        padding: 0.3vh;
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .phone-notification-action:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: scale(1.15);
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .action-accept {
        color: #4ade80;
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .action-accept:hover {
        color: #22c55e;
        box-shadow: 0 0 8px rgba(74, 222, 128, 0.4);
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .action-reject {
        color: #f87171;
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .action-reject:hover {
        color: #ef4444;
        box-shadow: 0 0 8px rgba(248, 113, 113, 0.4);
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .action-speaker {
        color: rgba(255, 255, 255, 0.6);
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .action-speaker:hover {
        color: #fbbf24;
        box-shadow: 0 0 8px rgba(251, 191, 36, 0.4);
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .action-speaker.active {
        color: #fbbf24;
        background: rgba(251, 191, 36, 0.15);
    }

    .phone-notification
        > .phone-notification-message
        > .actions
        > .action-speaker.active:hover {
        color: #f59e0b;
        box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
    }

    @keyframes PhoneNotifFadeIn {
        0% {
            opacity: 0;
            transform: translateY(-9.25vh) scale(0.95);
        }

        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    @keyframes PhoneNotifFadeOut {
        0% {
            opacity: 1;
            transform: translateY(0) scale(1);
            height: 5.5vh;
            max-height: 5.5vh;
        }

        to {
            opacity: 0;
            transform: translateY(-9.25vh) scale(0.95);
            height: 0;
            max-height: 0;
        }
    }
</style>
