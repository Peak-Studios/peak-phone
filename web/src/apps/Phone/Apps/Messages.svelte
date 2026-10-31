<script>
    import * as MSG from "./_messages";
    import * as GRP from "./_groups";

    import { onMount, tick } from "svelte";
    import { fade, fly, slide } from "svelte/transition";
    import {
        GetLongTimeLabel,
        GetTimeLabel,
        OnEvent,
        SendEvent,
    } from "../../../utils/Utils";
    import {
        PlayerData,
        CurrentChat,
        CurrentGroup,
        ShowGroupInfo,
    } from "../phone.stores";

    import AppWrapper from "../components/AppWrapper.svelte";
    import Empty from "../components/Empty.svelte";
    import GroupInfo from "./components/GroupInfo.svelte";

    // --- State ---
    let activeTab = "chats"; // 'chats' | 'groups'
    let searchQuery = "";

    // Data
    let Chats = [];
    let Groups = [];
    let FilteredChats = [];
    let FilteredGroups = [];
    let FilteredTexts = [];
    let GroupMessages = [];

    // Voice Recording
    let isRecording = false;
    let recordingTime = 0;
    let recordingInterval;
    let mediaRecorder = null;
    let audioChunks = [];
    let messageInputEl;

    // --- Helpers ---
    const GetInitials = (Name) => {
        if (!Name) return "#";
        return Name.split(" ")
            .map((x) => x[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();
    };

    const FormatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const GetAvatarStyle = (url) => {
        if (url) return `background-image: url(${url})`;
        return `background: rgba(255, 255, 255, 0.1)`;
    };

    // --- Filtering ---
    const FilterChats = (Value) => {
        const Query = Value.toLowerCase();
        FilteredChats = Chats.filter(
            (Val) =>
                Val.to_phone.includes(Query) ||
                Val.name.toLowerCase().includes(Query),
        ).sort((a, b) => b.messages[0].Timestamp - a.messages[0].Timestamp);
    };

    const FilterGroups = (Value) => {
        const Query = Value.toLowerCase();
        FilteredGroups = Groups.filter((Val) =>
            Val.name.toLowerCase().includes(Query),
        ).sort(
            (a, b) =>
                (b.last_message?.Timestamp || b.created_at) -
                (a.last_message?.Timestamp || a.created_at),
        );
    };

    const FilterTexts = (Value) => {
        if (!$CurrentChat) return;
        const Query = Value.toLowerCase();
        FilteredTexts = $CurrentChat.messages
            .filter(
                (Val) =>
                    Val.Message.toLowerCase().includes(Query) ||
                    Val.Message.startsWith("data:audio"),
            )
            .sort((a, b) => a.Timestamp - b.Timestamp); // Oldest first
    };

    // --- Data Loading ---
    const loadChats = () => {
        SendEvent("Messages/GetChats", {}, (Success, Data) => {
            if (!Success) return;
            Chats = Object.values(Data);
            FilteredChats = [...Chats];
            FilterChats(searchQuery);

            if ($CurrentChat) {
                const updatedChat = Chats.find(
                    (Val) => Val.to_phone == $CurrentChat.to_phone,
                );
                if (updatedChat) {
                    CurrentChat.set(updatedChat);
                    FilterTexts("");
                    tick().then(scrollToBottom);
                }
            }
        });
    };

    const loadGroups = () => {
        SendEvent("Groups/GetGroups", {}, (Success, Data) => {
            if (!Success) return;
            Groups = Object.values(Data);
            FilteredGroups = [...Groups];
            FilterGroups(searchQuery);
        });
    };

    const loadGroupMessages = (groupId) => {
        SendEvent(
            "Groups/GetMessages",
            { GroupId: groupId },
            (Success, Data) => {
                if (!Success) return;
                GroupMessages = Data.sort((a, b) => a.Timestamp - b.Timestamp);
                tick().then(scrollToBottom);
            },
        );
    };

    const openGroup = (group) => {
        CurrentGroup.set(group);
        loadGroupMessages(group.group_id);
        SendEvent("Groups/SetRead", { GroupId: group.group_id });
    };

    // --- Voice Logic ---
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            mediaRecorder = window.PeakDuoVoiceNotes.recorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64String = reader.result;
                    sendVoiceMessage(base64String);
                };
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            recordingTime = 0;
            recordingInterval = setInterval(() => {
                recordingTime++;
                if(recordingTime>=15 || mediaRecorder.state==="inactive") stopRecording();
            }, 1000);
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            clearInterval(recordingInterval);
        }
    };

    const cancelRecording = () => {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            mediaRecorder.onstop = null;
            isRecording = false;
            clearInterval(recordingInterval);
            if (mediaRecorder.stream) {
                mediaRecorder.stream
                    .getTracks()
                    .forEach((track) => track.stop());
            }
        }
    };

    const sendVoiceMessage = (base64Audio) => {
        if ($CurrentChat) {
            MSG.SendMessage(base64Audio);
        } else if ($CurrentGroup) {
            GRP.SendGroupMessage(base64Audio);
        }
    };

    // --- Event Listeners ---
    OnEvent("Messages/SetChats", (Data) => {
        Chats = Object.values(Data.Chats);
        FilteredChats = [...Chats];
        FilterChats(searchQuery);
        if ($CurrentChat) {
            const updated = Chats.find(
                (c) => c.to_phone == $CurrentChat.to_phone,
            );
            if (updated) {
                CurrentChat.set(updated);
                FilterTexts("");
                scrollToBottom();
            }
        }
    });

    OnEvent("Groups/SetGroups", (Data) => {
        Groups = Object.values(Data.Groups);
        FilteredGroups = [...Groups];
        FilterGroups(searchQuery);
    });

    OnEvent("Groups/RefreshMessages", (Data) => {
        if ($CurrentGroup && $CurrentGroup.group_id === Data.GroupId) {
            loadGroupMessages(Data.GroupId);
        }
    });

    // --- Scroll ---
    let chatContainer;
    const scrollToBottom = () => {
        if (chatContainer) {
            setTimeout(() => {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }, 50);
        }
    };

    const getMessageInput = (e) => {
        if (messageInputEl) return messageInputEl;
        if (e?.currentTarget?.tagName === "INPUT") return e.currentTarget;

        return (
            e?.currentTarget
                ?.closest(".input-bar-glass")
                ?.querySelector(".input-wrapper input") ?? null
        );
    };

    const toggleAudioPlayback = (e) => {
        const player = e?.currentTarget?.closest(".audio-msg-glass");
        if (!player) return;

        const audio = player.querySelector("audio");
        if (!audio) return;

        if (audio.paused) {
            audio.play();
            player.classList.add("playing");
            return;
        }

        audio.pause();
        player.classList.remove("playing");
    };

    onMount(() => {
        loadChats();
        loadGroups();
    });

    // Handle Input
    const handleSend = (e) => {
        const input = getMessageInput(e);
        if (!input) return;

        const val = input.value.trim();
        if (!val) return;

        if ($CurrentChat) MSG.SendMessage(val);
        else if ($CurrentGroup) GRP.SendGroupMessage(val);

        input.value = "";
        input.focus();
    };

    const MarkAllAsRead = () => {
        SendEvent("Messages/MarkAllAsRead", {}, (Success) => {
            if (Success) {
                loadChats();
            }
        });
    };
</script>

<AppWrapper>
    <div class="glass-container">
        <!-- BACKGROUND DEEP BLUR -->
        <div class="glass-bg"></div>

        {#if !$CurrentChat && !$CurrentGroup}
            <!-- HEADER -->
            <div class="glass-header">
                <div class="gh-title">Messages</div>
                <div
                    class="gh-add"
                    on:click={() =>
                        activeTab === "chats"
                            ? MSG.SendMessageModal()
                            : GRP.CreateGroupModal()}
                >
                    <i class="fas fa-{activeTab === 'chats' ? 'pen' : 'plus'}"
                    ></i>
                </div>
            </div>

            <!-- SCROLL AREA -->
            <div class="glass-scroll">
                <!-- TABS & SEARCH -->
                <div class="top-controls">
                    <div class="glass-tabs">
                        <div
                            class="tab-btn"
                            class:active={activeTab === "chats"}
                            on:click={() => {
                                activeTab = "chats";
                                searchQuery = "";
                                FilterChats("");
                            }}
                        >
                            Chats
                        </div>
                        <div
                            class="tab-btn"
                            class:active={activeTab === "groups"}
                            on:click={() => {
                                activeTab = "groups";
                                searchQuery = "";
                                FilterGroups("");
                            }}
                        >
                            Groups
                        </div>
                    </div>

                    <div class="glass-search">
                        <i class="fas fa-search"></i>
                        <input
                            type="text"
                            placeholder="Search..."
                            bind:value={searchQuery}
                            on:input={() =>
                                activeTab === "chats"
                                    ? FilterChats(searchQuery)
                                    : FilterGroups(searchQuery)}
                        />
                    </div>
                </div>

                <!-- LIST -->
                <div class="list-body">
                    {#if activeTab === "chats"}
                        {#if FilteredChats.length === 0}
                            <div class="glass-empty">
                                <i class="far fa-comment-dots"></i>
                                <span>No messages</span>
                            </div>
                        {:else}
                            {#each FilteredChats as Chat (Chat.to_phone)}
                                <div
                                    class="glass-row"
                                    on:click={() => {
                                        CurrentChat.set(Chat);
                                        FilterTexts("");
                                        tick().then(scrollToBottom);
                                    }}
                                >
                                    <div
                                        class="gr-avatar"
                                        style={GetAvatarStyle(Chat.Avatar)}
                                    >
                                        {#if !Chat.Avatar}{GetInitials(
                                                Chat.name,
                                            )}{/if}
                                    </div>
                                    <div class="gr-info">
                                        <div class="gr-top">
                                            <span class="gr-name"
                                                >{Chat.name}</span
                                            >
                                            <span class="gr-time"
                                                >{GetTimeLabel(
                                                    Chat.messages[0].Timestamp,
                                                )}</span
                                            >
                                        </div>
                                        <div class="gr-btm">
                                            {#if Chat.messages[0].Attachments?.length > 0}
                                                <i
                                                    class="fas fa-image"
                                                    style="font-size: 1.2vh; margin-right: 0.5vh;"
                                                ></i> Photo
                                            {:else}
                                                {Chat.messages[0].Message}
                                            {/if}
                                        </div>
                                    </div>
                                    {#if MSG.GetUnreadCount(Chat) > 0}
                                        <div class="unread-dot"></div>
                                    {/if}
                                </div>
                            {/each}
                        {/if}
                    {:else if FilteredGroups.length === 0}
                        <div class="glass-empty">
                            <i class="fas fa-users"></i>
                            <span>No groups</span>
                        </div>
                    {:else}
                        {#each FilteredGroups as group}
                            <div
                                class="glass-row"
                                on:click={() => openGroup(group)}
                            >
                                <div class="gr-avatar group">
                                    {GRP.GetGroupInitials(group.name)}
                                </div>
                                <div class="gr-info">
                                    <div class="gr-top">
                                        <span class="gr-name">{group.name}</span
                                        >
                                        <span class="gr-time">
                                            {group.last_message
                                                ? GetTimeLabel(
                                                      group.last_message
                                                          .Timestamp,
                                                  )
                                                : ""}
                                        </span>
                                    </div>
                                    <div class="gr-btm">
                                        {@html GRP.GetGroupLastMessage(group)}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/if}
                </div>

                <div class="safe-padding"></div>
            </div>
        {:else}
            <!-- CHAT VIEW -->
            <div
                class="glass-overlay"
                in:fly={{ x: 50, duration: 400 }}
                out:fly={{ x: 50, duration: 300 }}
            >
                <div class="go-header chat-mode">
                    <button
                        class="back-btn"
                        on:click={() => {
                            if ($CurrentChat) {
                                SendEvent("Messages/SetChatRead", {
                                    ToPhone: $CurrentChat.to_phone,
                                    FromPhone: $PlayerData.PhoneNumber,
                                });
                                CurrentChat.set(false);
                            } else {
                                CurrentGroup.set(false);
                                loadGroups();
                            }
                        }}
                    >
                        <i class="fas fa-chevron-left"></i>
                    </button>

                    <div
                        class="chat-title-box"
                        on:click={() =>
                            $CurrentGroup && ShowGroupInfo.set(true)}
                    >
                        <div
                            class="ctb-avatar"
                            style={$CurrentChat && $CurrentChat.Avatar
                                ? GetAvatarStyle($CurrentChat.Avatar)
                                : ""}
                        >
                            {$CurrentChat
                                ? !$CurrentChat.Avatar
                                    ? GetInitials($CurrentChat.name)
                                    : ""
                                : GRP.GetGroupInitials($CurrentGroup.name)}
                        </div>
                        <div class="ctb-text">
                            <div class="ctb-name">
                                {$CurrentChat
                                    ? $CurrentChat.name
                                    : $CurrentGroup.name}
                            </div>
                            <div class="ctb-sub">
                                {$CurrentChat
                                    ? MSG.GetContactInformation(
                                          $CurrentChat,
                                      ).replace("<br/>", "")
                                    : `${$CurrentGroup.member_count} members`}
                            </div>
                        </div>
                    </div>

                    <div class="chat-actions">
                        {#if $CurrentChat}
                            <div
                                class="glass-btn small"
                                on:click={() =>
                                    MSG.CallContact($CurrentChat.to_phone)}
                            >
                                <i class="fas fa-phone"></i>
                            </div>
                        {:else}
                            <div
                                class="glass-btn small"
                                on:click={() => ShowGroupInfo.set(true)}
                            >
                                <i class="fas fa-info"></i>
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="chat-body" bind:this={chatContainer}>
                    {#if $CurrentChat}
                        {#each FilteredTexts as msg}
                            <div
                                class="msg-bubble-row"
                                class:me={MSG.IsMessageSender(msg)}
                            >
                                <div class="bubble">
                                    {#if msg.Message.startsWith("data:audio")}
                                        <div class="audio-msg-glass">
                                            <audio
                                                src={msg.Message}
                                                id={"audio-" + msg.Timestamp}
                                                on:ended={(e) =>
                                                    e.target
                                                        .closest(
                                                            ".audio-msg-glass",
                                                        )
                                                        .classList.remove(
                                                            "playing",
                                                        )}
                                            ></audio>
                                            <div
                                                class="play-control"
                                                on:click={toggleAudioPlayback}
                                            >
                                                <i class="fas fa-play play-ico"
                                                ></i>
                                                <i
                                                    class="fas fa-pause pause-ico"
                                                ></i>
                                            </div>
                                            <div class="wave">
                                                <span></span><span></span><span
                                                ></span><span></span>
                                            </div>
                                        </div>
                                    {:else}
                                        {msg.Message}
                                    {/if}
                                    <div class="msg-time">
                                        {GetTimeLabel(msg.Timestamp)}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {:else if $CurrentGroup}
                        {#each GroupMessages as msg}
                            <div
                                class="msg-bubble-row"
                                class:me={GRP.IsGroupMessageSender(msg)}
                            >
                                {#if !GRP.IsGroupMessageSender(msg)}
                                    <div class="sender-label">
                                        {msg.SenderName}
                                    </div>
                                {/if}
                                <div class="bubble">
                                    {#if msg.Message.startsWith("data:audio")}
                                        <div class="audio-msg-glass">
                                            <audio
                                                src={msg.Message}
                                                id={"g-audio-" + msg.Timestamp}
                                                on:ended={(e) =>
                                                    e.target
                                                        .closest(
                                                            ".audio-msg-glass",
                                                        )
                                                        .classList.remove(
                                                            "playing",
                                                        )}
                                            ></audio>
                                            <div
                                                class="play-control"
                                                on:click={toggleAudioPlayback}
                                            >
                                                <i class="fas fa-play play-ico"
                                                ></i>
                                                <i
                                                    class="fas fa-pause pause-ico"
                                                ></i>
                                            </div>
                                            <div class="wave">
                                                <span></span><span></span><span
                                                ></span><span></span>
                                            </div>
                                        </div>
                                    {:else}
                                        {msg.Message}
                                    {/if}
                                    <div class="msg-time">
                                        {GetTimeLabel(msg.Timestamp)}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    {/if}
                    <div class="safe-padding"></div>
                </div>

                <div class="input-bar-glass">
                    {#if isRecording}
                        <div class="rec-glass-ui" in:slide>
                            <div class="rec-timer">
                                <div class="dot-pulse"></div>
                                {FormatDuration(recordingTime)}
                            </div>
                            <div class="rec-acts">
                                <div
                                    class="glass-btn small danger"
                                    on:click={cancelRecording}
                                >
                                    <i class="fas fa-trash"></i>
                                </div>
                                <div
                                    class="glass-btn small active"
                                    on:click={stopRecording}
                                >
                                    <i class="fas fa-paper-plane"></i>
                                </div>
                            </div>
                        </div>
                    {:else}
                        <div class="input-wrapper">
                            <input
                                bind:this={messageInputEl}
                                type="text"
                                placeholder="Type a message..."
                                on:keydown={(e) =>
                                    e.key === "Enter" && handleSend(e)}
                            />
                        </div>
                        {#if $CurrentChat}
                            <div
                                class="glass-icon-btn"
                                on:click={() => MSG.SendLocation()}
                            >
                                <i class="fas fa-map-marker-alt"></i>
                            </div>
                        {/if}
                        <div
                            class="glass-icon-btn"
                            on:mousedown={startRecording}
                            on:touchstart={startRecording}
                        >
                            <i class="fas fa-microphone"></i>
                        </div>
                        <div class="glass-icon-btn send" on:click={handleSend}>
                            <i class="fas fa-arrow-up"></i>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        {#if $CurrentGroup && $ShowGroupInfo}
            <GroupInfo />
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

    /* TOP CONTROLS */
    .top-controls {
        margin-bottom: 2vh;
    }
    .glass-tabs {
        display: flex;
        background: rgba(40, 40, 50, 0.9);
        border-radius: 1.5vh;
        padding: 0.5vh;
        margin-bottom: 1.5vh;
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

    /* LIST ITEMS */
    .list-body {
        display: flex;
        flex-direction: column;
        gap: 0.8vh;
    }
    .glass-row {
        display: flex;
        align-items: center;
        gap: 1.5vh;
        padding: 1vh;
        border-radius: 1.5vh;
        transition: background 0.2s;
        cursor: pointer;
        position: relative;
    }
    .glass-row:hover {
        background: rgba(255, 255, 255, 0.05);
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
        font-size: 1.6vh;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .gr-avatar.group {
        border-radius: 1.5vh;
    }
    .gr-info {
        flex: 1;
        overflow: hidden;
    }
    .gr-top {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.5vh;
    }
    .gr-name {
        font-size: 1.6vh;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .gr-time {
        font-size: 1.2vh;
        opacity: 0.5;
    }
    .gr-btm {
        font-size: 1.4vh;
        opacity: 0.6;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
    }
    .unread-dot {
        width: 1vh;
        height: 1vh;
        background: #7a7aff;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(122, 122, 255, 0.5);
    }

    .glass-empty {
        margin-top: 10vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5vh;
        opacity: 0.4;
    }

    /* CHAT OVERLAY */
    .glass-overlay {
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
        z-index: 10;
        display: flex;
        flex-direction: column;
    }

    .go-header.chat-mode {
        padding: 5vh 2vh 2vh 2vh;
        display: flex;
        align-items: center;
        gap: 1.5vh;
        background: rgba(0, 0, 0, 0.5);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .back-btn {
        background: transparent;
        border: none;
        color: #fff;
        font-size: 2vh;
        cursor: pointer;
        width: 4vh;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .chat-title-box {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 1vh;
        cursor: pointer;
    }
    .ctb-avatar {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        background-size: cover;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4vh;
    }
    .ctb-text {
        display: flex;
        flex-direction: column;
    }
    .ctb-name {
        font-size: 1.5vh;
        font-weight: 500;
    }
    .ctb-sub {
        font-size: 1.2vh;
        opacity: 0.5;
    }

    .glass-btn.small {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6vh;
        cursor: pointer;
    }

    .chat-body {
        flex: 1;
        overflow-y: auto;
        padding: 2vh;
        display: flex;
        flex-direction: column;
        gap: 1vh;
    }
    .chat-body::-webkit-scrollbar {
        display: none;
    }

    /* MESSAGE BUBBLES */
    .msg-bubble-row {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        max-width: 80%;
    }
    .msg-bubble-row.me {
        align-items: flex-end;
        align-self: flex-end;
    }

    .sender-label {
        font-size: 1.1vh;
        opacity: 0.5;
        margin-bottom: 0.3vh;
        margin-left: 1vh;
    }

    .bubble {
        padding: 1.2vh 1.8vh;
        border-radius: 2vh;
        font-size: 1.5vh;
        line-height: 1.4;
        position: relative;
        background: rgba(40, 40, 50, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .me .bubble {
        background: linear-gradient(
            135deg,
            rgba(122, 122, 255, 0.3) 0%,
            rgba(122, 122, 255, 0.1) 100%
        );
        border-color: rgba(122, 122, 255, 0.2);
    }

    .msg-time {
        font-size: 1vh;
        opacity: 0.4;
        text-align: right;
        margin-top: 0.5vh;
    }

    /* AUDIO MSG */
    .audio-msg-glass {
        display: flex;
        align-items: center;
        gap: 1.5vh;
        padding-right: 1vh;
    }
    .play-control {
        width: 3.5vh;
        height: 3.5vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4vh;
        cursor: pointer;
    }
    .pause-ico,
    .playing .play-ico {
        display: none;
    }
    .playing .pause-ico {
        display: block;
    }
    .wave {
        display: flex;
        gap: 0.3vh;
        align-items: center;
        height: 2vh;
    }
    .wave span {
        width: 0.3vh;
        height: 100%;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 1vh;
    }

    /* INPUT BAR */
    .input-bar-glass {
        padding: 1.5vh;
        margin-bottom: 3vh;
        display: flex;
        align-items: center;
        gap: 1vh;
        background: rgba(0, 0, 0, 0.6);
        margin: 2vh;
        border-radius: 3vh;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .input-wrapper {
        flex: 1;
        height: 4vh;
        display: flex;
        align-items: center;
    }
    .input-wrapper input {
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        color: #fff;
        font-size: 1.5vh;
    }
    .glass-icon-btn {
        width: 3.5vh;
        height: 3.5vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.8vh;
        opacity: 0.6;
        cursor: pointer;
        transition: 0.2s;
    }
    .glass-icon-btn:hover {
        opacity: 1;
    }
    .glass-icon-btn.send {
        background: #fff;
        color: #000;
        border-radius: 50%;
        font-size: 1.4vh;
        opacity: 1;
        width: 4vh;
        height: 4vh;
    }

    /* RECORDING UI */
    .rec-glass-ui {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .rec-timer {
        display: flex;
        align-items: center;
        gap: 1vh;
        font-size: 1.4vh;
        font-weight: 500;
        color: #ff6b6b;
    }
    .dot-pulse {
        width: 1vh;
        height: 1vh;
        background: #ff6b6b;
        border-radius: 50%;
        animation: pulse 1s infinite;
    }
    @keyframes pulse {
        0% {
            opacity: 1;
        }
        50% {
            opacity: 0.3;
        }
        100% {
            opacity: 1;
        }
    }
    .rec-acts {
        display: flex;
        gap: 1vh;
    }
    .glass-btn.small.danger {
        color: #ff6b6b;
        background: rgba(255, 107, 107, 0.1);
    }
    .glass-btn.small.active {
        color: #4ade80;
        background: rgba(74, 222, 128, 0.1);
    }
</style>
