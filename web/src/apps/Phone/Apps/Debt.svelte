<script>
    import { onMount } from "svelte";
    import { fade, fly } from "svelte/transition";
    import {
        FormatCurrency,
        GetTimeLabel,
        SendEvent,
        ShowSuccessModal,
    } from "../../../utils/Utils";
    import { InputModal, LoaderModal } from "../phone.stores";

    let Debts = [];
    let FilteredDebts = [];
    let SearchQuery = "";

    $: TotalDebt = Debts.reduce((acc, curr) => acc + (curr.Data.Due || 0), 0);

    const IsFine = (Debt) =>
        Debt.Type === "Fine" ||
        Debt.AssetType === "Traffic Fine" ||
        Debt.AssetType === "Non-Traffic Fine";

    const FilterDebts = () => {
        const Query = SearchQuery.toLowerCase();
        FilteredDebts = Debts.filter((Val) => {
            if (Val.AssetType === "Vehicle") {
                return Query === "" || "vehicle".includes(Query);
            } else if (Val.AssetType === "Housing") {
                return (
                    Val.Data.Name && Val.Data.Name.toLowerCase().includes(Query)
                );
            } else if (Val.AssetType === "Coopers Arcade Membership") {
                return (
                    Val.Data.Name && Val.Data.Name.toLowerCase().includes(Query)
                );
            } else if (IsFine(Val)) {
                const title = (Val.Data.Violation || "Fine").toLowerCase();
                const officer = (Val.Data.OfficerName || "").toLowerCase();
                return (
                    Query === "" ||
                    title.includes(Query) ||
                    officer.includes(Query)
                );
            }

            return Query === "";
        });
    };

    const PayDebt = (Debt) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Type: "Text",
                    Text: `Pay ${FormatCurrency.format(Debt.Data.Due)}?`,
                    Data: {
                        style: "margin-top: 2vh; margin-bottom: 2vh; text-align: center; font-size: 1.8vh; font-weight: 500; color: #fff;",
                    },
                },
            ],
            Buttons: [
                {
                    Color: "success",
                    Text: "Confirm Payment",
                    Cb: () => {
                        LoaderModal.set(true);
                        SendEvent(
                            "Debt/PayDebt",
                            { ...Debt },
                            (Success, Data) => {
                                LoaderModal.set(false);
                                if (!Success || !Data.Success) {
                                    InputModal.set({
                                        Visible: true,
                                        Inputs: [
                                            {
                                                Type: "Text",
                                                Text:
                                                    Data?.Msg ||
                                                    "Payment failed. Please try again.",
                                                Data: {
                                                    style: "margin: 2vh 0; text-align: center;",
                                                },
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
                                    return;
                                }

                                // Success
                                ShowSuccessModal();
                                Debts = Debts.filter(
                                    (Val) => Val.Id != Debt.Id,
                                );
                                FilterDebts();
                            },
                        );
                    },
                },
                {
                    Color: "danger",
                    Text: "Cancel",
                    Cb: () => {},
                },
            ],
        });
    };

    onMount(() => {
        SendEvent("Debt/GetDebt", {}, (Success, Data) => {
            if (Success) {
                Debts = Data;
                FilteredDebts = Data;
            }
        });
    });
</script>

<div class="app-container" in:fade={{ duration: 300 }}>
    <div class="header-section">
        <div class="header-title">Debt Manager</div>
        <div class="total-card">
            <div class="total-label">Total Outstanding</div>
            <div class="total-value">{FormatCurrency.format(TotalDebt)}</div>
            <div class="total-sub">One-tap payments available</div>
        </div>
    </div>

    <div class="search-section">
        <div class="search-bar">
            <i class="fas fa-search"></i>
            <input
                type="text"
                placeholder="Search debts..."
                bind:value={SearchQuery}
                on:input={FilterDebts}
            />
        </div>
    </div>

    <div class="debt-list">
        {#if FilteredDebts.length === 0}
            <div class="empty-state" in:fade>
                <i class="fas fa-check-circle"></i>
                <p>No active debts found</p>
                <span>You are debt free!</span>
            </div>
        {/if}

        {#each FilteredDebts as Debt (Debt.Id)}
            <div class="debt-card" in:fly={{ y: 20, duration: 400 }}>
                <div
                    class="card-icon {Debt.AssetType === 'Vehicle'
                        ? 'vehicle'
                        : IsFine(Debt)
                        ? 'fine'
                        : 'property'}"
                >
                    <i
                        class="fas {Debt.AssetType === 'Vehicle'
                            ? 'fa-car'
                            : IsFine(Debt)
                            ? 'fa-gavel'
                            : 'fa-home'}"
                    ></i>
                </div>
                <div class="card-content">
                    <div class="debt-name">
                        {#if IsFine(Debt)}
                            {Debt.Data.Violation || "Police Fine"}
                        {:else if Debt.AssetType === "Vehicle"}
                            Vehicle Fee
                        {:else}
                            {Debt.Data.Name}
                        {/if}
                    </div>
                    <div class="debt-due">
                        {#if IsFine(Debt)}
                            Ticket due {GetTimeLabel(Debt.DueAt)}
                        {:else}
                            Due {GetTimeLabel(Debt.DueAt)}
                        {/if}
                    </div>
                </div>
                <div class="card-actions">
                    <div class="debt-amount">
                        {FormatCurrency.format(Debt.Data.Due)}
                    </div>
                    <button class="pay-btn" on:click={() => PayDebt(Debt)}>
                        PAY
                    </button>
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    /* Base Container */
    .app-container {
        width: 100%;
        height: 100%;
        background: #0f0f13; /* Deep dark background */
        display: flex;
        flex-direction: column;
        color: white;
        font-family: "Inter", sans-serif; /* Assuming font availability, otherwise inherits */
        overflow: hidden;
    }

    /* Header */
    .header-section {
        padding: 6vh 3vh 3vh 3vh;
        background: linear-gradient(
            180deg,
            rgba(30, 30, 40, 0.8) 0%,
            rgba(15, 15, 19, 0) 100%
        );
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .header-title {
        font-size: 3.2vh;
        font-weight: 800;
        margin-bottom: 2.5vh;
        background: linear-gradient(90deg, #fff, #a0a0a0);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .total-card {
        padding: 2.5vh;
        background: radial-gradient(
            circle at top right,
            rgba(60, 60, 80, 0.3),
            rgba(30, 30, 35, 0.8)
        );
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 2vh;
        box-shadow: 0 1vh 3vh rgba(0, 0, 0, 0.3);
    }

    .total-label {
        font-size: 1.4vh;
        color: rgba(255, 255, 255, 0.6);
        text-transform: uppercase;
        letter-spacing: 0.1vh;
        margin-bottom: 0.5vh;
    }

    .total-value {
        font-size: 4vh;
        font-weight: 700;
        color: #fff;
        margin-bottom: 0.5vh;
    }

    .total-sub {
        font-size: 1.2vh;
        color: #4ade80; /* Green highlight */
        font-weight: 500;
    }

    /* Search */
    .search-section {
        padding: 2vh 3vh;
    }

    .search-bar {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 1.5vh;
        padding: 1.2vh 1.5vh;
        transition: all 0.2s ease;
    }

    .search-bar:focus-within {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .search-bar i {
        color: rgba(255, 255, 255, 0.4);
        font-size: 1.6vh;
        margin-right: 1.5vh;
    }

    .search-bar input {
        background: transparent;
        border: none;
        color: white;
        font-size: 1.6vh;
        width: 100%;
        outline: none;
    }

    /* List */
    .debt-list {
        flex: 1;
        overflow-y: auto;
        padding: 0 3vh 3vh 3vh;
        display: flex;
        flex-direction: column;
        gap: 1.5vh;
    }

    .debt-list::-webkit-scrollbar {
        display: none;
    }

    /* Cards */
    .debt-card {
        background: rgba(30, 30, 35, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1.8vh;
        padding: 2vh;
        display: flex;
        align-items: center;
        gap: 2vh;
        transition: transform 0.1s ease;
    }

    .debt-card:active {
        transform: scale(0.98);
    }

    .card-icon {
        width: 5vh;
        height: 5vh;
        border-radius: 1.2vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.2vh;
    }

    .card-icon.vehicle {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
    }

    .card-icon.property {
        background: rgba(234, 88, 12, 0.15);
        color: #fb923c;
    }

    .card-icon.fine {
        background: rgba(59, 130, 246, 0.15);
        color: #fbbf24;
    }

    .card-content {
        flex: 1;
        overflow: hidden;
    }

    .debt-name {
        font-size: 1.7vh;
        font-weight: 600;
        margin-bottom: 0.4vh;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #f3f4f6;
    }

    .debt-due {
        font-size: 1.3vh;
        color: rgba(255, 255, 255, 0.5);
    }

    .card-actions {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.8vh;
    }

    .debt-amount {
        font-size: 1.8vh;
        font-weight: 700;
        color: #fff;
    }

    .pay-btn {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        border: none;
        padding: 0.6vh 2vh;
        border-radius: 0.8vh;
        color: white;
        font-size: 1.3vh;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 0.5vh 1vh rgba(16, 185, 129, 0.2);
    }

    /* Empty State */
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: rgba(255, 255, 255, 0.3);
        margin-top: 5vh;
    }

    .empty-state i {
        font-size: 6vh;
        margin-bottom: 2vh;
        color: rgba(255, 255, 255, 0.1);
    }

    .empty-state p {
        font-size: 2vh;
        font-weight: 600;
        margin-bottom: 0.5vh;
    }

    .empty-state span {
        font-size: 1.4vh;
    }
</style>
