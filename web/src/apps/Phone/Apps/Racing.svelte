<script>
    import { onMount, onDestroy } from "svelte";
    import { fade, fly, slide, scale } from "svelte/transition";
    import AppWrapper from "../components/AppWrapper.svelte";
    import * as RC from "./_racing";
    import { Races, Tracks } from "./_racing";
    import { LoaderModal, PlayerData, InputModal } from "../phone.stores";
    import {
        ExtractImageUrls,
        OnEvent,
        SendEvent,
        ShowSuccessModal,
    } from "../../../utils/Utils";

    // --- State ---
    let CurrentTab = "Races"; // 'Races', 'Tracks', 'Leaderboard'
    let FilteredTracks = [];
    let CurrentLeaderboard = false;
    let LeaderboardClass = "All";

    // Track Creation State
    let CanCreateTracks = false;
    let IsCreatingTrack = false;

    // Search
    let SearchQuery = "";

    // Detail/Overlay State
    let ViewState = "list"; // 'list', 'details_race', 'details_track', 'leaderboard', 'chat'
    let SelectedItem = null; // Can be a Race or a Track

    // Chat State
    let ChatData = false;

    // --- Reactivity ---
    $: {
        if (CurrentTab === "Tracks") {
            if (SearchQuery) {
                const query = SearchQuery.toLowerCase();
                FilteredTracks = $Tracks.filter((Val) =>
                    Val.Name.toLowerCase().includes(query),
                );
            } else {
                FilteredTracks = $Tracks;
            }
        }
    }

    // --- Actions ---

    const SetCurrentTab = async (Tab) => {
        CurrentTab = Tab;
        ViewState = "list";
        SelectedItem = null;
        if (Tab == "Races") {
            RC.GetRaces();
        } else if (Tab == "Tracks") {
            Tracks.set(await RC.GetTracks());
            FilteredTracks = $Tracks;
            SearchQuery = "";
        } else if (Tab == "Leaderboard") {
            // Main leaderboard access if needed
        }
    };

    const OpenRaceDetails = (Race) => {
        SelectedItem = Race;
        ViewState = "details_race";
    };

    const OpenTrackDetails = (Track) => {
        SelectedItem = Track;
        ViewState = "details_track";
    };

    const OpenLeaderboard = (TrackId) => {
        SendEvent("Racing/GetLeaderboard", { Id: TrackId }, (Success, Data) => {
            if (!Success) return;
            CurrentLeaderboard = Data;
            ViewState = "leaderboard";
            LeaderboardClass = "All";
        });
    };

    // Chat
    const OpenRacingChat = ({ Id, Name }) => {
        LoaderModal.set(true);
        SendEvent("Racing/GetTexts", { Id }, (Success, Result) => {
            LoaderModal.set(false);
            if (!Success || !Result.Success) return;

            ChatData = {
                RaceId: Id,
                RaceTitle: Name,
                Texts: Result.Texts || [],
            };
            ViewState = "chat";
        });
    };

    const SendRacingMessage = (Text) => {
        if (Text.length <= 0) return;
        if (!ChatData || ChatData.RaceId == undefined) return;

        const [Attachments, Message] = ExtractImageUrls(Text);
        SendEvent("Racing/SendMessage", {
            RaceId: ChatData.RaceId,
            Attachments,
            Message,
        });
    };

    const CloseRacingChat = () => {
        ChatData = false;
        if (SelectedItem && SelectedItem.Id) {
            ViewState = "details_race";
        } else {
            ViewState = "list";
        }
    };

    OnEvent("Racing/UpdateChat", (Data) => {
        if (!ChatData) return;
        ChatData.Texts = Data.Texts;
    });

    // Lifecycle
    onMount(async () => {
        CanCreateTracks = await RC.CanCreateTracks();
        IsCreatingTrack = await RC.IsCreatingTrack();
        RC.GetRaces();
    });
</script>

<AppWrapper>
    <div class="glass-container">
        <div class="glass-bg"></div>

        <!-- Header / Tabs -->
        <div class="glass-header-custom">
            <div class="gh-tabs">
                <div
                    class="gh-tab {CurrentTab === 'Races' ? 'active' : ''}"
                    on:click={() => SetCurrentTab("Races")}
                >
                    Races
                </div>
                <div
                    class="gh-tab {CurrentTab === 'Tracks' ? 'active' : ''}"
                    on:click={() => SetCurrentTab("Tracks")}
                >
                    Tracks
                </div>
            </div>

            {#if CurrentTab === "Tracks" && CanCreateTracks}
                <div
                    class="gh-action"
                    on:click={async () => {
                        if (IsCreatingTrack) {
                            RC.SaveRaceTrack();
                            IsCreatingTrack = await RC.IsCreatingTrack();
                        } else {
                            RC.CreateRaceTrack();
                            IsCreatingTrack = await RC.IsCreatingTrack();
                        }
                    }}
                >
                    <i class="fas {IsCreatingTrack ? 'fa-save' : 'fa-plus'}"
                    ></i>
                </div>
                {#if IsCreatingTrack}
                    <div
                        class="gh-action danger"
                        on:click={async () => {
                            RC.CancelCreation();
                            IsCreatingTrack = await RC.IsCreatingTrack();
                        }}
                    >
                        <i class="fas fa-times"></i>
                    </div>
                {/if}
            {/if}
        </div>

        <!-- Main Content (Scroll) -->
        <div class="glass-scroll">
            {#if ViewState === "list"}
                <!-- RACES LIST -->
                {#if CurrentTab === "Races"}
                    {#if $Races.filter((x) => x.State == "Pending").length > 0}
                        <div class="gl-marker">Pending</div>
                        {#each $Races.filter((x) => x.State == "Pending") as Race (Race.Id)}
                            <div
                                class="glass-row"
                                on:click={() => OpenRaceDetails(Race)}
                            >
                                <div class="gr-icon">
                                    <i class="fas fa-flag-checkered"></i>
                                </div>
                                <div class="gr-info">
                                    <div class="gr-name">{Race.Name}</div>
                                    <div class="gr-sub">
                                        {RC.GetRaceDescription(Race)}
                                    </div>
                                </div>
                                <div class="gr-action">
                                    <i class="fas fa-chevron-right"></i>
                                </div>
                            </div>
                        {/each}
                    {/if}

                    {#if $Races.filter((x) => x.State == "Active").length > 0}
                        <div class="gl-marker">Active</div>
                        {#each $Races.filter((x) => x.State == "Active") as Race (Race.Id)}
                            <div
                                class="glass-row"
                                on:click={() => OpenRaceDetails(Race)}
                            >
                                <div class="gr-icon active-race-icon">
                                    <i class="fas fa-tachometer-alt"></i>
                                </div>
                                <div class="gr-info">
                                    <div class="gr-name">{Race.Name}</div>
                                    <div class="gr-sub">
                                        {Race.Racers?.length || 0} Racers
                                    </div>
                                </div>
                                <div class="gr-action">
                                    <i class="fas fa-chevron-right"></i>
                                </div>
                            </div>
                        {/each}
                    {/if}

                    {#if $Races.filter((x) => x.State == "Completed").length > 0}
                        <div class="gl-marker">Completed</div>
                        {#each $Races.filter((x) => x.State == "Completed") as Race (Race.Id)}
                            <div
                                class="glass-row"
                                on:click={() => OpenRaceDetails(Race)}
                            >
                                <div class="gr-icon completed-race-icon">
                                    <i class="fas fa-trophy"></i>
                                </div>
                                <div class="gr-info">
                                    <div class="gr-name">{Race.Name}</div>
                                    <div class="gr-sub">Finished</div>
                                </div>
                                <div class="gr-action">
                                    <i class="fas fa-chevron-right"></i>
                                </div>
                            </div>
                        {/each}
                    {/if}

                    {#if $Races.length === 0}
                        <div class="glass-empty">
                            <i class="fas fa-flag"></i>
                            <span>No races available</span>
                        </div>
                    {/if}

                    <!-- TRACKS LIST -->
                {:else if CurrentTab === "Tracks"}
                    <div class="search-wrap">
                        <div class="glass-search">
                            <i class="fas fa-search"></i>
                            <input
                                type="text"
                                placeholder="Search tracks..."
                                bind:value={SearchQuery}
                            />
                        </div>
                    </div>

                    {#each FilteredTracks as Track (Track.Id)}
                        <div
                            class="glass-row"
                            on:click={() => OpenTrackDetails(Track)}
                        >
                            <div class="gr-icon track-icon">
                                <i class="fas fa-route"></i>
                            </div>
                            <div class="gr-info">
                                <div class="gr-name">{Track.Name}</div>
                                <div class="gr-sub">
                                    {Track.Type} | {Track.Distance.toFixed(2)}km
                                </div>
                            </div>
                            <div class="gr-action">
                                <i class="fas fa-chevron-right"></i>
                            </div>
                        </div>
                    {/each}

                    {#if FilteredTracks.length === 0}
                        <div class="glass-empty">
                            <i class="fas fa-map-signs"></i>
                            <span>No tracks found</span>
                        </div>
                    {/if}
                {/if}
            {/if}
            <div class="safe-padding"></div>
        </div>

        <!-- DETAILS OVERLAY: RACE -->
        {#if ViewState === "details_race" && SelectedItem}
            <div
                class="glass-overlay"
                in:fly={{ y: 50, duration: 400 }}
                out:fly={{ y: 50, duration: 300 }}
            >
                <div class="go-header">
                    <div class="go-back" on:click={() => (ViewState = "list")}>
                        <i class="fas fa-arrow-left"></i> Races
                    </div>
                </div>
                <div class="go-body">
                    <div class="profile-center">
                        <div class="pc-avatar race-avatar">
                            <i class="fas fa-flag-checkered"></i>
                        </div>
                        <div class="pc-name">{SelectedItem.Name}</div>
                        <div class="pc-phone">
                            {RC.GetRaceDescription(SelectedItem)}
                        </div>
                    </div>

                    <div class="actions-row">
                        <!-- Join / Leave Logic -->
                        {#if SelectedItem.State == "Pending"}
                            {#if SelectedItem.Racers?.find((Val) => Val.Cid == $PlayerData.Cid)}
                                <!-- Ensure we handle Creator logic -->
                                {#if SelectedItem.Creator == $PlayerData.Cid}
                                    <div
                                        class="glass-btn success"
                                        on:click={() =>
                                            RC.StartRace(SelectedItem)}
                                    >
                                        <i class="fas fa-play"></i>
                                    </div>
                                    <div
                                        class="glass-btn danger"
                                        on:click={() =>
                                            RC.EndRace(SelectedItem)}
                                    >
                                        <i class="fas fa-stop"></i>
                                    </div>
                                {:else}
                                    <div
                                        class="glass-btn danger"
                                        on:click={() =>
                                            RC.LeaveRace(SelectedItem)}
                                    >
                                        <i class="fas fa-sign-out-alt"></i>
                                    </div>
                                {/if}
                                <!-- Chat is available for joined -->
                                <div
                                    class="glass-btn"
                                    on:click={() =>
                                        OpenRacingChat(SelectedItem)}
                                >
                                    <i class="fas fa-comment"></i>
                                </div>
                            {:else}
                                <div
                                    class="glass-btn success"
                                    on:click={() => RC.JoinRace(SelectedItem)}
                                >
                                    <i class="fas fa-sign-in-alt"></i>
                                </div>
                            {/if}
                            <div
                                class="glass-btn"
                                on:click={() => RC.SetGPS(SelectedItem.TrackId)}
                            >
                                <i class="fas fa-map-marker-alt"></i>
                            </div>
                            <div
                                class="glass-btn"
                                on:click={() =>
                                    RC.Preview(SelectedItem.TrackId)}
                            >
                                <i class="fas fa-eye"></i>
                            </div>
                        {:else if SelectedItem.State == "Active"}
                            {#if SelectedItem.Racers?.find((Val) => Val.Cid == $PlayerData.Cid)}
                                {#if SelectedItem.Creator == $PlayerData.Cid}
                                    <div
                                        class="glass-btn danger"
                                        on:click={() =>
                                            RC.EndRace(SelectedItem)}
                                    >
                                        <i class="fas fa-stop"></i>
                                    </div>
                                {:else}
                                    <div
                                        class="glass-btn danger"
                                        on:click={() =>
                                            RC.LeaveRace(SelectedItem)}
                                    >
                                        <i class="fas fa-sign-out-alt"></i>
                                    </div>
                                {/if}
                            {/if}
                        {:else if SelectedItem.State == "Completed"}
                            <div
                                class="glass-btn wide"
                                on:click={() =>
                                    OpenLeaderboard(SelectedItem.TrackId)}
                            >
                                <i class="fas fa-trophy"></i>
                                <span>Leaderboard</span>
                            </div>
                        {/if}
                    </div>

                    <!-- Participants List (Drawer Replacement) -->
                    <div class="info-glass-box">
                        <div class="igb-header">Participants</div>
                        {#each RC.GetRacersDrawer(SelectedItem)[0].Items as Racer}
                            <div class="igb-row">
                                <span class="igb-label">{Racer.Main}</span>
                                <span class="igb-value">{Racer.Side}</span>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        {/if}

        <!-- DETAILS OVERLAY: TRACK -->
        {#if ViewState === "details_track" && SelectedItem}
            <div
                class="glass-overlay"
                in:fly={{ y: 50, duration: 400 }}
                out:fly={{ y: 50, duration: 300 }}
            >
                <div class="go-header">
                    <div class="go-back" on:click={() => (ViewState = "list")}>
                        <i class="fas fa-arrow-left"></i> Tracks
                    </div>
                </div>
                <div class="go-body">
                    <div class="profile-center">
                        <div class="pc-avatar track-avatar">
                            <i class="fas fa-route"></i>
                        </div>
                        <div class="pc-name">{SelectedItem.Name}</div>
                        <div class="pc-phone">
                            {SelectedItem.Type} | {SelectedItem.Distance.toFixed(
                                2,
                            )}km
                        </div>
                    </div>

                    <div class="actions-row">
                        <div
                            class="glass-btn success"
                            on:click={() => RC.CreateRace(SelectedItem)}
                        >
                            <i class="fas fa-flag-checkered"></i>
                        </div>
                        <div
                            class="glass-btn"
                            on:click={() => RC.SetGPS(SelectedItem.Id)}
                        >
                            <i class="fas fa-map-marker-alt"></i>
                        </div>
                        <div
                            class="glass-btn"
                            on:click={() => RC.Preview(SelectedItem.Id)}
                        >
                            <i class="fas fa-eye"></i>
                        </div>
                        <div
                            class="glass-btn"
                            on:click={() => OpenLeaderboard(SelectedItem.Id)}
                        >
                            <i class="fas fa-trophy"></i>
                        </div>
                    </div>
                </div>
            </div>
        {/if}

        <!-- LEADERBOARD OVERLAY -->
        {#if ViewState === "leaderboard" && CurrentLeaderboard}
            <div
                class="glass-overlay"
                in:fly={{ y: 50, duration: 400 }}
                out:fly={{ y: 50, duration: 300 }}
            >
                <div class="go-header">
                    <div
                        class="go-back"
                        on:click={() => {
                            if (SelectedItem && SelectedItem.Id) {
                                if (CurrentTab === "Races")
                                    ViewState = "details_race";
                                else ViewState = "details_track";
                            } else {
                                if (CurrentTab === "Races") ViewState = "list";
                                else ViewState = "details_track";
                            }
                        }}
                    >
                        <i class="fas fa-arrow-left"></i> Back
                    </div>
                </div>
                <div class="go-body" style="padding: 0;">
                    <div class="leaderboard-header">
                        <div class="lh-title">{CurrentLeaderboard.Track}</div>
                        <div class="lh-sub">Best Lap Times</div>
                    </div>

                    <!-- Class Tabs -->
                    <div class="class-scroll-wrap">
                        {#each ["All", "S", "A", "B", "C", "D", "E", "M"] as Class}
                            <div
                                class="class-pill {LeaderboardClass == Class
                                    ? 'active'
                                    : ''}"
                                on:click={() => (LeaderboardClass = Class)}
                            >
                                {Class}
                            </div>
                        {/each}
                    </div>

                    <div class="glass-table">
                        <div class="gt-head">
                            <div class="col-rank">#</div>
                            <div class="col-name">Racer</div>
                            <div class="col-time">Time</div>
                        </div>
                        <div class="gt-body">
                            {#each CurrentLeaderboard.Players.filter((Val) => LeaderboardClass == "All" || LeaderboardClass == Val.Class) as Data}
                                <div class="gt-row">
                                    <div class="col-rank">{Data.Position}</div>
                                    <div class="col-name">
                                        <span>{Data.Alias}</span>
                                        <small>{Data.Vehicle}</small>
                                    </div>
                                    <div class="col-time">{Data.Time}</div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        {/if}

        <!-- CHAT OVERLAY -->
        {#if ViewState === "chat" && ChatData}
            <div
                class="glass-overlay"
                in:fly={{ y: 50, duration: 400 }}
                out:fly={{ y: 50, duration: 300 }}
                style="background: rgba(0,0,0,0.85);"
            >
                <div class="go-header">
                    <div class="go-back" on:click={CloseRacingChat}>
                        <i class="fas fa-arrow-left"></i> Back
                    </div>
                </div>

                <div class="chat-area">
                    <div class="chat-title-in">{ChatData.RaceTitle}</div>
                    {#if ChatData.Texts}
                        {#each ChatData.Texts as Msg}
                            <div class="chat-bubble {Msg.Me ? 'me' : ''}">
                                <div class="cb-sender">{Msg.Sender}</div>
                                <div class="cb-text">{Msg.Message}</div>
                            </div>
                        {/each}
                    {/if}
                </div>

                <div class="chat-input-area">
                    <input
                        type="text"
                        placeholder="Message..."
                        on:keydown={(e) => {
                            if (e.key === "Enter") {
                                SendRacingMessage(e.target.value);
                                e.target.value = "";
                            }
                        }}
                    />
                </div>
            </div>
        {/if}
    </div>
</AppWrapper>

<style>
    /* VARIABLES & UTILS */
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

    .glass-scroll {
        position: relative;
        z-index: 1;
        flex: 1;
        height: 85%; /* Adjusted for topbar */
        overflow-y: auto;
        padding: 0 2vh;
        margin-top: 1vh;
    }
    .glass-scroll::-webkit-scrollbar {
        display: none;
    }
    .safe-padding {
        height: 10vh;
        width: 100%;
    }

    /* HEADER */
    .glass-header-custom {
        position: relative;
        z-index: 2;
        padding: 5vh 2.5vh 1vh 2.5vh;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .gh-tabs {
        display: flex;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 1vh;
        padding: 0.5vh;
    }
    .gh-tab {
        padding: 0.8vh 2vh;
        font-size: 1.4vh;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        border-radius: 0.8vh;
        transition: all 0.2s;
    }
    .gh-tab.active {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }
    .gh-action {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: rgba(40, 40, 50, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6vh;
        cursor: pointer;
        margin-left: 1vh;
    }
    .gh-action.danger {
        background: rgba(255, 60, 60, 0.2);
        color: #ff6b6b;
    }

    /* MARKERS */
    .gl-marker {
        font-size: 1.3vh;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.4);
        margin: 2vh 0 1vh 0.5vh;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    /* ROWS */
    .glass-row {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 1.5vh;
        padding: 1.5vh;
        display: flex;
        align-items: center;
        margin-bottom: 1.2vh;
        transition: background 0.2s;
        cursor: pointer;
    }
    .glass-row:active {
        background: rgba(255, 255, 255, 0.1);
    }
    .gr-icon {
        width: 4.5vh;
        height: 4.5vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 1.5vh;
        font-size: 1.8vh;
        color: rgba(255, 255, 255, 0.8);
    }
    .active-race-icon {
        background: rgba(74, 222, 128, 0.15);
        color: #4ade80;
    }
    .completed-race-icon {
        background: rgba(250, 204, 21, 0.15);
        color: #facc15;
    }
    .track-icon {
        background: rgba(96, 165, 250, 0.15);
        color: #60a5fa;
    }

    .gr-info {
        flex: 1;
    }
    .gr-name {
        font-size: 1.6vh;
        font-weight: 500;
        color: #fff;
        margin-bottom: 0.2vh;
    }
    .gr-sub {
        font-size: 1.3vh;
        color: rgba(255, 255, 255, 0.5);
    }
    .gr-action {
        color: rgba(255, 255, 255, 0.3);
        font-size: 1.4vh;
    }

    /* EMPTY */
    .glass-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 30vh;
        color: rgba(255, 255, 255, 0.3);
        gap: 1.5vh;
    }
    .glass-empty i {
        font-size: 4vh;
    }

    /* SEARCH */
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

    /* OVERLAY */
    .glass-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(13, 13, 16, 0.98);
        z-index: 10;
        display: flex;
        flex-direction: column;
    }
    .go-header {
        padding: 6vh 2.5vh 2vh 2.5vh;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .go-back {
        font-size: 1.8vh;
        display: flex;
        align-items: center;
        gap: 1vh;
        color: #60a5fa;
        cursor: pointer;
    }
    .go-body {
        padding: 0 3vh;
        flex: 1;
        overflow-y: auto;
    }

    .profile-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 2vh 0 4vh 0;
    }
    .pc-avatar {
        width: 10vh;
        height: 10vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 4vh;
        color: #fff;
        margin-bottom: 2vh;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .race-avatar {
        color: #facc15;
    }
    .track-avatar {
        color: #60a5fa;
    }
    .pc-name {
        font-size: 2.4vh;
        font-weight: 600;
        text-align: center;
    }
    .pc-phone {
        font-size: 1.5vh;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 0.5vh;
    }

    /* ACTION BUTTONS GRID */
    .actions-row {
        display: flex;
        justify-content: center;
        gap: 2vh;
        margin-bottom: 4vh;
        flex-wrap: wrap;
    }
    .glass-btn {
        width: 6vh;
        height: 6vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.2vh;
        color: #fff;
        cursor: pointer;
        transition: transform 0.1s;
    }
    .glass-btn:active {
        transform: scale(0.95);
    }
    .glass-btn.danger {
        background: rgba(255, 80, 80, 0.2);
        color: #ff6b6b;
    }
    .glass-btn.success {
        background: rgba(74, 222, 128, 0.2);
        color: #4ade80;
    }
    .glass-btn.wide {
        width: auto;
        padding: 0 3vh;
        border-radius: 3vh;
        font-size: 1.6vh;
        gap: 1vh;
    }

    /* INFO BOX */
    .info-glass-box {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 1.5vh;
        padding: 2vh;
    }
    .igb-header {
        font-size: 1.4vh;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.4);
        margin-bottom: 1.5vh;
        text-transform: uppercase;
    }
    .igb-row {
        display: flex;
        justify-content: space-between;
        padding: 1vh 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 1.5vh;
    }
    .igb-row:last-child {
        border: none;
    }
    .igb-label {
        color: rgba(255, 255, 255, 0.8);
    }
    .igb-value {
        color: #fff;
        font-weight: 500;
    }

    /* LEADERBOARD STYLES */
    .leaderboard-header {
        padding: 0 3vh;
        margin-bottom: 2vh;
    }
    .lh-title {
        font-size: 2.8vh;
        font-weight: 700;
    }
    .lh-sub {
        color: rgba(255, 255, 255, 0.5);
        font-size: 1.5vh;
    }

    .class-scroll-wrap {
        display: flex;
        gap: 1vh;
        padding: 0 3vh;
        overflow-x: auto;
        margin-bottom: 2vh;
    }
    .class-scroll-wrap::-webkit-scrollbar {
        display: none;
    }
    .class-pill {
        padding: 0.6vh 1.5vh;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 0.8vh;
        font-size: 1.3vh;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        white-space: nowrap;
    }
    .class-pill.active {
        background: #60a5fa;
        color: #fff;
    }

    .glass-table {
        margin: 0 3vh;
    }
    .gt-head {
        display: flex;
        padding: 1vh;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.4);
        text-transform: uppercase;
    }
    .gt-body {
        max-height: 50vh;
        overflow-y: auto;
    }
    .gt-body::-webkit-scrollbar {
        display: none;
    }
    .gt-row {
        display: flex;
        padding: 1.5vh 1vh;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        align-items: center;
        font-size: 1.4vh;
    }
    .col-rank {
        width: 10%;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.4);
    }
    .col-name {
        width: 60%;
        display: flex;
        flex-direction: column;
    }
    .col-name span {
        color: #fff;
        font-weight: 500;
    }
    .col-name small {
        color: rgba(255, 255, 255, 0.4);
        font-size: 1.1vh;
    }
    .col-time {
        width: 30%;
        text-align: right;
        color: #4ade80;
        font-family: monospace;
        font-size: 1.5vh;
    }

    /* CHAT STYLES */
    .chat-area {
        flex: 1;
        padding: 2vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1vh;
    }
    .chat-title-in {
        font-size: 1.6vh;
        font-weight: 600;
        text-align: center;
        margin-bottom: 2vh;
        opacity: 0.8;
    }
    .chat-bubble {
        max-width: 80%;
        padding: 1vh 1.5vh;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 1.5vh;
        border-bottom-left-radius: 0.2vh;
        align-self: flex-start;
    }
    .chat-bubble.me {
        background: #60a5fa;
        color: #fff;
        align-self: flex-end;
        border-bottom-left-radius: 1.5vh;
        border-bottom-right-radius: 0.2vh;
    }
    .cb-sender {
        font-size: 1.1vh;
        opacity: 0.5;
        margin-bottom: 0.3vh;
    }
    .cb-text {
        font-size: 1.4vh;
    }
    .chat-input-area {
        padding: 2vh;
        background: rgba(0, 0, 0, 0.3);
    }
    .chat-input-area input {
        width: 100%;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        padding: 1.5vh;
        border-radius: 3vh;
        color: #fff;
        outline: none;
        font-size: 1.5vh;
    }
</style>
