<script>
    import { onMount } from "svelte";
    import {
        FormatPhone,
        OnEvent,
        SendEvent,
        ShowSuccessModal,
    } from "../../../utils/Utils";
    import { InputModal, LoaderModal, PlayerData } from "../phone.stores";
    import AppWrapper from "../components/AppWrapper.svelte";

    let MyAd;
    let Ads = [];
    let FilteredAds = [];
    let ShowingLimit = 100;
    let SearchQuery = "";

    const FilterAds = () => {
        const Query = SearchQuery.toLowerCase();
        FilteredAds = Ads.filter(
            (Val) =>
                Val.Cid != $PlayerData.Cid &&
                (Val.Msg.toLowerCase().includes(Query) ||
                    Val.Sender.toLowerCase().includes(Query)),
        );
    };

    const LoadMore = () => {
        ShowingLimit = ShowingLimit + 100;
    };

    const PostAd = () => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Message",
                    Type: "TextArea",
                    Data: {
                        Title: "Advertisement",
                        Label: "Enter your ad content...",
                    },
                },
                {
                    Id: "Image",
                    Type: "ImagePicker",
                    Data: {
                        Title: "Attach Photo (optional)",
                        Icon: "image",
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (Result.Message.length <= 0) return;
                LoaderModal.set(true);
                SendEvent(
                    "YellowPages/PostAd",
                    { Msg: Result.Message, Image: Result.Image || null },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        if (Data) ShowSuccessModal();
                    },
                );
            },
        });
    };

    const DeleteAd = () => {
        LoaderModal.set(true);
        SendEvent("YellowPages/RemoveAd", {}, (Success, Data) => {
            LoaderModal.set(false);
            if (!Success) return;
            if (Data) ShowSuccessModal();
        });
    };

    const CallAdvertiser = (Phone) => {
        SendEvent("Contacts/Call", { Phone });
    };

    onMount(() => {
        SendEvent("YellowPages/GetPosts", {}, (Success, Data) => {
            if (!Success) return;

            Ads = Data.reverse();
            FilteredAds = Ads;
            MyAd = Ads.filter((Val) => Val.Cid == $PlayerData.Cid)[0];
            FilterAds();
        });
    });

    OnEvent("YellowPages/SetPosts", (Data) => {
        Ads = Data.Posts.reverse();
        FilteredAds = Ads;
        MyAd = Ads.filter((Val) => Val.Cid == $PlayerData.Cid)[0];
        FilterAds();
    });
</script>

<AppWrapper>
    <div class="yp-container">
        <div class="yp-header">
            <div class="yp-title">Yellow Pages</div>
            <div class="yp-search-wrapper">
                <i class="fas fa-search"></i>
                <input
                    type="text"
                    placeholder="Search posts..."
                    bind:value={SearchQuery}
                    on:input={FilterAds}
                />
            </div>
        </div>

        <div class="yp-content">
            {#if MyAd}
                <div class="yp-card my-ad">
                    <div class="yp-card-header">
                        <span class="yp-sender">My Advertisement</span>
                        <div class="yp-actions">
                            <button
                                class="yp-action-btn delete"
                                on:click={DeleteAd}
                                data-tooltip="Delete Ad"
                            >
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="yp-message">{MyAd.Msg}</div>
                    {#if MyAd.Image}
                        <div class="yp-image">
                            <img
                                src={MyAd.Image}
                                alt="Ad attachment"
                                loading="lazy"
                                referrerpolicy="no-referrer"
                            />
                        </div>
                    {/if}
                </div>
            {/if}

            {#if FilteredAds.length === 0 && !MyAd}
                <div class="yp-empty">
                    <i class="fas fa-ad"></i>
                    <span>No advertisements found</span>
                </div>
            {/if}

            {#each FilteredAds.slice(0, ShowingLimit) as Data}
                <div class="yp-card">
                    <div class="yp-card-header">
                        <span class="yp-sender">{Data.Sender}</span>
                        <div class="yp-actions">
                            <button
                                class="yp-action-btn call"
                                on:click={() => CallAdvertiser(Data.Phone)}
                                data-tooltip="Call"
                            >
                                <i class="fas fa-phone"></i>
                            </button>
                        </div>
                    </div>
                    <div class="yp-message">{Data.Msg}</div>
                    {#if Data.Image}
                        <div class="yp-image">
                            <img
                                src={Data.Image}
                                alt="Ad attachment"
                                loading="lazy"
                                referrerpolicy="no-referrer"
                            />
                        </div>
                    {/if}
                    <div class="yp-number">{FormatPhone(Data.Phone)}</div>
                </div>
            {/each}

            {#if FilteredAds.length > ShowingLimit}
                <div class="yp-load-more">
                    <button on:click={LoadMore}>Load More</button>
                </div>
            {/if}
        </div>

        {#if !MyAd}
            <button class="yp-fab" on:click={PostAd} data-tooltip="Post Ad">
                <i class="fas fa-plus"></i>
            </button>
        {/if}
    </div>
</AppWrapper>

<style>
    .yp-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background-color: #121212;
        color: white;
        font-family: "Inter", sans-serif;
        position: relative;
        overflow: hidden;
    }

    .yp-header {
        padding: 2vh 2vh 1vh;
        background: linear-gradient(
            180deg,
            #121212 0%,
            rgba(18, 18, 18, 0.95) 100%
        );
        z-index: 10;
    }

    .yp-title {
        font-size: 2.8vh;
        font-weight: 700;
        margin-bottom: 1.5vh;
        color: #00ff9d;
        letter-spacing: -0.05vh;
    }

    .yp-search-wrapper {
        position: relative;
        width: 100%;
        margin-bottom: 1vh;
    }

    .yp-search-wrapper i {
        position: absolute;
        left: 1.5vh;
        top: 50%;
        transform: translateY(-50%);
        color: #666;
        font-size: 1.4vh;
    }

    .yp-search-wrapper input {
        width: 100%;
        background: #1e1e1e;
        border: 0.1vh solid #333;
        border-radius: 1.2vh;
        padding: 1.2vh 1.5vh 1.2vh 4.5vh;
        color: white;
        font-size: 1.4vh;
        outline: none;
        transition: all 0.2s;
    }

    .yp-search-wrapper input:focus {
        border-color: #00ff9d;
        box-shadow: 0 0 1vh rgba(0, 255, 157, 0.1);
    }

    .yp-content {
        flex: 1;
        overflow-y: auto;
        padding: 0 2vh 8vh; /* Bottom padding for FAB */
    }

    .yp-content::-webkit-scrollbar {
        width: 0.4vh;
    }

    .yp-content::-webkit-scrollbar-thumb {
        background: #333;
        border-radius: 0.2vh;
    }

    .yp-card {
        background: #1e1e1e;
        border-radius: 1.5vh;
        padding: 1.8vh;
        margin-bottom: 1.5vh;
        border: 0.1vh solid #2a2a2a;
        transition:
            transform 0.2s,
            border-color 0.2s;
    }

    .yp-card:hover {
        transform: translateY(-0.2vh);
        border-color: #333;
    }

    .yp-card.my-ad {
        border: 0.1vh solid rgba(0, 255, 157, 0.3);
        background: linear-gradient(135deg, #1e1e1e 0%, #15251f 100%);
    }

    .yp-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1vh;
    }

    .yp-sender {
        font-weight: 600;
        font-size: 1.6vh;
        color: #e0e0e0;
    }

    .my-ad .yp-sender {
        color: #00ff9d;
    }

    .yp-message {
        font-size: 1.4vh;
        color: #aaa;
        line-height: 1.4;
        word-wrap: break-word;
        margin-bottom: 0.5vh;
    }

    .yp-number {
        font-size: 1.1vh;
        color: #555;
        margin-top: 1vh;
        text-align: right;
    }

    .yp-action-btn {
        background: rgba(255, 255, 255, 0.05);
        border: none;
        color: white;
        width: 3.5vh;
        height: 3.5vh;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 1.4vh;
    }

    .yp-action-btn.call {
        color: #00ff9d;
        background: rgba(0, 255, 157, 0.1);
    }

    .yp-action-btn.call:hover {
        background: #00ff9d;
        color: #121212;
    }

    .yp-action-btn.delete {
        color: #ff4d4d;
        background: rgba(255, 77, 77, 0.1);
    }

    .yp-action-btn.delete:hover {
        background: #ff4d4d;
        color: white;
    }

    .yp-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 20vh;
        color: #444;
        margin-top: 5vh;
    }

    .yp-empty i {
        font-size: 4vh;
        margin-bottom: 1.5vh;
        opacity: 0.5;
    }

    .yp-empty span {
        font-size: 1.4vh;
    }

    .yp-load-more {
        display: flex;
        justify-content: center;
        margin-top: 1vh;
    }

    .yp-load-more button {
        background: #1e1e1e;
        border: 0.1vh solid #333;
        color: #888;
        padding: 1vh 2vh;
        border-radius: 2vh;
        font-size: 1.2vh;
        cursor: pointer;
        transition: all 0.2s;
    }

    .yp-load-more button:hover {
        color: white;
        border-color: #555;
    }

    .yp-fab {
        position: absolute;
        bottom: 3vh;
        right: 3vh;
        width: 6vh;
        height: 6vh;
        border-radius: 50%;
        background: #00ff9d;
        border: none;
        color: #121212;
        font-size: 2.2vh;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0.5vh 2vh rgba(0, 255, 157, 0.3);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        z-index: 20;
    }

    .yp-fab:hover {
        transform: scale(1.1) translateY(-0.5vh);
        box-shadow: 0 1vh 3vh rgba(0, 255, 157, 0.4);
    }

    .yp-fab:active {
        transform: scale(0.9);
    }

    /* Ad Image Styles */
    .yp-image {
        margin-top: 1.2vh;
        border-radius: 1vh;
        overflow: hidden;
        border: 0.1vh solid #333;
    }

    .yp-image img {
        width: 100%;
        height: auto;
        max-height: 20vh;
        object-fit: cover;
        display: block;
    }
</style>
