<script>
    import { onMount } from "svelte";
    import { PlayerData, InputModal, LoaderModal } from "../phone.stores";
    import {
        SendEvent,
        ShowSuccessModal,
        GetContactsSelect,
        FormatCurrency,
    } from "../../../utils/Utils";
    import AppWrapper from "../components/AppWrapper.svelte";

    // --- State ---
    let cryptos = [];
    let portfolioValue = 0;
    let selectedCrypto = null; // For detail view / actions
    let activeTab = "market"; // 'market' | 'wallet'
    let loading = true;

    // --- Derived ---
    $: if ($PlayerData.Crypto && cryptos.length > 0) {
        portfolioValue = cryptos.reduce((total, crypto) => {
            const amount = $PlayerData.Crypto[crypto.Id] || 0;
            return total + amount * crypto.Costs;
        }, 0);
    }

    // --- Loading Data ---
    const fetchCryptoData = () => {
        loading = true;
        SendEvent("Crypto/GetCrypto", {}, (Success, Data) => {
            loading = false;
            if (Success) {
                cryptos = Data;
            }
        });
    };

    onMount(() => {
        fetchCryptoData();
    });

    // --- Actions ---

    const handleBuy = (crypto) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Amount",
                    Type: "TextField",
                    Data: {
                        Title: "Amount to Buy",
                        Icon: "hashtag",
                        Type: "number",
                    },
                },
            ],
            OnSubmit: (Result) => {
                const amount = parseFloat(Result.Amount);
                if (!amount || amount <= 0) return;

                LoaderModal.set(true);
                SendEvent(
                    "Crypto/BuyCrypto",
                    { CryptoId: crypto.Id, Amount: amount },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (Success && Data.Success) {
                            ShowSuccessModal();
                            fetchCryptoData(); // Refresh data potentially? (Though playerdata updates automatically usually)
                        } else {
                            // Error handling normally handled by generic modal or we can show specific
                            InputModal.set({
                                Visible: true,
                                Inputs: [
                                    {
                                        Type: "Text",
                                        Text: Data?.Msg || "Transaction Failed",
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
                    },
                );
            },
        });
    };

    const handleSell = (crypto) => {
        const owned = $PlayerData.Crypto[crypto.Id] || 0;
        if (owned <= 0) return; // Should be disabled in UI anyway

        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Amount",
                    Type: "TextField",
                    Data: {
                        Title: `Amount to Sell (Max: ${owned})`,
                        Icon: "hashtag",
                        Type: "number",
                        Max: owned,
                    },
                },
            ],
            OnSubmit: (Result) => {
                const amount = parseFloat(Result.Amount);
                if (!amount || amount <= 0) return;

                LoaderModal.set(true);
                SendEvent(
                    "Crypto/SellCrypto",
                    { CryptoId: crypto.Id, Amount: amount },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (Success && Data.Success) {
                            ShowSuccessModal();
                            fetchCryptoData();
                        } else {
                            InputModal.set({
                                Visible: true,
                                Inputs: [
                                    {
                                        Type: "Text",
                                        Text: Data?.Msg || "Transaction Failed",
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
                    },
                );
            },
        });
    };

    const handleTransfer = async (crypto) => {
        const owned = $PlayerData.Crypto[crypto.Id] || 0;
        if (owned <= 0) return;

        const contacts = await GetContactsSelect();

        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Phone",
                    Type: "TextField",
                    IsPhone: true,
                    ContactPicker: true,
                    Data: {
                        Title: "Recipient Number",
                        Icon: "phone",
                        Select: contacts,
                        SearchSelect: true,
                    },
                },
                {
                    Id: "Amount",
                    Type: "TextField",
                    Data: {
                        Title: `Amount (Max: ${owned})`,
                        Icon: "hashtag",
                        Type: "number",
                        Max: owned,
                    },
                },
            ],
            OnSubmit: (Result) => {
                const amount = parseFloat(Result.Amount);
                if (!amount || amount <= 0) return;
                if (!Result.Phone) return;

                LoaderModal.set(true);
                // The transfer event expects 'Id' as index in config... this is a legacy quirky limitation of the server script
                // Server: local Crypto = Config.Crypto[tonumber(Data.Id)]
                // We need to find the index of this crypto in the array.
                // Assuming 'cryptos' array order matches server Config.Crypto order which it usually does if sent directly.
                // A safer way would be if server script accepted string ID, but based on reading it accepts Index.
                // Let's retry analyzing sv_crypto.lua ... "local Crypto = Config.Crypto[tonumber(Data.Id)]" -> Yes it uses index.
                // WE MUST FIND THE INDEX.

                // Correction: In original Crypto.svelte: `TransferCrypto(Id + 1, Data);` inside `#each FilteredWallets as Data, Id`
                // Svelte #each index is 0-based, server lua arrays are 1-based.
                // So we need the index of the crypto in the list + 1.

                const cryptoIndex = cryptos.findIndex(
                    (c) => c.Id === crypto.Id,
                );
                if (cryptoIndex === -1) {
                    LoaderModal.set(false);
                    return;
                }

                SendEvent(
                    "Crypto/TransferCrypto",
                    {
                        Id: cryptoIndex + 1,
                        Phone: Result.Phone,
                        Amount: amount,
                    },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (Success && Data.Success) {
                            ShowSuccessModal();
                            fetchCryptoData();
                        } else {
                            InputModal.set({
                                Visible: true,
                                Inputs: [
                                    {
                                        Type: "Text",
                                        Text: Data?.Msg || "Transaction Failed",
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
                    },
                );
            },
        });
    };

    // --- Icon Mapping ---
    // FontAwesome 5 helper (or just use class strings directly)
    const getIcon = (name) => {
        // Map common names if needed, or just pass through
        return `fas fa-${name}`;
    };
</script>

<AppWrapper>
    <div class="crypto-app">
        <!-- Header / Portfolio -->
        <div class="header">
            <div class="portfolio-title">Total Balance</div>
            <div class="portfolio-value">
                {FormatCurrency.format(portfolioValue)}
            </div>
        </div>

        <!-- Navigation -->
        <div class="nav-tabs">
            <button
                class="tab {activeTab === 'market' ? 'active' : ''}"
                on:click={() => {
                    activeTab = "market";
                    selectedCrypto = null;
                }}
            >
                Market
            </button>
            <button
                class="tab {activeTab === 'wallet' ? 'active' : ''}"
                on:click={() => {
                    activeTab = "wallet";
                    selectedCrypto = null;
                }}
            >
                Wallet
            </button>
        </div>

        <!-- Main Content -->
        <div class="content-area">
            {#if activeTab === "market"}
                <div class="list">
                    {#each cryptos as crypto}
                        <div class="crypto-item">
                            <div class="crypto-icon">
                                <i class={getIcon(crypto.Icon)}></i>
                            </div>
                            <div class="crypto-info">
                                <div class="crypto-name">
                                    {crypto.Label} ({crypto.Id})
                                </div>
                                <div class="crypto-price">
                                    {FormatCurrency.format(crypto.Costs)}
                                </div>
                            </div>
                            <div class="crypto-actions">
                                {#if crypto.Purchasable}
                                    <button
                                        class="btn-buy"
                                        on:click={() => handleBuy(crypto)}
                                        >Buy</button
                                    >
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {:else if activeTab === "wallet"}
                <div class="list">
                    {#each cryptos as crypto}
                        {#if ($PlayerData.Crypto[crypto.Id] || 0) > 0}
                            <div class="crypto-item">
                                <div class="crypto-icon">
                                    <i class={getIcon(crypto.Icon)}></i>
                                </div>
                                <div class="crypto-info">
                                    <div class="crypto-name">
                                        {crypto.Label}
                                    </div>
                                    <div class="crypto-held">
                                        Owned: {$PlayerData.Crypto[crypto.Id]}
                                    </div>
                                </div>
                                <div class="crypto-actions-group">
                                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                                    <div
                                        class="action-btn transfer"
                                        on:click={() => handleTransfer(crypto)}
                                    >
                                        <i class="fas fa-paper-plane"></i>
                                    </div>
                                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                                    <div
                                        class="action-btn sell"
                                        on:click={() => handleSell(crypto)}
                                    >
                                        <i class="fas fa-dollar-sign"></i>
                                    </div>
                                </div>
                            </div>
                        {/if}
                    {/each}
                    {#if cryptos.every((c) => ($PlayerData.Crypto[c.Id] || 0) <= 0)}
                        <div class="empty-state">
                            <i class="fas fa-wallet"></i>
                            <p>No crypto assets found.</p>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</AppWrapper>

<style>
    .crypto-app {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: radial-gradient(circle at top right, #1a1a2e, #16213e);
        color: white;
        font-family: "Roboto", sans-serif;
        overflow: hidden;
    }

    /* Header */
    .header {
        padding: 3vh 2vh;
        background: rgba(40, 40, 50, 0.95);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        text-align: center;
        flex-shrink: 0;
    }

    .portfolio-title {
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.6);
        text-transform: uppercase;
        letter-spacing: 0.1vh;
    }

    .portfolio-value {
        font-size: 3.5vh;
        font-weight: 700;
        margin-top: 0.5vh;
        background: linear-gradient(to right, #4facfe 0%, #00f2fe 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    /* Navigation */
    .nav-tabs {
        display: flex;
        padding: 1.5vh 2vh;
        gap: 1.5vh;
        flex-shrink: 0;
    }

    .tab {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border: none;
        padding: 1vh;
        border-radius: 1vh;
        color: rgba(255, 255, 255, 0.6);
        font-size: 1.4vh;
        cursor: pointer;
        transition: all 0.2s;
        border: 1px solid transparent;
    }

    .tab.active {
        background: rgba(79, 172, 254, 0.2);
        color: #4facfe;
        border-color: rgba(79, 172, 254, 0.3);
        box-shadow: 0 0 1vh rgba(79, 172, 254, 0.2);
    }

    /* Content */
    .content-area {
        flex: 1;
        overflow-y: auto;
        padding: 0 2vh 2vh 2vh;
    }

    .content-area::-webkit-scrollbar {
        width: 0.4vh;
    }
    .content-area::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 0.2vh;
    }

    /* List Items */
    .list {
        display: flex;
        flex-direction: column;
        gap: 1.5vh;
    }

    .crypto-item {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.05);
        padding: 1.5vh;
        border-radius: 1.5vh;
        border: 1px solid rgba(255, 255, 255, 0.05);
        transition: transform 0.1s;
    }

    .crypto-item:active {
        transform: scale(0.98);
    }

    .crypto-icon {
        width: 4.5vh;
        height: 4.5vh;
        border-radius: 50%;
        background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.1),
            rgba(255, 255, 255, 0.05)
        );
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2vh;
        margin-right: 1.5vh;
        color: #fff;
        box-shadow: 0 0.5vh 1vh rgba(0, 0, 0, 0.2);
    }

    .crypto-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .crypto-name {
        font-weight: 600;
        font-size: 1.5vh;
        color: white;
    }

    .crypto-price,
    .crypto-held {
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 0.2vh;
    }

    /* Buttons inside items */
    .btn-buy {
        background: #4facfe;
        color: #1a1a2e;
        border: none;
        padding: 0.8vh 2vh;
        border-radius: 2vh;
        font-weight: 600;
        font-size: 1.3vh;
        cursor: pointer;
        box-shadow: 0 0.5vh 1.5vh rgba(79, 172, 254, 0.3);
    }

    .crypto-actions-group {
        display: flex;
        gap: 1vh;
    }

    .action-btn {
        width: 3.5vh;
        height: 3.5vh;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4vh;
        cursor: pointer;
        transition: filter 0.2s;
    }

    .action-btn.transfer {
        background: rgba(255, 255, 255, 0.1);
        color: white;
    }

    .action-btn.sell {
        background: rgba(255, 80, 80, 0.2);
        color: #ff5050;
    }

    .action-btn:active {
        filter: brightness(0.8);
    }

    /* Empty State */
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 5vh;
        opacity: 0.5;
    }

    .empty-state i {
        font-size: 4vh;
        margin-bottom: 2vh;
    }

    .empty-state p {
        font-size: 1.4vh;
    }
</style>
