<script>
    import "../components/Misc.css";
    import { onMount } from "svelte";
    import { fade, slide } from "svelte/transition";
    import {
        ExtractImageUrls,
        FormatPhone,
        GetContactsSelect,
        GetTimeLabel,
        SendEvent,
        ShowSuccessModal,
    } from "../../../utils/Utils";
    import { InputModal, LoaderModal } from "../phone.stores";

    import Button from "../../../components/Button/Button.svelte";
    import AppWrapper from "../components/AppWrapper.svelte";
    import Empty from "../components/Empty.svelte";

    let Calls = [];
    let FilteredCalls = [];
    let ShowingLimit = 50;

    let activeTab = "recents";
    let keypadNumber = "";

    const LoadMore = () => {
        ShowingLimit = ShowingLimit + 50;
    };

    const HandleKeypadPress = (val) => {
        if (keypadNumber.length < 15) keypadNumber += val;
    };

    const HandleKeypadDelete = () => {
        keypadNumber = keypadNumber.slice(0, -1);
    };

    const HandleKeypadCall = () => {
        if (keypadNumber.length > 0) {
            SendEvent("Contacts/Call", { Phone: keypadNumber });
        }
    };

    const CallContact = (Data) => {
        SendEvent("Contacts/Call", { Phone: Data.Phone });
    };

    const MessageContact = async (Data) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Phone",
                    Type: "TextField",
                    IsPhone: true,
                    ContactPicker: true,
                    Data: {
                        Title: "Phone Number",
                        Icon: "phone",
                        Value: Data.Phone,
                        Select: await GetContactsSelect(),
                        SearchSelect: true,
                    },
                },
                {
                    Id: "Message",
                    Type: "TextArea",
                    Data: {
                        Title: "Message",
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (Result.Phone.length <= 0) return;
                if (Result.Message.length <= 0) return;

                let [Attachments, Message] = ExtractImageUrls(Result.Message);

                LoaderModal.set(true);
                SendEvent(
                    "Messages/SendMessage",
                    { Phone: Result.Phone, Attachments, Message },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        ShowSuccessModal();
                    },
                );
            },
        });
    };

    const AddContact = (Data) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Name",
                    Type: "TextField",
                    Data: {
                        Title: "Name",
                        Icon: "user",
                        Value: "",
                    },
                },
                {
                    Id: "Phone",
                    Type: "TextField",
                    IsPhone: true,
                    Data: {
                        Title: "Phone Number",
                        Icon: "phone",
                        Type: "number",
                        Value: Data.Phone,
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (Result.Name.length <= 0) return;
                if (Result.Phone.length <= 0) return;

                LoaderModal.set(true);
                SendEvent(
                    "Contacts/CreateContact",
                    { ...Result },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        ShowSuccessModal();
                    },
                );
            },
        });
    };

    onMount(() => {
        SendEvent("Calls/GetCalls", {}, (Success, Data) => {
            if (!Success) return;
            Calls = Data;
            FilteredCalls = Calls;
        });
    });

    const GetAvatarStyle = (url) => {
        if (url) return `background-image: url(${url})`;
        return `background: rgba(255, 255, 255, 0.05)`;
    };
</script>

<AppWrapper>
    <div class="glass-container">
        <!-- BACKGROUND DEEP BLUR -->
        <div class="glass-bg"></div>

        <!-- HEADER -->
        <div class="glass-header">
            <div class="gh-title">Phone</div>
        </div>

        <div class="glass-content">
            <!-- TABS -->
            <div class="glass-tabs">
                <div
                    class="tab-btn"
                    class:active={activeTab === "recents"}
                    on:click={() => (activeTab = "recents")}
                >
                    Recents
                </div>
                <div
                    class="tab-btn"
                    class:active={activeTab === "keypad"}
                    on:click={() => (activeTab = "keypad")}
                >
                    Keypad
                </div>
            </div>

            <!-- TABS CONTENT -->
            <div class="tab-content" in:fade={{ duration: 200 }}>
                {#if activeTab === "recents"}
                    <div class="recents-list">
                        {#if Calls.length == 0}
                            <div class="glass-empty">
                                <i class="fas fa-history"></i>
                                <span>No recent calls</span>
                            </div>
                        {:else}
                            {#each FilteredCalls.slice(0, ShowingLimit) as Data}
                                <div class="glass-row">
                                    <div class="gr-left">
                                        <div
                                            class="gr-avatar"
                                            class:missed={!Data.Incoming &&
                                                false}
                                            style={GetAvatarStyle(Data.Avatar)}
                                        >
                                            {#if !Data.Avatar}
                                                <i
                                                    class="fas fa-{Data.Incoming
                                                        ? 'arrow-down'
                                                        : 'arrow-up'}"
                                                    style="opacity: 0.7; font-size: 1.4vh; color: {Data.Incoming
                                                        ? '#4ade80'
                                                        : '#fff'}"
                                                ></i>
                                            {/if}
                                        </div>
                                    </div>

                                    <div class="gr-info">
                                        <div class="gr-name">
                                            {Data.Contact}
                                        </div>
                                        <div class="gr-sub">
                                            {Data.Incoming
                                                ? "Incoming"
                                                : "Outgoing"} • {GetTimeLabel(
                                                Data.Timestamp,
                                            )}
                                        </div>
                                    </div>

                                    <div class="gr-actions">
                                        <div
                                            class="glass-icon-btn"
                                            on:click={() => CallContact(Data)}
                                        >
                                            <i class="fas fa-phone-alt"></i>
                                        </div>
                                        {#if Data.Contact == FormatPhone(Data.Phone)}
                                            <div
                                                class="glass-icon-btn"
                                                on:click={() =>
                                                    AddContact(Data)}
                                            >
                                                <i class="fas fa-user-plus"></i>
                                            </div>
                                        {:else}
                                            <div
                                                class="glass-icon-btn"
                                                on:click={() =>
                                                    MessageContact(Data)}
                                            >
                                                <i class="fas fa-comment"></i>
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/each}

                            {#if FilteredCalls.length > ShowingLimit}
                                <div class="load-more">
                                    <div class="glass-btn" on:click={LoadMore}>
                                        Load More
                                    </div>
                                </div>
                            {/if}

                            <div class="safe-padding"></div>
                        {/if}
                    </div>
                {:else}
                    <div class="keypad-container">
                        <div class="keypad-display">
                            {FormatPhone(keypadNumber)}
                            {#if !keypadNumber}
                                <span class="placeholder">Enter number</span>
                            {/if}
                            {#if keypadNumber.length > 0}
                                <div
                                    class="backspace"
                                    on:click={HandleKeypadDelete}
                                >
                                    <i class="fas fa-backspace"></i>
                                </div>
                            {/if}
                        </div>
                        <div class="keypad-grid">
                            {#each ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as key}
                                <div
                                    class="keypad-btn"
                                    on:click={() => HandleKeypadPress(key)}
                                >
                                    {key}
                                </div>
                            {/each}
                        </div>
                        <div class="keypad-action">
                            <div
                                class="call-btn-glass"
                                on:click={HandleKeypadCall}
                            >
                                <i class="fas fa-phone-alt"></i>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</AppWrapper>

<style>
    /* ----------------------
           THEME VARIABLES
           ---------------------- */
    .glass-container {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        font-family:
            "Inter",
            -apple-system,
            Roboto,
            sans-serif;
        color: #fff;
    }

    .glass-bg {
        position: absolute;
        width: 100%;
        height: 100%;
        background: radial-gradient(
            circle at 50% 120%,
            #2a1f3d 0%,
            #0d0d10 60%,
            #000 100%
        );
        z-index: 0;
    }

    .glass-header {
        position: relative;
        z-index: 2;
        padding: 5vh 2.5vh 1vh 2.5vh;
        display: flex;
        align-items: center;
    }
    .gh-title {
        font-size: 3.2vh;
        font-weight: 300;
        letter-spacing: -0.5px;
        opacity: 0.9;
    }

    .glass-content {
        position: relative;
        z-index: 1;
        height: 85%;
        display: flex;
        flex-direction: column;
        padding: 0 2vh;
    }

    /* TABS */
    .glass-tabs {
        display: flex;
        background: rgba(40, 40, 50, 0.9);
        border-radius: 1.5vh;
        padding: 0.5vh;
        margin-bottom: 2vh;
        flex-shrink: 0;
    }
    .tab-btn {
        flex: 1;
        text-align: center;
        padding: 0.8vh 0;
        font-size: 1.4vh;
        border-radius: 1vh;
        cursor: pointer;
        opacity: 0.6;
        transition: all 0.2s;
    }
    .tab-btn.active {
        background: rgba(255, 255, 255, 0.1);
        opacity: 1;
        font-weight: 500;
    }

    .tab-content {
        flex: 1;
        overflow: hidden;
        position: relative;
    }

    /* RECENTS LIST */
    .recents-list {
        height: 100%;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.8vh;
    }
    .recents-list::-webkit-scrollbar {
        display: none;
    }

    .glass-row {
        display: flex;
        align-items: center;
        gap: 1.5vh;
        padding: 1vh;
        border-radius: 1.5vh;
        transition: background 0.2s;
        cursor: pointer;
    }
    .glass-row:hover {
        background: rgba(255, 255, 255, 0.05);
    }

    .gr-left {
        position: relative;
    }
    .gr-avatar {
        width: 5vh;
        height: 5vh;
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.05);
        background-size: cover;
        background-position: center;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .gr-avatar.missed {
        border-color: rgba(255, 107, 107, 0.3);
    }

    .gr-info {
        flex: 1;
        overflow: hidden;
    }
    .gr-name {
        font-size: 1.6vh;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 0.3vh;
    }
    .gr-sub {
        font-size: 1.2vh;
        opacity: 0.5;
    }

    .gr-actions {
        display: flex;
        gap: 0.5vh;
    }

    .glass-icon-btn {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5vh;
        background: rgba(255, 255, 255, 0.05);
        cursor: pointer;
        transition: 0.2s;
    }
    .glass-icon-btn:hover {
        background: rgba(255, 255, 255, 0.15);
    }

    .glass-empty {
        margin-top: 10vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5vh;
        opacity: 0.4;
    }

    .load-more {
        display: flex;
        justify-content: center;
        margin-top: 1vh;
    }
    .glass-btn {
        padding: 0.8vh 2vh;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 1vh;
        font-size: 1.3vh;
        cursor: pointer;
    }
    .safe-padding {
        height: 5vh;
        flex-shrink: 0;
    }

    /* KEYPAD */
    .keypad-container {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-evenly;
        padding-bottom: 5vh;
    }

    .keypad-display {
        width: 100%;
        height: 8vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3.5vh;
        font-weight: 200;
        position: relative;
        margin-bottom: 2vh;
    }
    .placeholder {
        opacity: 0.3;
        font-size: 2.5vh;
    }
    .backspace {
        position: absolute;
        right: 2vh;
        font-size: 2.2vh;
        opacity: 0.6;
        cursor: pointer;
        padding: 1vh;
    }
    .backspace:hover {
        opacity: 1;
    }

    .keypad-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2vh;
        width: 80%;
    }

    .keypad-btn {
        aspect-ratio: 1;
        border-radius: 50%;
        background: rgba(40, 40, 50, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.8vh;
        font-weight: 300;
        cursor: pointer;
        transition: all 0.1s;
    }
    .keypad-btn:active {
        background: rgba(255, 255, 255, 0.2);
    }
    .keypad-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .keypad-action {
        width: 100%;
        display: flex;
        justify-content: center;
        margin-top: 3vh;
    }
    .call-btn-glass {
        width: 8vh;
        height: 8vh;
        border-radius: 50%;
        background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
        box-shadow: 0 4px 20px rgba(74, 222, 128, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3vh;
        color: #fff;
        cursor: pointer;
        transition: transform 0.2s;
    }
    .call-btn-glass:active {
        transform: scale(0.95);
    }
</style>
