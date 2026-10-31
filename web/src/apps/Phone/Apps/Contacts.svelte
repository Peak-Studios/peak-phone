<script>
    import "../components/Misc.css";
    import { onMount, onDestroy } from "svelte";
    import { fade, fly, slide, scale } from "svelte/transition";
    import { quintOut } from "svelte/easing";
    import {
        CopyToClipboard,
        ExtractImageUrls,
        FormatPhone,
        GetContactsSelect,
        OnEvent,
        SendEvent,
        ShowSuccessModal,
    } from "../../../utils/Utils";
    import { InputModal, LoaderModal, PlayerData } from "../phone.stores";
    import AppWrapper from "../components/AppWrapper.svelte";
    import Empty from "../components/Empty.svelte";

    // --- State ---
    let Contacts = [];
    let FilteredContacts = [];
    let GroupedContacts = {};
    let Suggestions = [];
    let MyProfile = { avatar: "" };

    let SearchQuery = "";
    let SelectedContact = null;
    let ViewState = "list"; // 'list', 'details', 'mycard'

    // AirShare State
    let AirShareActive = false;
    let NearbyPlayers = [];
    let IsScanning = false;
    let IncomingAirShare = null;

    let ShowingLimit = 100;

    // Mission 3: Team management state
    let Mission3State = { canInvite: false, canKick: false };

    // --- Reactivity ---
    $: {
        if (SearchQuery) {
            let Query = SearchQuery.toLowerCase();
            FilteredContacts = Contacts.filter(
                (Val) =>
                    Val.phone.toLowerCase().includes(Query) ||
                    Val.name.toLowerCase().includes(Query),
            );
        } else {
            FilteredContacts = Contacts;
        }
        GroupContacts(FilteredContacts);
    }

    const GroupContacts = (data) => {
        let groups = {};
        let sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));

        sorted.forEach((contact) => {
            let firstLetter = contact.name.charAt(0).toUpperCase();
            if (!/[A-Z]/.test(firstLetter)) firstLetter = "#";

            if (!groups[firstLetter]) groups[firstLetter] = [];
            groups[firstLetter].push(contact);
        });

        const ordered = {};
        Object.keys(groups)
            .sort((a, b) => {
                if (a === "#") return 1;
                if (b === "#") return -1;
                return a.localeCompare(b);
            })
            .forEach((key) => {
                ordered[key] = groups[key];
            });

        GroupedContacts = ordered;
    };

    // --- Helpers ---
    const GetInitials = (Name) => {
        if (!Name) return "#";
        return Name.split(" ")
            .map((x) => x[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();
    };

    const GetAvatarStyle = (url) => {
        if (url) return `background-image: url(${url})`;
        return `background: rgba(255, 255, 255, 0.1)`;
    };

    // Mission 3: Check if contact can be invited/kicked
    const CheckMission3Eligibility = (contact) => {
        console.log("Checking M3 Eligibility for:", contact?.phone);
        if (!contact || !contact.phone) {
            Mission3State = { canInvite: false, canKick: false };
            return;
        }
        SendEvent(
            "Contacts/CheckMission3Invite",
            { phone: contact.phone },
            (Success, Data) => {
                console.log(
                    "M3 Eligibility Result:",
                    Success,
                    JSON.stringify(Data),
                );
                if (Success && Data) {
                    Mission3State = Data;
                } else {
                    Mission3State = { canInvite: false, canKick: false };
                }
            },
        );
    };

    // Mission 3: Invite contact to mission
    const InviteToMission3 = (contact) => {
        if (!contact || !contact.phone) return;
        SendEvent("Contacts/InviteToMission3", { phone: contact.phone });
        Mission3State = { canInvite: false, canKick: false };
    };

    // Mission 3: Kick contact from team
    const KickFromMission3 = (contact) => {
        if (!contact || !contact.phone) return;
        SendEvent("Contacts/KickFromMission3", { phone: contact.phone });
        Mission3State = { canInvite: false, canKick: false };
    };

    // --- Actions ---
    const AddContact = (Data = {}, IsSuggestion = false) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Name",
                    Type: "TextField",
                    Data: {
                        Title: "Full Name",
                        Icon: "user",
                        Value: Data?.Name || "",
                    },
                },
                {
                    Id: "Phone",
                    Type: "TextField",
                    IsPhone: true,
                    Data: {
                        Title: "Number",
                        Icon: "phone",
                        Type: "number",
                        Value: Data?.Phone || "",
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (Result.Name.length <= 0) return;
                if (Result.Phone.length <= 0) return;

                LoaderModal.set(true);
                SendEvent(
                    "Contacts/CreateContact",
                    { ...Result, IsSuggestion, SuggestionId: Data.Id },
                    (Success) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        ShowSuccessModal();
                    },
                );
            },
        });
    };

    const EditContact = (Data) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Name",
                    Type: "TextField",
                    Data: {
                        Title: "Full Name",
                        Icon: "user",
                        Value: Data.name,
                    },
                },
                {
                    Id: "Phone",
                    Type: "TextField",
                    IsPhone: true,
                    Data: {
                        Title: "Number",
                        Icon: "phone",
                        Type: "number",
                        Value: Data.phone,
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (Result.Name.length <= 0) return;
                if (Result.Phone.length <= 0) return;

                LoaderModal.set(true);
                SendEvent(
                    "Contacts/EditContact",
                    { ...Result, Id: Data.id },
                    (Success) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        SelectedContact = {
                            ...SelectedContact,
                            ...Result,
                            name: Result.Name,
                            phone: Result.Phone,
                        };
                        ShowSuccessModal();
                    },
                );
            },
        });
    };

    const DeleteContact = (Data) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Type: "Text",
                    Text: "Delete this contact permanently?",
                    Data: {
                        style: "margin: 2vh 0; text-align: center; color: #ff6b6b; font-weight: 500;",
                    },
                },
            ],
            OnSubmit: () => {
                LoaderModal.set(true);
                SendEvent(
                    "Contacts/DeleteContact",
                    { ContactId: Data.id },
                    (Success) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        SelectedContact = null;
                        ViewState = "list";
                        ShowSuccessModal();
                    },
                );
            },
        });
    };

    const CallContact = (Data) => {
        SendEvent("Contacts/Call", { Phone: Data.phone });
    };

    const MessageContact = async (Data) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Message",
                    Type: "TextArea",
                    Data: { Title: "Message " + Data.name },
                },
            ],
            OnSubmit: (Result) => {
                if (Result.Message.length <= 0) return;
                let [Attachments, Message] = ExtractImageUrls(Result.Message);
                LoaderModal.set(true);
                SendEvent(
                    "Messages/SendMessage",
                    { Phone: Data.phone, Attachments, Message },
                    (Success) => {
                        LoaderModal.set(false);
                        if (Success) ShowSuccessModal();
                    },
                );
            },
        });
    };

    // --- My Card / Profile ---
    const UpdateProfile = () => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Avatar",
                    Type: "TextField",
                    Data: {
                        Title: "Avatar URL",
                        Icon: "image",
                        Value: MyProfile.avatar || "",
                    },
                },
            ],
            OnSubmit: (Result) => {
                LoaderModal.set(true);
                SendEvent(
                    "Contacts/UpdateProfile",
                    { avatar: Result.Avatar },
                    () => {
                        LoaderModal.set(false);
                        MyProfile.avatar = Result.Avatar;
                        ShowSuccessModal();
                    },
                );
            },
        });
    };

    // --- AirShare Logic ---
    const StartAirShare = async () => {
        AirShareActive = true;
        IsScanning = true;
        NearbyPlayers = [];
        setTimeout(() => {
            SendEvent("Contacts/GetNearbyPlayers", {}, (Success, Data) => {
                IsScanning = false;
                if (Success && Array.isArray(Data)) NearbyPlayers = Data;
                else NearbyPlayers = [];
            });
        }, 1500);
    };

    const SendAirShare = (TargetSource) => {
        let contactPayload = {};
        if (ViewState === "mycard") {
            contactPayload = {
                name: $PlayerData.CharName,
                phone: $PlayerData.PhoneNumber,
                avatar: MyProfile.avatar,
            };
        } else if (SelectedContact) {
            contactPayload = {
                name: SelectedContact.name,
                phone: SelectedContact.phone,
                avatar: SelectedContact.avatar,
            };
        }
        SendEvent(
            "Contacts/RequestAirShare",
            { TargetSource: TargetSource, Contact: contactPayload },
            () => {
                AirShareActive = false;
                ShowSuccessModal();
            },
        );
    };

    const AcceptAirShare = () => {
        if (!IncomingAirShare) return;
        SendEvent(
            "Contacts/CreateContact",
            {
                Name: IncomingAirShare.Contact.name,
                Phone: IncomingAirShare.Contact.phone,
                IsSuggestion: false,
            },
            (Success) => {
                IncomingAirShare = null;
                if (Success) ShowSuccessModal();
            },
        );
    };

    const DeclineAirShare = () => (IncomingAirShare = null);

    // --- Lifecycle ---
    onMount(() => {
        SendEvent("Contacts/GetContacts", {}, (Success, Data) => {
            if (Success) Contacts = Data;
        });
        SendEvent("Contacts/GetSuggestions", {}, (Success, Data) => {
            if (Success) Suggestions = Data;
        });
        SendEvent("Contacts/GetProfile", {}, (Data) => {
            if (Data && Data.avatar) MyProfile = Data;
        });
    });

    OnEvent("Contacts/SetContacts", (Data) => (Contacts = Data.Contacts));
    OnEvent(
        "Contacts/ReceiveAirShare",
        (EventData) =>
            (IncomingAirShare =
                EventData && EventData.Data ? EventData.Data : EventData),
    );
</script>

<AppWrapper>
    <div class="glass-container">
        <!-- BACKGROUND DEEP BLUR -->
        <div class="glass-bg"></div>

        <!-- HEADER -->
        <div class="glass-header">
            <div class="gh-title">Contacts</div>
            <div class="gh-add" on:click={() => AddContact()}>
                <i class="fas fa-plus"></i>
            </div>
        </div>

        <!-- SCROLL AREA -->
        <div class="glass-scroll">
            <!-- SEARCH -->
            <div class="search-wrap">
                <div class="glass-search">
                    <i class="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search..."
                        bind:value={SearchQuery}
                    />
                </div>
            </div>

            <!-- MY CARD -->
            {#if !SearchQuery}
                <div
                    class="my-card-glass"
                    on:click={() => (ViewState = "mycard")}
                >
                    <div class="mcg-content">
                        <div
                            class="mcg-avatar"
                            style={GetAvatarStyle(MyProfile.avatar)}
                        >
                            {#if !MyProfile.avatar}ME{/if}
                        </div>
                        <div class="mcg-info">
                            <div class="mcg-name">{$PlayerData.CharName}</div>
                            <div class="mcg-sub">My Card</div>
                        </div>
                    </div>
                    <div class="mcg-action">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
            {/if}

            <!-- SUGGESTIONS -->
            {#if Suggestions.length > 0 && !SearchQuery}
                <div class="sub-label">Suggestions</div>
                <div class="glass-suggestions">
                    {#each Suggestions as s}
                        <div
                            class="gs-pill"
                            on:click={() => AddContact(s, true)}
                        >
                            <i class="fas fa-plus"></i>
                            {s.Name}
                        </div>
                    {/each}
                </div>
            {/if}

            <!-- LIST -->
            {#if Object.keys(GroupedContacts).length === 0}
                <div class="glass-empty">
                    <i class="far fa-address-book"></i>
                    <span>Your list is empty</span>
                </div>
            {:else}
                <div class="contact-list-body">
                    {#each Object.entries(GroupedContacts) as [letter, group]}
                        <div class="gl-marker">{letter}</div>
                        {#each group as contact}
                            <div
                                class="glass-row"
                                on:click={() => {
                                    SelectedContact = contact;
                                    ViewState = "details";
                                    CheckMission3Eligibility(contact);
                                }}
                            >
                                <div
                                    class="gr-avatar"
                                    style={GetAvatarStyle(contact.avatar)}
                                >
                                    {#if !contact.avatar}{GetInitials(
                                            contact.name,
                                        )}{/if}
                                </div>
                                <div class="gr-info">
                                    <div class="gr-name">{contact.name}</div>
                                </div>
                            </div>
                        {/each}
                    {/each}
                </div>
            {/if}

            <div class="safe-padding"></div>
        </div>

        <!-- DETAILS OVERLAY -->
        {#if ViewState === "details" && SelectedContact}
            <div
                class="glass-overlay"
                in:fly={{ y: 50, duration: 400 }}
                out:fly={{ y: 50, duration: 300 }}
            >
                <div class="go-header">
                    <div class="go-back" on:click={() => (ViewState = "list")}>
                        <i class="fas fa-arrow-left"></i> Contacts
                    </div>
                    <div
                        class="go-edit"
                        on:click={() => EditContact(SelectedContact)}
                    >
                        Edit
                    </div>
                </div>

                <div class="go-body">
                    <div class="profile-center">
                        <div
                            class="pc-avatar"
                            style={GetAvatarStyle(SelectedContact.avatar)}
                        >
                            {#if !SelectedContact.avatar}{GetInitials(
                                    SelectedContact.name,
                                )}{/if}
                        </div>
                        <div class="pc-name">{SelectedContact.name}</div>
                        <div class="pc-phone">
                            {FormatPhone(SelectedContact.phone)}
                        </div>
                    </div>

                    <div class="actions-row">
                        <div
                            class="glass-btn"
                            on:click={() => MessageContact(SelectedContact)}
                        >
                            <i class="fas fa-comment"></i>
                        </div>
                        <div
                            class="glass-btn"
                            on:click={() => CallContact(SelectedContact)}
                        >
                            <i class="fas fa-phone"></i>
                        </div>
                        <div class="glass-btn" on:click={() => StartAirShare()}>
                            <i class="fas fa-share-alt"></i>
                        </div>
                        <div
                            class="glass-btn danger"
                            on:click={() => DeleteContact(SelectedContact)}
                        >
                            <i class="fas fa-trash"></i>
                        </div>
                    </div>

                    <!-- Mission 3: Team Management Buttons -->
                    {#if Mission3State.canInvite}
                        <div class="actions-row single">
                            <div
                                class="glass-btn wide"
                                on:click={() =>
                                    InviteToMission3(SelectedContact)}
                            >
                                <i class="fas fa-user-plus"></i>
                                <span>Invite to Mission</span>
                            </div>
                        </div>
                    {:else if Mission3State.canKick}
                        <div class="actions-row single">
                            <div
                                class="glass-btn wide danger"
                                on:click={() =>
                                    KickFromMission3(SelectedContact)}
                            >
                                <i class="fas fa-user-minus"></i>
                                <span>Kick from Team</span>
                            </div>
                        </div>
                    {/if}

                    <div class="info-glass-box">
                        <div class="igb-row">
                            <span class="igb-label">Mobile</span>
                            <span class="igb-value"
                                >{FormatPhone(SelectedContact.phone)}</span
                            >
                        </div>
                        <div class="igb-sep"></div>
                        <div class="igb-row">
                            <span class="igb-label">Notes</span>
                            <span class="igb-value dimmed">Add notes...</span>
                        </div>
                    </div>
                </div>
            </div>
        {:else if ViewState === "mycard"}
            <div
                class="glass-overlay"
                in:fly={{ y: 50, duration: 400 }}
                out:fly={{ y: 50, duration: 300 }}
            >
                <div class="go-header">
                    <div class="go-back" on:click={() => (ViewState = "list")}>
                        Done
                    </div>
                </div>
                <div class="go-body">
                    <div class="profile-center">
                        <div
                            class="pc-avatar"
                            style={GetAvatarStyle(MyProfile.avatar)}
                        >
                            {#if !MyProfile.avatar}ME{/if}
                        </div>
                        <div class="edit-text" on:click={UpdateProfile}>
                            Change Photo
                        </div>
                        <div class="pc-name">{$PlayerData.CharName}</div>
                        <div class="pc-phone">
                            {FormatPhone($PlayerData.PhoneNumber)}
                        </div>
                    </div>

                    <div class="actions-row single">
                        <div
                            class="glass-btn wide"
                            on:click={() => StartAirShare()}
                        >
                            <i class="fas fa-broadcast-tower"></i>
                            <span>Tap to AirShare</span>
                        </div>
                    </div>
                </div>
            </div>
        {/if}

        <!-- AIRSHARE CENTER MODAL -->
        {#if AirShareActive}
            <div class="blur-backdrop" transition:fade>
                <div
                    class="glass-modal"
                    transition:scale={{ start: 0.95, duration: 300 }}
                >
                    <div class="gm-head">
                        <span>AirShare</span>
                        <div
                            class="gm-close"
                            on:click={() => (AirShareActive = false)}
                        >
                            <i class="fas fa-times"></i>
                        </div>
                    </div>

                    <div class="gm-body">
                        {#if IsScanning}
                            <div class="pulse-loader">
                                <div class="pulse-ring"></div>
                                <span>Scanning...</span>
                            </div>
                        {:else if NearbyPlayers.length > 0}
                            <div class="gm-list">
                                {#each NearbyPlayers as player}
                                    <div
                                        class="gm-item"
                                        on:click={() =>
                                            SendAirShare(player.Source)}
                                    >
                                        <div
                                            class="gmi-avatar"
                                            style={GetAvatarStyle(
                                                player.Avatar,
                                            )}
                                        ></div>
                                        <div class="gmi-name">
                                            {player.Name}
                                        </div>
                                        <i class="fas fa-share gmi-icon"></i>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <div class="gm-empty">No devices found nearby</div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}

        <!-- INCOMING NOTIFICATION -->
        {#if IncomingAirShare}
            <div
                class="float-notification"
                in:fly={{ y: -50 }}
                out:fly={{ y: -50 }}
            >
                <div
                    class="fn-avatar"
                    style={GetAvatarStyle(IncomingAirShare.SenderAvatar)}
                ></div>
                <div class="fn-content">
                    <div class="fn-top">AirShare Request</div>
                    <div class="fn-bot">
                        <b>{IncomingAirShare.SenderName}</b> shared a contact
                    </div>
                </div>
                <div class="fn-actions">
                    <div class="fn-btn yes" on:click={AcceptAirShare}>
                        Accept
                    </div>
                    <div class="fn-btn no" on:click={DeclineAirShare}>
                        Decline
                    </div>
                </div>
            </div>
        {/if}
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

    /* SCROLL & LAYOUT */
    .glass-header {
        position: relative;
        z-index: 2;
        padding: 5vh 2.5vh 2vh 2.5vh;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .gh-title {
        font-size: 3.2vh;
        font-weight: 300;
        letter-spacing: -0.5px;
        opacity: 0.9;
    }
    .gh-add {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: rgba(40, 40, 50, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.8vh;
        cursor: pointer;
        transition: background 0.2s;
    }
    .gh-add:active {
        background: rgba(255, 255, 255, 0.25);
    }

    .glass-scroll {
        position: relative;
        z-index: 1;
        flex: 1;
        height: 88%;
        overflow-y: auto;
        padding: 0 2vh;
    }
    .glass-scroll::-webkit-scrollbar {
        display: none;
    }
    .safe-padding {
        height: 10vh;
        width: 100%;
    }

    /* COMPONENTS */
    .search-wrap {
        margin-bottom: 2vh;
    }
    .glass-search {
        background: rgba(40, 40, 50, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 1.5vh;
        height: 4.5vh;
        display: flex;
        align-items: center;
        padding: 0 1.5vh;
        gap: 1vh;
    }
    .glass-search i {
        font-size: 1.6vh;
        opacity: 0.5;
    }
    .glass-search input {
        background: transparent;
        border: none;
        outline: none;
        color: #fff;
        font-size: 1.6vh;
        width: 100%;
        font-weight: 300;
        font-family: inherit;
    }

    .my-card-glass {
        background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.1) 0%,
            rgba(255, 255, 255, 0.03) 100%
        );
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 2vh;
        padding: 1.5vh 2vh;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 3vh;
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
        cursor: pointer;
    }
    .mcg-content {
        display: flex;
        align-items: center;
        gap: 1.5vh;
    }
    .mcg-avatar {
        width: 5vh;
        height: 5vh;
        border-radius: 50%;
        background-size: cover;
        background-position: center;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5vh;
        font-weight: 600;
        border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .mcg-name {
        font-size: 1.8vh;
        font-weight: 500;
    }
    .mcg-sub {
        font-size: 1.3vh;
        opacity: 0.6;
    }
    .mcg-action i {
        font-size: 1.4vh;
        opacity: 0.4;
    }

    .sub-label {
        font-size: 1.3vh;
        opacity: 0.5;
        margin-bottom: 1vh;
        margin-left: 0.5vh;
    }
    .glass-suggestions {
        display: flex;
        gap: 1vh;
        overflow-x: auto;
        margin-bottom: 2vh;
        padding-bottom: 0.5vh;
    }
    .gs-pill {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 0.8vh 1.5vh;
        border-radius: 2vh;
        font-size: 1.4vh;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 0.8vh;
        cursor: pointer;
    }

    .contact-list-body {
        display: flex;
        flex-direction: column;
        gap: 0.8vh;
    }
    .gl-marker {
        font-size: 1.3vh;
        font-weight: 600;
        color: #7a7aff;
        margin-top: 1vh;
        margin-left: 1vh;
        opacity: 0.8;
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
    .gr-avatar {
        width: 4.5vh;
        height: 4.5vh;
        border-radius: 1.5vh;
        background-color: rgba(255, 255, 255, 0.05);
        background-size: cover;
        background-position: center;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6vh;
    }
    .gr-name {
        font-size: 1.7vh;
        font-weight: 400;
        opacity: 0.9;
    }

    .glass-empty {
        margin-top: 10vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5vh;
        opacity: 0.4;
    }

    /* DETAILS OVERLAY */
    .glass-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #000;
        z-index: 10;
        display: flex;
        flex-direction: column;
    }
    /* Pseudo-background for overlay to match */
    .glass-overlay::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: radial-gradient(
            circle at 50% 120%,
            #2a1f3d 0%,
            #15151a 60%,
            #000 100%
        );
        z-index: -1;
    }

    .go-header {
        padding: 5vh 2vh 2vh 2vh;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .go-back {
        font-size: 1.8vh;
        display: flex;
        align-items: center;
        gap: 0.8vh;
        opacity: 0.8;
        cursor: pointer;
    }
    .go-edit {
        font-size: 1.8vh;
        color: #fff;
        cursor: pointer;
        font-weight: 500;
    }

    .go-body {
        flex: 1;
        overflow-y: auto;
        padding: 2vh;
        display: flex;
        flex-direction: column;
    }

    .profile-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 2vh;
        margin-bottom: 4vh;
    }
    .pc-avatar {
        width: 14vh;
        height: 14vh;
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.1);
        background-size: cover;
        background-position: center;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 4vh;
        margin-bottom: 2vh;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .pc-name {
        font-size: 3vh;
        font-weight: 400;
        letter-spacing: -0.5px;
        text-align: center;
    }
    .pc-phone {
        font-size: 1.7vh;
        opacity: 0.5;
        margin-top: 0.5vh;
    }
    .edit-text {
        font-size: 1.4vh;
        color: #7a7aff;
        margin-bottom: 1vh;
        cursor: pointer;
    }

    .actions-row {
        display: flex;
        justify-content: center;
        gap: 2.5vh;
        margin-bottom: 4vh;
    }
    .glass-btn {
        width: 6vh;
        height: 6vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.2vh;
        cursor: pointer;
        transition: transform 0.1s;
    }
    .glass-btn:active {
        transform: scale(0.95);
        background: rgba(255, 255, 255, 0.15);
    }
    .glass-btn.danger {
        color: #ff6b6b;
        border-color: rgba(255, 107, 107, 0.3);
        background: rgba(255, 107, 107, 0.1);
    }

    .glass-btn.wide {
        width: auto;
        padding: 0 3vh;
        border-radius: 3vh;
        font-size: 1.6vh;
        gap: 1vh;
        background: rgba(122, 122, 255, 0.15);
        border-color: rgba(122, 122, 255, 0.3);
        color: #b0b0ff;
    }

    .info-glass-box {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 2vh;
        border: 1px solid rgba(255, 255, 255, 0.05);
        padding: 0 2vh;
        margin-bottom: 4vh;
    }
    .igb-row {
        padding: 2vh 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .igb-label {
        font-size: 1.5vh;
        opacity: 0.7;
    }
    .igb-value {
        font-size: 1.6vh;
        font-weight: 500;
    }
    .igb-value.dimmed {
        opacity: 0.3;
    }
    .igb-sep {
        height: 1px;
        background: rgba(255, 255, 255, 0.05);
    }

    /* AIRSHARE MODAL */
    .blur-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.82);
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .glass-modal {
        width: 80%;
        background: rgba(30, 30, 35, 0.9);
        border-radius: 3vh;
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    }
    .gm-head {
        padding: 2vh;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-weight: 500;
        font-size: 1.6vh;
    }
    .gm-close {
        width: 3vh;
        height: 3vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4vh;
        cursor: pointer;
    }

    .gm-body {
        padding: 2vh;
        min-height: 20vh;
        display: flex;
        flex-direction: column;
    }

    .pulse-loader {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2vh;
        opacity: 0.7;
    }
    .pulse-ring {
        width: 6vh;
        height: 6vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
        0% {
            transform: scale(0.8);
            opacity: 0.5;
        }
        100% {
            transform: scale(1.5);
            opacity: 0;
        }
    }

    .gm-list {
        display: flex;
        flex-direction: column;
        gap: 1vh;
    }
    .gm-item {
        display: flex;
        align-items: center;
        padding: 1vh;
        border-radius: 1.5vh;
        background: rgba(255, 255, 255, 0.05);
        cursor: pointer;
        gap: 1.5vh;
    }
    .gmi-avatar {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: #444;
        background-size: cover;
    }
    .gmi-name {
        flex: 1;
        font-size: 1.5vh;
    }
    .gmi-icon {
        opacity: 0.5;
        font-size: 1.4vh;
    }
    .gm-empty {
        text-align: center;
        margin-top: 5vh;
        opacity: 0.4;
    }

    /* NOTIFICATION */
    .float-notification {
        position: absolute;
        top: 6vh;
        left: 5%;
        width: 90%;
        background: rgba(40, 40, 45, 0.98);
        border-radius: 2vh;
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 1.5vh;
        z-index: 100;
        display: flex;
        align-items: center;
        gap: 1.5vh;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    .fn-avatar {
        width: 5vh;
        height: 5vh;
        border-radius: 50%;
        background: #444;
        background-size: cover;
    }
    .fn-content {
        flex: 1;
        overflow: hidden;
    }
    .fn-top {
        font-size: 1.2vh;
        opacity: 0.5;
        text-transform: uppercase;
    }
    .fn-bot {
        font-size: 1.4vh;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .fn-actions {
        display: flex;
        gap: 1vh;
    }
    .fn-btn {
        padding: 0.8vh 1.5vh;
        border-radius: 1vh;
        font-size: 1.3vh;
        cursor: pointer;
        font-weight: 500;
    }
    .fn-btn.yes {
        background: #fff;
        color: #000;
    }
    .fn-btn.no {
        background: rgba(255, 255, 255, 0.1);
    }
</style>
