<script>
    import { GetLongTimeLabel, GetTimeLabel } from "../../../../utils/Utils";
    import ImageContainer from "../../components/ImageContainer.svelte";
    import { IsMessageSender } from "../_messages";
    export let Texts = [];
</script>

<div {...$$restProps} class="phone-messages-texts {$$restProps?.class}">
    {#each Texts as Data, Key}
        <div class="phone-messages-text" class:text-out={IsMessageSender(Data)}>
            {#if Data.Message != ''}
                <div class="inner" class:text-out={IsMessageSender(Data)}>
                    <p>{Data.Message}</p>
                </div>
            {/if}

            {#if Data.Attachments.length > 0}
                <ImageContainer Attachments={Data.Attachments} />
            {/if}

            <div data-tooltip={GetLongTimeLabel(Data.Timestamp)} class="timestamp">
                {#if Data.TimestampLabel}
                    <p>{Data.TimestampLabel} - {GetTimeLabel(Data.Timestamp)}</p>
                {:else}
                    <p>{GetTimeLabel(Data.Timestamp)}</p>
                {/if}
            </div>
        </div>
    {/each}
</div>

<style>
    .phone-messages-texts {
        position: absolute;
        left: 0;
        right: 0;
        top: 8.5vh;
        bottom: 11.5vh;
        margin: 0 auto;
        width: 100%;
        padding: 0 1.5vh;
        overflow: hidden;
        overflow-y: auto;
        display: flex;
        flex-direction: column-reverse;
        scroll-behavior: smooth;
    }

    .phone-messages-texts::-webkit-scrollbar {
        display: none;
    }

    .phone-messages-texts > .phone-messages-text {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        margin-bottom: 1.2vh;
        animation: slideInMessage 0.3s ease-out;
    }

    @keyframes slideInMessage {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .phone-messages-texts > .phone-messages-text.text-out {
        align-items: flex-end;
    }

    .phone-messages-texts > .phone-messages-text > .timestamp {
        display: flex;
        margin-top: 0.4vh;
        padding: 0 0.6vh;
    }

    .phone-messages-texts > .phone-messages-text > .timestamp > p {
        color: var(--color-text-tertiary);
        text-align: right;
        font-size: 1.1vh;
        margin: 0;
        font-weight: var(--font-weight-normal);
    }

    .phone-messages-texts > .phone-messages-text > .inner {
        width: max-content;
        max-width: 75%;
        border-radius: 1.8vh;
        padding: 1vh 1.4vh;
        background: rgba(255, 255, 255, 0.22);
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        position: relative;
        transition: all 0.2s ease;
    }

    .phone-messages-texts > .phone-messages-text > .inner::before {
        content: '';
        position: absolute;
        width: 0;
        height: 0;
        border-style: solid;
    }

    /* Incoming message tail */
    .phone-messages-texts > .phone-messages-text:not(.text-out) > .inner::before {
        left: -0.6vh;
        bottom: 1vh;
        border-width: 0 0.8vh 0.8vh 0;
        border-color: transparent rgba(255, 255, 255, 0.12) transparent transparent;
    }

    /* Outgoing message tail */
    .phone-messages-texts > .phone-messages-text.text-out > .inner::before {
        right: -0.6vh;
        bottom: 1vh;
        border-width: 0 0 0.8vh 0.8vh;
        border-color: transparent transparent transparent;
        border-left-color: #667eea;
    }

    .phone-messages-texts > .phone-messages-text > .inner.text-out {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: 1px solid rgba(255, 255, 255, 0.2);
        text-align: right;
        box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
    }

    .phone-messages-texts > .phone-messages-text > .inner:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .phone-messages-texts > .phone-messages-text > .inner.text-out:hover {
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.45);
    }

    .phone-messages-texts > .phone-messages-text > .inner > p {
        font-size: 1.4vh;
        line-height: 1.5;
        margin: 0;
        overflow-wrap: anywhere;
        user-select: text;
        color: var(--color-text-primary);
        font-weight: var(--font-weight-normal);
    }
</style>