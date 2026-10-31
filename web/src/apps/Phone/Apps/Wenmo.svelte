<script>
    import { onMount } from "svelte";
    import { fade, fly, slide } from "svelte/transition";
    import {
        FormatCurrency,
        GetTimeLabel,
        SendEvent,
        ShowSuccessModal,
        GetContactsSelect,
    } from "../../../utils/Utils";
    import { LoaderModal } from "../phone.stores";
    import { InputModal } from "../phone.stores";

    // State
    let CurrentView = "home"; // 'home', 'send'
    let Transactions = [];
    let FilteredTransactions = [];
    let SearchQuery = "";
    let Balance = 0;

    // Send Money Form
    let SendForm = {
        Recipient: "",
        RecipientName: "", // For display/search
        Amount: "",
        Comment: "",
    };

    let Contacts = [];
    let ContactSearchResults = [];
    let ShowContactDropdown = false;

    // Loading
    let IsLoading = false;

    onMount(async () => {
        LoadTransactions();
        let contactData = await GetContactsSelect();
        // Format contacts for our use
        Contacts = contactData.map((c) => ({
            name: c.Text,
            phone: c.Value,
        }));
    });

    const LoadTransactions = () => {
        SendEvent("Wenmo/GetBankData", {}, (Success, Data) => {
            if (!Success) return;
            Balance = Data.Balance;
            // Sorting by timestamp desc if not already
            Transactions = Data.Transactions.sort(
                (a, b) => b.Timestamp - a.Timestamp,
            );
            FilterTransactions();
        });
    };

    const FilterTransactions = () => {
        let query = SearchQuery.toLowerCase();
        if (!query) {
            FilteredTransactions = Transactions;
            return;
        }
        FilteredTransactions = Transactions.filter(
            (t) =>
                t.Name.toLowerCase().includes(query) ||
                t.Comment.toLowerCase().includes(query) ||
                (t.Cid && t.Cid.toLowerCase().includes(query)),
        );
    };

    $: SearchQuery, FilterTransactions();

    // Send Money Logic
    const OpenSend = () => {
        SendForm = {
            Recipient: "",
            RecipientName: "",
            Amount: "",
            Comment: "",
        };
        CurrentView = "send";
        ShowContactDropdown = false;
    };

    const CloseSend = () => {
        CurrentView = "home";
    };

    const HandleRecipientSearch = (e) => {
        const value = e.target.value;
        SendForm.RecipientName = value;
        SendForm.Recipient = value; // Default to value, override if contact selected

        if (value.length > 0) {
            ContactSearchResults = Contacts.filter(
                (c) =>
                    c.name.toLowerCase().includes(value.toLowerCase()) ||
                    c.phone.includes(value),
            ).slice(0, 5);
            ShowContactDropdown = true;
        } else {
            ShowContactDropdown = false;
        }
    };

    const SelectContact = (contact) => {
        SendForm.RecipientName = contact.name;
        SendForm.Recipient = contact.phone;
        ShowContactDropdown = false;
    };

    const SubmitSend = () => {
        if (!SendForm.Recipient) return;
        if (
            !SendForm.Amount ||
            isNaN(SendForm.Amount) ||
            parseFloat(SendForm.Amount) <= 0
        )
            return;

        // Simple validation or confirmation could go here

        LoaderModal.set(true);
        IsLoading = true;

        const payload = {
            Phone: SendForm.Recipient,
            Amount: parseFloat(SendForm.Amount),
            Comment: SendForm.Comment || "Wenmo Transaction",
        };

        SendEvent("Wenmo/SendMoney", payload, (Success, Data) => {
            LoaderModal.set(false);
            IsLoading = false;

            if (Success && Data.Success) {
                ShowSuccessModal();
                LoadTransactions();
                CloseSend();
            } else {
                InputModal.set({
                    Visible: true,
                    Inputs: [
                        {
                            Type: "Text",
                            Text:
                                Data?.Msg ||
                                (Success
                                    ? "Transaction Failed"
                                    : "Connection failed"),
                            Data: { style: "text-align: center;" },
                        },
                    ],
                    Buttons: [
                        {
                            Color: "danger",
                            Text: "Close",
                            Cb: () => {},
                        },
                    ],
                });
            }
        });
    };

    const GetInitials = (name) => {
        if (!name) return "?";
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    };
</script>

<div class="wenmo-app">
    <!-- Header -->
    <div class="wenmo-header">
        <div class="brand">wenmo</div>
        {#if CurrentView === "home"}
            <div class="actions">
                <button class="icon-btn" on:click={OpenSend}>
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        {:else}
            <div class="actions">
                <button class="icon-btn" on:click={CloseSend}>
                    <i class="fas fa-times"></i>
                </button>
            </div>
        {/if}
    </div>

    {#if CurrentView === "home"}
        <div class="view-home" in:fade={{ duration: 200 }}>
            <div class="balance-container">
                <div class="balance-label">Current Balance</div>
                <div class="balance-amount">
                    {FormatCurrency.format(Balance)}
                </div>
            </div>

            <!-- Search -->
            <div class="search-container">
                <i class="fas fa-search"></i>
                <input
                    type="text"
                    placeholder="Search payments..."
                    bind:value={SearchQuery}
                />
            </div>

            <!-- List -->
            <div class="transaction-list">
                {#each FilteredTransactions as t}
                    <div class="transaction-item">
                        <div class="avatar">
                            {GetInitials(t.Name)}
                        </div>
                        <div class="info">
                            <div class="top-row">
                                <span class="name">{t.Name}</span>
                                <span
                                    class="amount {t.IsSender
                                        ? 'sent'
                                        : 'received'}"
                                >
                                    {t.IsSender ? "-" : "+"}
                                    {FormatCurrency.format(t.Amount)}
                                </span>
                            </div>
                            <div class="bottom-row">
                                <span class="time"
                                    >{GetTimeLabel(t.Timestamp)}</span
                                >
                            </div>
                            <!-- Comment is always visible in this design but smaller -->
                            {#if t.Comment}
                                <div class="comment">"{t.Comment}"</div>
                            {/if}
                        </div>
                    </div>
                {/each}
                {#if FilteredTransactions.length === 0}
                    <div class="empty-state">
                        <i class="fas fa-receipt"></i>
                        <p>No transactions found</p>
                    </div>
                {/if}
            </div>
        </div>
    {:else if CurrentView === "send"}
        <div class="view-send" in:fly={{ y: 20, duration: 300 }}>
            <div class="send-container">
                <div class="field-group">
                    <label>To</label>
                    <div class="input-wrapper">
                        <input
                            type="text"
                            placeholder="Name, username, phone..."
                            value={SendForm.RecipientName}
                            on:input={HandleRecipientSearch}
                        />
                        <i class="fas fa-user-friends"></i>
                    </div>

                    {#if ShowContactDropdown}
                        <div class="dropdown-results" transition:slide>
                            {#each ContactSearchResults as contact}
                                <div
                                    class="dropdown-item"
                                    on:click={() => SelectContact(contact)}
                                >
                                    <div class="d-avatar">
                                        {GetInitials(contact.name)}
                                    </div>
                                    <div class="d-info">
                                        <div class="d-name">{contact.name}</div>
                                        <div class="d-phone">
                                            {contact.phone}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="field-group amount-group">
                    <label>Amount</label>
                    <div class="amount-input-wrapper">
                        <span class="currency-symbol">$</span>
                        <input
                            type="number"
                            placeholder="0"
                            bind:value={SendForm.Amount}
                        />
                    </div>
                </div>

                <div class="field-group">
                    <label>What's it for?</label>
                    <textarea
                        placeholder="Dinner, Rent, etc."
                        bind:value={SendForm.Comment}
                    ></textarea>
                </div>

                <button
                    class="pay-btn"
                    on:click={SubmitSend}
                    disabled={IsLoading}
                >
                    {#if IsLoading}
                        <i class="fas fa-spinner fa-spin"></i>
                    {:else}
                        Pay
                    {/if}
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    /* VARIABLES */
    :root {
        --wenmo-bg: #121212;
        --wenmo-surface: #1e1e1e;
        --wenmo-accent: #95ef77;
        --wenmo-text: #ffffff;
        --wenmo-text-muted: #a0a0a0;
        --wenmo-danger: #ff5252;
    }

    * {
        box-sizing: border-box;
    }

    .wenmo-app {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #121212;
        color: #ffffff;
        font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    /* HEADER */
    .wenmo-header {
        height: 8vh;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 2vh;
        background-color: #121212;
        border-bottom: 1px solid #2a2a2a;
        flex-shrink: 0;
    }

    .brand {
        font-size: 2.2vh;
        font-weight: 800;
        letter-spacing: -0.5px;
        color: #95ef77;
        font-style: italic;
    }

    .icon-btn {
        background: transparent;
        border: none;
        color: #95ef77;
        font-size: 2.2vh;
        cursor: pointer;
        padding: 0.5vh;
        transition: transform 0.2s;
    }
    .icon-btn:active {
        transform: scale(0.9);
    }

    /* HOME VIEW */
    .view-home {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .balance-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 3vh 0;
    }

    .balance-label {
        color: var(--wenmo-text-muted);
        font-size: 1.4vh;
        margin-bottom: 0.5vh;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }

    .balance-amount {
        font-size: 4vh;
        font-weight: 700;
        color: var(--wenmo-text);
    }

    .search-container {
        margin: 0 1.5vh 1.5vh 1.5vh;
        background: #1e1e1e;
        border-radius: 1vh;
        display: flex;
        align-items: center;
        padding: 1vh 1.5vh;
    }
    .search-container i {
        color: #555;
        font-size: 1.4vh;
        margin-right: 1vh;
    }
    .search-container input {
        background: transparent;
        border: none;
        color: white;
        font-size: 1.4vh;
        width: 100%;
        outline: none;
    }

    .transaction-list {
        flex: 1;
        overflow-y: auto;
        padding: 0 1.5vh 2vh 1.5vh;
    }

    .transaction-list::-webkit-scrollbar {
        display: none;
    }

    .transaction-item {
        display: flex;
        margin-bottom: 2vh;
        align-items: flex-start;
    }

    .avatar {
        width: 4.5vh;
        height: 4.5vh;
        border-radius: 50%;
        background: #2a2a2a;
        color: #95ef77;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 1.6vh;
        margin-right: 1.5vh;
        flex-shrink: 0;
        border: 1px solid rgba(149, 239, 119, 0.2);
    }

    .info {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .top-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.2vh;
    }

    .name {
        font-weight: 600;
        font-size: 1.5vh;
    }

    .amount {
        font-weight: 700;
        font-size: 1.5vh;
    }
    .amount.received {
        color: #95ef77;
    }
    .amount.sent {
        color: #ffffff;
    }

    .bottom-row {
        margin-bottom: 0.5vh;
    }

    .time {
        font-size: 1.1vh;
        color: #666;
    }

    .comment {
        font-size: 1.3vh;
        color: #ccc;
        background: #1e1e1e;
        padding: 0.8vh;
        border-radius: 0.5vh;
        margin-top: 0.5vh;
        position: relative;
    }
    .comment::before {
        content: "";
        position: absolute;
        top: -0.4vh;
        left: 1vh;
        width: 0.8vh;
        height: 0.8vh;
        background: #1e1e1e;
        transform: rotate(45deg);
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin-top: 5vh;
        color: #333;
    }
    .empty-state i {
        font-size: 4vh;
        margin-bottom: 1vh;
    }

    /* SEND VIEW */
    .view-send {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 2vh;
        background: #121212;
    }

    .send-container {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .field-group {
        margin-bottom: 3vh;
        display: flex;
        flex-direction: column;
        position: relative; /* For dropdown positioning */
    }

    .field-group label {
        font-size: 1.2vh;
        color: #666;
        margin-bottom: 0.5vh;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.05em;
    }

    .input-wrapper {
        display: flex;
        align-items: center;
        border-bottom: 1px solid #333;
        padding-bottom: 0.5vh;
    }

    .input-wrapper input {
        border: none;
        background: transparent;
        color: white;
        font-size: 1.8vh;
        width: 100%;
        outline: none;
    }
    .input-wrapper i {
        color: #95ef77;
        font-size: 1.6vh;
    }

    /* DROPDOWN */
    .dropdown-results {
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 0.5vh;
        z-index: 10;
        max-height: 20vh;
        overflow-y: auto;
        margin-top: 0.5vh;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
    }
    .dropdown-item {
        display: flex;
        align-items: center;
        padding: 1vh;
        cursor: pointer;
        border-bottom: 1px solid #2a2a2a;
    }
    .dropdown-item:last-child {
        border-bottom: none;
    }
    .dropdown-item:hover {
        background: #2a2a2a;
    }
    .d-avatar {
        width: 3.5vh;
        height: 3.5vh;
        background: #333;
        color: #95ef77;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2vh;
        margin-right: 1vh;
        font-weight: bold;
    }
    .d-name {
        font-size: 1.4vh;
        color: white;
    }
    .d-phone {
        font-size: 1.1vh;
        color: #777;
    }

    /* AMOUNT INPUT */
    .amount-group {
        align-items: center;
        margin-bottom: 4vh;
    }

    .amount-input-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .currency-symbol {
        font-size: 5vh;
        color: #95ef77;
        font-weight: 300;
        margin-right: 0.5vh;
    }

    .amount-input-wrapper input {
        background: transparent;
        border: none;
        color: white;
        font-size: 6vh;
        font-weight: bold;
        width: 15vh; /* Basic width, allow it to grow if needed or keep centered */
        text-align: left;
        outline: none;
        caret-color: #95ef77;
    }
    /* Hide number spinners */
    .amount-input-wrapper input::-webkit-outer-spin-button,
    .amount-input-wrapper input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    textarea {
        background: #1e1e1e;
        border: 1px solid #333;
        color: white;
        border-radius: 1vh;
        padding: 1.5vh;
        font-size: 1.4vh;
        resize: none;
        height: 10vh;
        outline: none;
        font-family: inherit;
    }
    textarea:focus {
        border-color: #95ef77;
    }

    .pay-btn {
        margin-top: auto;
        background: #95ef77;
        color: #121212;
        border: none;
        padding: 1.5vh;
        border-radius: 3vh;
        font-size: 1.8vh;
        font-weight: 700;
        cursor: pointer;
        transition:
            transform 0.1s,
            box-shadow 0.2s;
        box-shadow: 0 4px 12px rgba(149, 239, 119, 0.3);
    }
    .pay-btn:active {
        transform: scale(0.98);
    }
    .pay-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
