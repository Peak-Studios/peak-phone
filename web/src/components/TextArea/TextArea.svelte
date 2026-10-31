<script>
    import { onMount } from "svelte";

    export var Title = "No Title";
    export var Placeholder = "";
    export var MaxLength = 255;
    export let Value = "";
    export var Rows = 1;

    let TextArea;
    let Focused = false;

    function updateTextareaHeight(event) {
        Value = TextArea.value;
        TextArea.style.height = "auto"; // reset the height to auto to avoid a scrollbar
        TextArea.style.height = TextArea.scrollHeight + 10 + "px"; // set the height to the scroll height
    }

    onMount(() => {
        TextArea.style.height = TextArea.scrollHeight + 10 + 'px';
    });
</script>

<div class="textarea-component-container">
    <p>{Title}</p>
    <textarea
        bind:this={TextArea}
        on:focusin={() => {
            Focused = true;
        }}
        on:focusout={() => {
            Focused = false;
        }}
        on:input={updateTextareaHeight}
        rows={Rows}
        placeholder={Placeholder}
        maxlength={MaxLength}>{Value}</textarea
    >

    <div class="textarea-underline" style="height: 0.1vh">
        <div
            class="textarea-underline-fill"
            style="width: {Focused ? 100 : 0}%"
        />
    </div>

    <p class="subtext">{Value.length}/255</p>
</div>

<style>
    .textarea-component-container {
        position: relative;
        width: 100%;
        height: max-content;
        margin-bottom: 1.8vh;
        color: var(--color-text-secondary);
        font-family: "Roboto";
        font-size: 1.3vh;
        font-weight: var(--font-weight-medium);
    }

    .textarea-component-container > p {
        margin: 0 0 0.6vh 0;
        font-size: 1.3vh;
        font-weight: var(--font-weight-medium);
        color: var(--color-text-secondary);
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .textarea-component-container > p.subtext {
        font-size: 1.2vh;
        margin-top: 0.6vh;
        color: var(--color-text-tertiary);
        font-weight: var(--font-weight-normal);
        text-align: right;
        width: 100%;
    }

    .textarea-component-container > textarea {
        margin: 0;
        border: none;
        outline: none;
        background: rgba(40, 40, 50, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: var(--radius-lg);
        font-family: "Roboto";
        font-size: 1.4vh;
        line-height: 1.6;
        color: var(--color-text-secondary);
        margin-top: 0.3vh;
        resize: none;
        width: 100%;
        min-height: 8vh;
        padding: 1.2vh;
        transition: all var(--transition-base);
    }

    .textarea-component-container > textarea:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .textarea-component-container:focus-within > textarea {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.3);
        color: var(--color-text-primary);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15),
                    0 4px 16px rgba(102, 126, 234, 0.2);
    }

    .textarea-component-container > textarea::placeholder {
        color: var(--color-text-tertiary);
        opacity: 0.6;
    }

    .textarea-component-container > .textarea-underline {
        position: absolute;
        width: 100%;
        height: 0.1vh;
        background-color: rgba(255, 255, 255, 0.2);
        border-radius: 1px;
    }

    .textarea-component-container > .textarea-underline > .textarea-underline-fill {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        height: 0.2vh;
        width: 100%;
        transition: width ease 250ms;
        background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
        box-shadow: 0 0 8px rgba(102, 126, 234, 0.5);
    }

    .textarea-component-container > textarea::-webkit-scrollbar {
        width: 0.5vh;
    }

    .textarea-component-container > textarea::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: var(--radius-sm);
    }

    .textarea-component-container > textarea::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: var(--radius-sm);
        transition: background var(--transition-fast);
    }

    .textarea-component-container > textarea::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }
</style>
