<script>
    import "../components/Misc.css";
    import { onMount, onDestroy } from "svelte";
    import { fade, fly } from "svelte/transition";
    import { SendEvent, FormatPhone } from "../../../utils/Utils";
    import { getVideoCallManager } from "../../../utils/VideoCallManager";
    import AppWrapper from "../components/AppWrapper.svelte";
    import {
        Video,
        VideoOff,
        Mic,
        MicOff,
        PhoneOff,
        User,
        SwitchCamera,
        Loader,
        MonitorSmartphone,
    } from "lucide-svelte";

    let Contacts = [];
    let FilteredContacts = [];
    let SearchQuery = "";
    let isFrontCamera = true;
    let activeTab = "contacts";
    let keypadNumber = "";

    // Call state
    let isInCall = false;
    let callData = null;
    let videoEnabled = true;
    let audioEnabled = true;
    let connectionStatus = "idle"; // idle, connecting, connected, failed

    // Video elements
    let localVideoElement;
    let remoteVideoElement;

    // WebRTC Manager
    let videoManager = null;
    let isInitiator = false;
    let myPeerId = null;

    $: {
        if (SearchQuery.length > 0) {
            FilteredContacts = Contacts.filter(
                (c) =>
                    c.name.toLowerCase().includes(SearchQuery.toLowerCase()) ||
                    c.phone.includes(SearchQuery),
            );
        } else {
            FilteredContacts = Contacts;
        }
    }

    const LoadContacts = () => {
        SendEvent("Facetime/GetContacts", {}, (Success, Data) => {
            if (!Success) return;
            Contacts = Data;
            FilteredContacts = Contacts;
        });
    };

    const StartCall = (Phone) => {
        SendEvent("Facetime/StartCall", { Phone: Phone });
    };

    const HandleKeypadCall = () => {
        if (keypadNumber.length > 0) {
            StartCall(keypadNumber);
        }
    };

    const EndCall = () => {
        SendEvent("Facetime/EndCall", {});
        cleanupWebRTC();
    };

    const ToggleVideo = () => {
        videoEnabled = !videoEnabled;
        SendEvent("Facetime/ToggleVideo", { Enabled: videoEnabled });

        if (videoManager) {
            videoManager.toggleVideo(videoEnabled);
        }
    };

    const ToggleAudio = () => {
        audioEnabled = !audioEnabled;
        SendEvent("Facetime/ToggleAudio", { Enabled: audioEnabled });

        if (videoManager) {
            videoManager.toggleAudio(audioEnabled);
        }
    };

    const HandleKeypadInput = (key) => {
        if (keypadNumber.length < 10) {
            keypadNumber += key;
        }
    };

    const HandleKeypadDelete = () => {
        keypadNumber = keypadNumber.slice(0, -1);
    };

    const FlipCamera = () => {
        SendEvent("Facetime/FlipCamera", {}, (Success, Data) => {
            if (Success && Data) {
                isFrontCamera = Data.IsFrontCamera;
            }
        });
    };

    // Initialize WebRTC Manager
    const initWebRTC = async (serverId, callId, initiator, iceServers) => {
        try {
            connectionStatus = "connecting";
            isInitiator = initiator;

            videoManager = getVideoCallManager();

            // Set initiator flag on manager BEFORE initialization
            // This ensures pending connections know whether to initiate calls
            videoManager.isInitiator = initiator;

            // Setup callbacks
            videoManager.onRemoteStream = (stream) => {
                console.log("[Facetime] Remote stream received");
                if (remoteVideoElement) {
                    remoteVideoElement.srcObject = stream;
                }
                connectionStatus = "connected";
            };

            videoManager.onLocalStream = (stream) => {
                console.log("[Facetime] Local stream ready");
                if (localVideoElement) {
                    localVideoElement.srcObject = stream;
                }
            };

            videoManager.onCallEnded = () => {
                console.log("[Facetime] Call ended callback");
                connectionStatus = "idle";
            };

            videoManager.onError = (err) => {
                console.error("[Facetime] WebRTC error:", err);
                connectionStatus = "failed";
            };

            videoManager.onPeerIdReady = (peerId) => {
                console.log("[Facetime] Peer ID ready:", peerId);
                myPeerId = peerId;
                // Send peer ID to server for exchange
                SendEvent("Facetime/SetPeerId", { PeerId: peerId });
            };

            // Initialize peer connection
            await videoManager.initialize(serverId, iceServers);
        } catch (error) {
            console.error("[Facetime] Failed to init WebRTC:", error);
            connectionStatus = "failed";
        }
    };

    // Connect to remote peer (called when we receive their peer ID)
    const connectToPeer = async (remotePeerId) => {
        if (!videoManager) {
            console.error("[Facetime] No video manager to connect with");
            return;
        }

        console.log(
            "[Facetime] connectToPeer called:",
            remotePeerId,
            "isInitiator:",
            isInitiator,
        );

        // Use the manager's connectToRemote which handles queuing and retry
        videoManager.connectToRemote(remotePeerId, isInitiator);
    };

    // Cleanup WebRTC (UI only - manager handles its own cleanup)
    const cleanupWebRTC = () => {
        // Clear video element sources
        if (localVideoElement) {
            localVideoElement.srcObject = null;
        }
        if (remoteVideoElement) {
            remoteVideoElement.srcObject = null;
        }

        connectionStatus = "idle";
        myPeerId = null;
    };

    // Listen for messages from Lua
    const handleMessage = (event) => {
        if (!event.data || !event.data.Action) return;

        switch (event.data.Action) {
            case "Facetime/SetCallData":
                callData = event.data.CallData;
                break;
            case "Facetime/CallActive":
                isInCall = event.data.Active;
                if (!isInCall) {
                    callData = null;
                    videoEnabled = true;
                    audioEnabled = true;
                    cleanupWebRTC();
                }
                break;
            case "Facetime/InitWebRTC":
                initWebRTC(
                    event.data.ServerId,
                    event.data.CallId,
                    event.data.IsInitiator,
                    event.data.IceServers,
                );
                break;
            case "Facetime/ConnectToPeer":
                connectToPeer(event.data.RemotePeerId);
                break;
            case "Facetime/StopWebRTC":
                cleanupWebRTC();
                break;
            case "Facetime/SetZoom":
                // Handle zoom if needed
                break;
        }
    };

    onMount(() => {
        LoadContacts();

        // Check if already in call
        SendEvent("Facetime/GetCallState", {}, (Success, Data) => {
            if (!Success) return;
            isInCall = Data.InCall;
            callData = Data.CallData;
            videoEnabled = Data.VideoEnabled;
            audioEnabled = Data.AudioEnabled;
        });

        window.addEventListener("message", handleMessage);
    });

    onDestroy(() => {
        window.removeEventListener("message", handleMessage);
        // End the call if component is destroyed (phone closed)
        if (videoManager) {
            videoManager.endCall();
        }
        cleanupWebRTC();
    });

    const GetInitials = (Name) => {
        if (!Name) return "#";
        return Name.split(" ")
            .map((x) => x[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();
    };
</script>

<AppWrapper>
    <div class="glass-container">
        <!-- BACKGROUND DEEP BLUR -->
        <div class="glass-bg"></div>

        {#if isInCall}
            <!-- Active Video Call View -->
            <div class="video-call-container" in:fade={{ duration: 200 }}>
                <!-- Remote Video (Full Screen) -->
                <div class="remote-video">
                    <video
                        bind:this={remoteVideoElement}
                        class="video-frame"
                        autoplay
                        playsinline
                        muted={false}
                    ></video>

                    {#if connectionStatus === "connecting"}
                        <div class="video-placeholder">
                            <Loader size={40} strokeWidth={1.5} class="spin" />
                            <span>Connecting...</span>
                        </div>
                    {:else if connectionStatus === "failed"}
                        <div class="video-placeholder error">
                            <VideoOff size={40} strokeWidth={1.5} />
                            <span>Connection failed</span>
                        </div>
                    {:else if !remoteVideoElement?.srcObject}
                        <div class="video-placeholder">
                            <User size={60} strokeWidth={1.5} />
                            <span>Waiting for video...</span>
                        </div>
                    {/if}
                </div>

                <!-- Local Video Preview (Small Overlay) -->
                <div class="local-video">
                    <video
                        bind:this={localVideoElement}
                        class="video-frame"
                        autoplay
                        playsinline
                        muted={true}
                    ></video>

                    {#if !videoEnabled}
                        <div class="video-placeholder-small">
                            <VideoOff size={24} strokeWidth={1.5} />
                        </div>
                    {:else if !localVideoElement?.srcObject}
                        <div class="video-placeholder-small">
                            <User size={24} strokeWidth={1.5} />
                        </div>
                    {/if}
                </div>

                <!-- Call Info Overlay -->
                <div class="call-info">
                    <span class="caller-name"
                        >{callData?.TargetName ||
                            callData?.CallerName ||
                            "Video Call"}</span
                    >
                    {#if connectionStatus === "connecting"}
                        <span class="connection-status">Connecting...</span>
                    {:else if connectionStatus === "connected"}
                        <span class="connection-status connected"
                            >Connected</span
                        >
                    {/if}
                </div>

                <!-- Call Controls -->
                <div class="call-controls">
                    <button class="control-btn" on:click={FlipCamera}>
                        <SwitchCamera size={20} strokeWidth={2} />
                    </button>

                    <button
                        class="control-btn {!videoEnabled ? 'disabled' : ''}"
                        on:click={ToggleVideo}
                    >
                        {#if videoEnabled}
                            <Video size={20} strokeWidth={2} />
                        {:else}
                            <VideoOff size={20} strokeWidth={2} />
                        {/if}
                    </button>

                    <button class="control-btn end-call" on:click={EndCall}>
                        <PhoneOff size={22} strokeWidth={2} />
                    </button>

                    <button
                        class="control-btn {!audioEnabled ? 'disabled' : ''}"
                        on:click={ToggleAudio}
                    >
                        {#if audioEnabled}
                            <Mic size={20} strokeWidth={2} />
                        {:else}
                            <MicOff size={20} strokeWidth={2} />
                        {/if}
                    </button>
                </div>
            </div>
        {:else}
            <!-- HEADER -->
            <div class="glass-header">
                <div class="gh-title">Facetime</div>
            </div>

            <!-- SCROLL AREA -->
            <div class="glass-scroll">
                <!-- TABS & SEARCH -->
                <div class="top-controls">
                    <div class="glass-tabs">
                        <div
                            class="tab-btn"
                            class:active={activeTab === "contacts"}
                            on:click={() => (activeTab = "contacts")}
                        >
                            Contacts
                        </div>
                        <div
                            class="tab-btn"
                            class:active={activeTab === "keypad"}
                            on:click={() => (activeTab = "keypad")}
                        >
                            Keypad
                        </div>
                    </div>

                    {#if activeTab === "contacts"}
                        <div class="glass-search">
                            <i class="fas fa-search"></i>
                            <input
                                type="text"
                                placeholder="Search contacts..."
                                bind:value={SearchQuery}
                            />
                        </div>
                    {/if}
                </div>

                <!-- LIST / KEYPAD -->
                <div class="list-body">
                    {#if activeTab === "contacts"}
                        {#if FilteredContacts.length === 0}
                            <div class="glass-empty">
                                <MonitorSmartphone size={32} />
                                <span>No contacts found</span>
                            </div>
                        {:else}
                            {#each FilteredContacts as contact}
                                <div
                                    class="glass-row"
                                    on:click={() => StartCall(contact.phone)}
                                >
                                    <div class="gr-avatar">
                                        {GetInitials(contact.name)}
                                    </div>
                                    <div class="gr-info">
                                        <div class="gr-name">
                                            {contact.name}
                                        </div>
                                        <div class="gr-sub">
                                            {FormatPhone(contact.phone)}
                                        </div>
                                    </div>
                                    <div class="gr-action">
                                        <Video size={18} />
                                    </div>
                                </div>
                            {/each}
                        {/if}
                    {:else}
                        <!-- KEYPAD -->
                        <div class="keypad-container">
                            <div class="keypad-display">
                                {FormatPhone(keypadNumber) || "Enter number"}
                                {#if keypadNumber.length > 0}
                                    <span
                                        class="keypad-delete"
                                        on:click={HandleKeypadDelete}
                                    >
                                        <i class="fas fa-backspace"></i>
                                    </span>
                                {/if}
                            </div>

                            <div class="keypad-grid">
                                {#each ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as key}
                                    <div
                                        class="keypad-key"
                                        on:click={() => HandleKeypadInput(key)}
                                    >
                                        {key}
                                    </div>
                                {/each}
                            </div>

                            <div class="keypad-action">
                                <div
                                    class="call-btn facetime-call"
                                    on:click={HandleKeypadCall}
                                >
                                    <Video size={24} />
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>

                <div class="safe-padding"></div>
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

    /* TOP CONTROLS */
    .top-controls {
        margin-bottom: 2vh;
    }
    .glass-tabs {
        display: flex;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 1.5vh;
        padding: 0.5vh;
        margin-bottom: 2vh;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .tab-btn {
        flex: 1;
        text-align: center;
        padding: 0.8vh 0;
        font-size: 1.3vh;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.5);
        border-radius: 1vh;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    .tab-btn.active {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }

    .glass-search {
        background: rgba(255, 255, 255, 0.06);
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

    /* LIST ITEMS */
    .glass-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 30vh;
        gap: 2vh;
        color: rgba(255, 255, 255, 0.15);
        font-size: 1.4vh;
    }

    .glass-row {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1.5vh;
        padding: 1.2vh;
        margin-bottom: 1vh;
        display: flex;
        align-items: center;
        gap: 1.5vh;
        transition: all 0.2s;
        cursor: pointer;
    }
    .glass-row:active {
        transform: scale(0.98);
        background: rgba(255, 255, 255, 0.06);
    }

    .gr-avatar {
        width: 4.5vh;
        height: 4.5vh;
        border-radius: 50%;
        background: linear-gradient(135deg, #38bdf8 0%, #2563eb 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5vh;
        font-weight: 600;
        box-shadow: 0 2px 10px rgba(37, 99, 235, 0.3);
    }
    .gr-info {
        flex: 1;
        overflow: hidden;
    }
    .gr-name {
        font-size: 1.5vh;
        font-weight: 500;
        color: #fff;
    }
    .gr-sub {
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.5);
    }
    .gr-action {
        width: 3.5vh;
        height: 3.5vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #34d399;
    }

    /* KEYPAD */
    .keypad-container {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-evenly;
        padding: 2vh 0 4vh 0;
    }

    .keypad-display {
        font-size: 3vh;
        font-weight: 300;
        color: #fff;
        letter-spacing: 0.2vh;
        min-height: 5vh;
        display: flex;
        align-items: center;
        gap: 1.5vh;
    }

    .keypad-delete {
        color: rgba(255, 255, 255, 0.3);
        cursor: pointer;
        font-size: 2vh;
    }
    .keypad-delete:active {
        color: #f87171;
    }

    .keypad-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2vh;
    }

    .keypad-key {
        width: 7vh;
        height: 7vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.5vh;
        font-weight: 400;
        cursor: pointer;
        transition: all 0.2s;
    }
    .keypad-key:active {
        background: rgba(255, 255, 255, 0.15);
        transform: scale(0.95);
    }

    .call-btn.facetime-call {
        width: 7vh;
        height: 7vh;
        border-radius: 50%;
        background: #34d399;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #000;
        box-shadow: 0 0 20px rgba(52, 211, 153, 0.4);
        margin-top: 2vh;
        cursor: pointer;
        transition: all 0.2s;
    }
    .call-btn.facetime-call:active {
        transform: scale(0.95);
        background: #10b981;
    }

    /* VIDEO CALL VIEW */
    .video-call-container {
        position: relative;
        width: 100%;
        height: 100%;
        background: #000;
        overflow: hidden;
    }

    .remote-video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .remote-video .video-frame {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .video-placeholder {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5vh;
        color: rgba(255, 255, 255, 0.5);
    }
    .video-placeholder.error {
        color: #f87171;
    }
    :global(.spin) {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    .local-video {
        position: absolute;
        top: 3vh;
        right: 2vh;
        width: 9vh;
        height: 14vh;
        border-radius: 1.5vh;
        overflow: hidden;
        background: #1e1e1e;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
        z-index: 10;
    }
    .local-video .video-frame {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .video-placeholder-small {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.3);
    }

    /* OVERLAY INFO & CONTROLS */
    .call-info {
        position: absolute;
        top: 4vh;
        left: 2vh;
        z-index: 10;
        display: flex;
        flex-direction: column;
    }
    .caller-name {
        font-size: 2vh;
        font-weight: 600;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    }
    .connection-status {
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.7);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }
    .connection-status.connected {
        color: #34d399;
    }

    .call-controls {
        position: absolute;
        bottom: 4vh;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 2vh;
        background: rgba(20, 20, 20, 0.85);
        padding: 1.5vh 3vh;
        border-radius: 4vh;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .control-btn {
        width: 5vh;
        height: 5vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
    }
    .control-btn:active {
        transform: scale(0.9);
        background: rgba(255, 255, 255, 0.2);
    }
    .control-btn.disabled {
        background: rgba(255, 255, 255, 0.8);
        color: #000;
    }
    .control-btn.end-call {
        background: #ef4444;
        width: 6vh;
        height: 6vh;
    }
    .control-btn.end-call:active {
        background: #dc2626;
    }
</style>
