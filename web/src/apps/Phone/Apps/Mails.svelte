<script>
    import { onMount, createEventDispatcher } from "svelte";
    import { fade, fly, slide } from "svelte/transition";
    import AppWrapper from "../components/AppWrapper.svelte";
    import { SendEvent, GetTimeLabel } from "../../../utils/Utils";

    // --- State ---
    let Mails = [];
    let currentView = "list"; // 'list' | 'detail' | 'compose'
    let selectedMail = null;
    let loading = true;
    let searchQuery = "";

    // Compose State
    let composeRecipient = "";
    let composeSubject = "";
    let composeMessage = "";
    let sending = false;
    let composeErrors = { recipient: false, subject: false, message: false };

    // --- Computed ---
    $: groupedMails = groupMails(Mails, searchQuery);

    // --- Mails Logic ---
    const fetchMails = () => {
        loading = true;
        SendEvent("Mails/GetMails", {}, (Success, mails) => {
            if (Success && mails && Array.isArray(mails)) {
                Mails = mails;
            }
            loading = false;
        });
    };

    function groupMails(mails, query) {
        if (!mails) return {};

        let filtered = mails;
        if (query) {
            const q = query.toLowerCase();
            filtered = mails.filter(
                (m) =>
                    m.sender?.toLowerCase().includes(q) ||
                    m.subject?.toLowerCase().includes(q) ||
                    m.message?.toLowerCase().includes(q),
            );
        }

        const groups = {
            Today: [],
            Yesterday: [],
            Older: [],
        };

        const now = new Date();
        const today = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
        ).getTime();
        const yesterday = new Date(today - 86400000).getTime();

        filtered.forEach((mail) => {
            const ts = mail.timestamp;
            if (ts >= today) {
                groups.Today.push(mail);
            } else if (ts >= yesterday) {
                groups.Yesterday.push(mail);
            } else {
                groups.Older.push(mail);
            }
        });

        // Remove empty groups
        Object.keys(groups).forEach((key) => {
            if (groups[key].length === 0) delete groups[key];
        });

        return groups;
    }

    const openMail = (mail) => {
        selectedMail = mail;
        currentView = "detail";
        if (!mail.read) {
            // Optimistic update
            Mails = Mails.map((m) =>
                m.id === mail.id ? { ...m, read: 1 } : m,
            );
            SendEvent("Mails/MarkAsRead", { id: mail.id }, () => {});
        }
    };

    const deleteMail = (id) => {
        if (!id) return;
        SendEvent("Mails/DeleteMail", { id: id }, (Success, result) => {
            if (Success) {
                Mails = Mails.filter((m) => m.id !== id);
                if (currentView === "detail" && selectedMail?.id === id) {
                    goBack();
                }
            }
        });
    };

    const handleButton = (mail) => {
        if (mail.button && mail.button.event) {
            // SendEvent handles both server events and NUI callbacks
            SendEvent(mail.button.event, mail.button.data || {});
        }
    };

    // --- Compose Logic ---
    const startCompose = (replyToMail = null) => {
        if (replyToMail) {
            composeRecipient = replyToMail.sender;
            composeSubject = replyToMail.subject.startsWith("Re:")
                ? replyToMail.subject
                : `Re: ${replyToMail.subject}`;
            composeMessage = "";
        } else {
            composeRecipient = "";
            composeSubject = "";
            composeMessage = "";
        }
        composeErrors = { recipient: false, subject: false, message: false };
        currentView = "compose";
    };

    const validateCompose = () => {
        composeErrors = {
            recipient: !composeRecipient || composeRecipient.length < 3,
            subject: !composeSubject || composeSubject.length === 0,
            message: !composeMessage || composeMessage.length === 0,
        };
        return !Object.values(composeErrors).some(Boolean);
    };

    const sendMail = () => {
        if (!validateCompose()) return;

        sending = true;
        SendEvent(
            "Mails/SendMail",
            {
                targetPhone: composeRecipient,
                subject: composeSubject,
                message: composeMessage,
            },
            (success) => {
                sending = false;
                if (success) {
                    goBack();
                    // Optionally refresh mails if we sent to self or want to see sent?
                    // Usually mail apps don't show sent in inbox, but maybe we want to.
                }
            },
        );
    };

    // --- Navigation ---
    const goBack = () => {
        currentView = "list";
        selectedMail = null;
    };

    // --- Lifecycle ---
    onMount(() => {
        fetchMails();

        const messageHandler = (event) => {
            const data = event.data;
            if (data.Action === "Mails/UpdateMails") {
                if (data.Mail) {
                    Mails = [data.Mail, ...Mails];
                }
            } else if (data.Action === "Mails/ImportCompleted") {
                fetchMails();
            }
        };

        window.addEventListener("message", messageHandler);
        return () => window.removeEventListener("message", messageHandler);
    });
</script>

<AppWrapper>
    <div class="mails-app">
        <!-- BACKGROUND -->
        <div class="background-glass"></div>

        <!-- CONTENT -->
        <div class="content-container">
            <!-- LIST VIEW -->
            {#if currentView === "list"}
                <div
                    class="view-wrapper"
                    in:fade={{ duration: 250 }}
                    out:fade={{ duration: 150 }}
                >
                    <header class="app-header">
                        <h1>Inbox</h1>
                        <div class="header-actions">
                            <button
                                class="action-btn"
                                on:click={fetchMails}
                                disabled={loading}
                            >
                                <i
                                    class="fas fa-sync-alt {loading
                                        ? 'fa-spin'
                                        : ''}"
                                ></i>
                            </button>
                            <button
                                class="compose-btn"
                                on:click={() => startCompose()}
                            >
                                <i class="fas fa-pen"></i>
                            </button>
                        </div>
                    </header>

                    <div class="search-bar">
                        <i class="fas fa-search"></i>
                        <input
                            type="text"
                            placeholder="Search mails..."
                            bind:value={searchQuery}
                        />
                    </div>

                    <div class="mail-list">
                        {#if loading && Mails.length === 0}
                            <div class="empty-state">
                                <i class="fas fa-circle-notch fa-spin"></i>
                                <p>Loading...</p>
                            </div>
                        {:else if Object.keys(groupedMails).length === 0}
                            <div class="empty-state">
                                <div class="empty-icon-circle">
                                    <i class="fas fa-inbox"></i>
                                </div>
                                <h3>No Messages</h3>
                                <p>Your inbox is empty</p>
                            </div>
                        {:else}
                            {#each Object.entries(groupedMails) as [group, items]}
                                <div class="group-header">{group}</div>
                                <div class="group-items">
                                    {#each items as mail (mail.id || mail.timestamp)}
                                        <div
                                            class="mail-item {mail.read
                                                ? ''
                                                : 'unread'}"
                                            on:click={() => openMail(mail)}
                                        >
                                            {#if !mail.read}<div
                                                    class="unread-dot"
                                                ></div>{/if}
                                            <div class="avatar">
                                                {mail.sender
                                                    ? mail.sender[0].toUpperCase()
                                                    : "?"}
                                            </div>
                                            <div class="info">
                                                <div class="top-row">
                                                    <span class="sender"
                                                        >{mail.sender}</span
                                                    >
                                                    <span class="time"
                                                        >{GetTimeLabel(
                                                            mail.timestamp,
                                                        )}</span
                                                    >
                                                </div>
                                                <div class="subject">
                                                    {mail.subject}
                                                </div>
                                                <div class="preview">
                                                    {mail.message
                                                        .replace(
                                                            /<[^>]*>?/gm,
                                                            "",
                                                        )
                                                        .substring(0, 50)}
                                                </div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/each}
                        {/if}
                    </div>
                </div>

                <!-- DETAIL VIEW -->
            {:else if currentView === "detail" && selectedMail}
                <div
                    class="view-wrapper"
                    in:fly={{ x: 20, duration: 300 }}
                    out:fade={{ duration: 150 }}
                >
                    <header class="detail-header">
                        <button class="nav-btn" on:click={goBack}>
                            <i class="fas fa-chevron-left"></i>
                            <span>Back</span>
                        </button>
                        <div class="detail-actions">
                            <button
                                class="action-btn"
                                on:click={() => startCompose(selectedMail)}
                            >
                                <i class="fas fa-reply"></i>
                            </button>
                            <button
                                class="action-btn delete"
                                on:click={() => deleteMail(selectedMail.id)}
                            >
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </header>

                    <div class="mail-content">
                        <div class="mail-meta">
                            <div class="subject">{selectedMail.subject}</div>
                            <div class="sender-row">
                                <div class="avatar-large">
                                    <i class="fas fa-user"></i>
                                </div>
                                <div class="sender-info">
                                    <span class="sender-name"
                                        >{selectedMail.sender}</span
                                    >
                                    <span class="timestamp"
                                        >{GetTimeLabel(
                                            selectedMail.timestamp,
                                        )}</span
                                    >
                                </div>
                            </div>
                        </div>

                        <div class="mail-body">
                            {@html selectedMail.message}
                        </div>

                        {#if selectedMail.button}
                            <div class="mail-footer">
                                <button
                                    class="primary-btn"
                                    on:click={() => handleButton(selectedMail)}
                                >
                                    {selectedMail.button.label || "Accept"}
                                </button>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- COMPOSE VIEW -->
            {:else if currentView === "compose"}
                <div
                    class="view-wrapper"
                    in:fly={{ y: 200, duration: 300 }}
                    out:fade={{ duration: 150 }}
                >
                    <header class="compose-header">
                        <button class="nav-btn" on:click={goBack}>
                            <span style="font-size: 1.6vh;">Cancel</span>
                        </button>
                        <h1>New Message</h1>
                        <div style="width: 4vh"></div>
                        <!-- Spacer -->
                    </header>

                    <div class="compose-form">
                        <div class="fields-group">
                            <div
                                class="field-row {composeErrors.recipient
                                    ? 'error'
                                    : ''}"
                            >
                                <label>To:</label>
                                <input
                                    type="text"
                                    placeholder="Phone Number"
                                    bind:value={composeRecipient}
                                    on:input={() =>
                                        (composeErrors.recipient = false)}
                                />
                            </div>
                            <div class="divider"></div>
                            <div
                                class="field-row {composeErrors.subject
                                    ? 'error'
                                    : ''}"
                            >
                                <label>Subject:</label>
                                <input
                                    type="text"
                                    placeholder="Subject"
                                    bind:value={composeSubject}
                                    on:input={() =>
                                        (composeErrors.subject = false)}
                                />
                            </div>
                        </div>

                        <div
                            class="message-area {composeErrors.message
                                ? 'error'
                                : ''}"
                        >
                            <textarea
                                placeholder="Type your message..."
                                bind:value={composeMessage}
                                on:input={() => (composeErrors.message = false)}
                            ></textarea>
                        </div>
                    </div>

                    <div class="compose-footer">
                        <button
                            class="send-fab"
                            on:click={sendMail}
                            disabled={sending}
                        >
                            {#if sending}
                                <i class="fas fa-circle-notch fa-spin"></i>
                            {:else}
                                <i class="fas fa-paper-plane"></i>
                            {/if}
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</AppWrapper>

<style>
    /* Global Container Styles */
    .mails-app {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        font-family: "Inter", sans-serif;
        color: white;
    }

    .background-glass {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            135deg,
            rgba(20, 20, 25, 0.95),
            rgba(10, 10, 12, 0.98)
        );
        z-index: 0;
    }

    .background-glass::before {
        content: "";
        position: absolute;
        top: -20%;
        right: -20%;
        width: 80%;
        height: 60%;
        background: radial-gradient(
            circle,
            rgba(59, 130, 246, 0.08),
            transparent 60%
        );
        z-index: -1;
    }

    .content-container {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
    }

    .view-wrapper {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        padding-top: 5vh; /* Standard status bar offset */
    }

    /* Headers */
    .app-header,
    .detail-header,
    .compose-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 2vh 1.5vh 2vh;
        flex-shrink: 0;
    }

    .app-header h1 {
        font-size: 3.2vh;
        font-weight: 700;
        margin: 0;
        letter-spacing: -0.05vh;
    }

    .compose-header h1 {
        font-size: 2vh;
        font-weight: 600;
        margin: 0;
    }

    /* Buttons */
    .action-btn {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6vh;
        cursor: pointer;
        transition: all 0.2s;
    }
    .action-btn:hover {
        background: rgba(255, 255, 255, 0.2);
    }
    .action-btn:active {
        transform: scale(0.95);
    }
    .action-btn.delete:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
    }

    .compose-btn {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: #3b82f6;
        color: white;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6vh;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        transition: transform 0.2s;
    }
    .compose-btn:hover {
        transform: scale(1.05);
    }

    .nav-btn {
        background: transparent;
        border: none;
        color: #3b82f6;
        display: flex;
        align-items: center;
        gap: 0.5vh;
        font-size: 1.7vh;
        cursor: pointer;
        padding: 0.5vh;
        font-weight: 500;
    }
    .nav-btn:hover {
        color: #60a5fa;
    }

    .header-actions,
    .detail-actions {
        display: flex;
        gap: 1vh;
    }

    /* Search Bar */
    .search-bar {
        margin: 0 2vh 1.5vh 2vh;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 1vh;
        height: 4.2vh;
        display: flex;
        align-items: center;
        padding: 0 1.5vh;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .search-bar i {
        color: rgba(255, 255, 255, 0.4);
        font-size: 1.4vh;
        margin-right: 1vh;
    }
    .search-bar input {
        flex: 1;
        background: transparent;
        border: none;
        color: white;
        font-family: inherit;
        font-size: 1.4vh;
        outline: none;
    }

    /* Lists */
    .mail-list {
        flex: 1;
        overflow-y: auto;
        padding: 0 2vh 2vh 2vh;
    }
    .mail-list::-webkit-scrollbar {
        width: 0;
    }

    .group-header {
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.4);
        font-weight: 600;
        text-transform: uppercase;
        margin: 1.5vh 0.5vh 0.8vh 0.5vh;
        letter-spacing: 0.05vh;
    }

    .group-items {
        display: flex;
        flex-direction: column;
        gap: 0.8vh;
    }

    .mail-item {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 1.5vh;
        padding: 1.5vh;
        display: flex;
        gap: 1.5vh;
        cursor: pointer;
        position: relative;
        border: 1px solid rgba(255, 255, 255, 0.02);
        align-items: center;
    }
    .mail-item:hover {
        background: rgba(255, 255, 255, 0.06);
    }
    .mail-item.unread {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.08);
    }

    .unread-dot {
        position: absolute;
        left: 0.6vh;
        top: 50%;
        transform: translateY(-50%);
        width: 0.6vh;
        height: 0.6vh;
        background: #3b82f6;
        border-radius: 50%;
        box-shadow: 0 0 8px #3b82f6;
    }

    .avatar {
        width: 5vh;
        height: 5vh;
        border-radius: 50%;
        background: linear-gradient(135deg, #475569 0%, #334155 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2vh;
        font-weight: 600;
        color: #e2e8f0;
        flex-shrink: 0;
    }

    .info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2vh;
    }

    .top-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
    }
    .sender {
        font-weight: 600;
        font-size: 1.5vh;
        color: white;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 70%;
    }
    .time {
        font-size: 1.1vh;
        color: rgba(255, 255, 255, 0.4);
    }
    .subject {
        font-size: 1.3vh;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
    }
    .preview {
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.5);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .unread .sender,
    .unread .subject {
        font-weight: 700;
        color: white;
    }

    /* Empty State */
    .empty-state {
        height: 40vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.3);
        gap: 1.5vh;
    }
    .empty-icon-circle {
        width: 8vh;
        height: 8vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3vh;
    }

    /* Detail View */
    .mail-content {
        flex: 1;
        overflow-y: auto;
        padding: 0 2.5vh 2.5vh 2.5vh;
    }
    .mail-content::-webkit-scrollbar {
        width: 0;
    }

    .mail-meta {
        margin-bottom: 2.5vh;
        padding-bottom: 2vh;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .mail-meta .subject {
        font-size: 2.2vh;
        font-weight: 700;
        color: white;
        margin-bottom: 2vh;
        line-height: 1.3;
    }
    .sender-row {
        display: flex;
        align-items: center;
        gap: 1.5vh;
    }
    .avatar-large {
        width: 5vh;
        height: 5vh;
        border-radius: 50%;
        background: linear-gradient(135deg, #475569 0%, #334155 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.8vh;
        color: white;
    }
    .sender-info {
        display: flex;
        flex-direction: column;
    }
    .sender-name {
        font-weight: 600;
        font-size: 1.5vh;
    }
    .timestamp {
        font-size: 1.1vh;
        color: rgba(255, 255, 255, 0.5);
    }

    .mail-body {
        font-size: 1.5vh;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.9);
        white-space: pre-wrap;
        word-break: break-word;
    }
    .mail-body :global(img) {
        max-width: 100%;
        border-radius: 1vh;
        margin: 1vh 0;
    }

    .mail-footer {
        margin-top: 3vh;
        display: flex;
        justify-content: center;
    }
    .primary-btn {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
        border: none;
        padding: 1.2vh 4vh;
        border-radius: 1vh;
        font-weight: 600;
        font-size: 1.5vh;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
    }

    /* Compose View */
    .compose-form {
        flex: 1;
        padding: 0 2vh;
        display: flex;
        flex-direction: column;
        gap: 2vh;
    }
    .fields-group {
        background: rgba(255, 255, 255, 0.08);
        border-radius: 1.5vh;
        padding: 0 1.5vh;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .field-row {
        display: flex;
        align-items: center;
        height: 5vh;
    }
    .field-row label {
        width: 7vh;
        font-size: 1.4vh;
        color: rgba(255, 255, 255, 0.5);
        font-weight: 500;
    }
    .field-row input {
        flex: 1;
        background: transparent;
        border: none;
        font-size: 1.5vh;
        color: white;
        outline: none;
    }
    .divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
    }

    .message-area {
        flex: 1;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 1.5vh;
        padding: 1.5vh;
        display: flex;
    }
    .message-area textarea {
        width: 100%;
        height: 100%;
        background: transparent;
        border: none;
        resize: none;
        color: white;
        font-family: inherit;
        font-size: 1.5vh;
        outline: none;
        line-height: 1.5;
    }

    .compose-footer {
        padding: 2vh;
        display: flex;
        justify-content: flex-end;
    }
    .send-fab {
        width: 6vh;
        height: 6vh;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
        border: none;
        font-size: 2vh;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
        transition: transform 0.2s;
    }
    .send-fab:hover:not(:disabled) {
        transform: scale(1.05);
    }

    .error input,
    .error textarea {
        color: #ef4444;
    }
    .field-row.error label {
        color: #ef4444;
    }
</style>
