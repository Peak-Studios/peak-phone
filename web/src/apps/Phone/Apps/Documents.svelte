<script>
    import BalloonEditor from "@ckeditor/ckeditor5-build-balloon";
    import AppWrapper from "../components/AppWrapper.svelte";
    import DocumentsSignature from "./components/DocumentsSignature.svelte";
    import { fade, fly, slide, scale } from "svelte/transition";

    import { CreateableDocumentTypes, DocumentTypes } from "../../../config";
    import {
        Delay,
        IsEnvBrowser,
        SendEvent,
        ShowSuccessModal,
    } from "../../../utils/Utils";
    import {
        PlayerData,
        CurrentDocument,
        LoaderModal,
        DocumentIsDrop,
    } from "../phone.stores";
    import { onDestroy, onMount } from "svelte";

    import * as DOCS from "./_documents";

    // Custom "Pill" selector for document types
    const _SelectDocumentTypes = DocumentTypes.map((Text, Index) => ({
        Value: Index,
        Text: Text,
    }));

    let Documents = [];
    let FilteredDocuments = [];
    let CurrentDocumentType = 0;
    let ShowingSignatures = false;
    let CreatingDocument = false;
    let DocumentsEditor;

    let SearchQuery = "";
    let ShowingOptionsDropdown = false;
    let DropdownPosition = { top: 0, left: 0 };
    let DropdownOptions = [];

    // Local Modal State
    let LocalModal = {
        visible: false,
        title: "",
        placeholder: "",
        value: "",
        isInput: true,
        isDanger: false,
        callback: null,
    };

    const ShowLocalModal = (Config) => {
        LocalModal = {
            visible: true,
            title: Config.title || "Confirm",
            placeholder: Config.placeholder || "",
            value: "",
            isInput: Config.isInput !== undefined ? Config.isInput : true,
            isDanger: Config.isDanger || false,
            callback: Config.callback,
        };
    };

    const CloseLocalModal = () => {
        LocalModal.visible = false;
    };

    const SubmitLocalModal = () => {
        if (LocalModal.callback) {
            LocalModal.callback(LocalModal.value);
        }
        CloseLocalModal();
    };

    const StartPermanentShare = () => {
        ShowLocalModal({
            title: "Permanent Share",
            placeholder: "Enter CID",
            callback: (Cid) => {
                if (!Cid) return;
                LoaderModal.set(true);
                SendEvent(
                    "Documents/AddSharee",
                    { Cid, Id: $CurrentDocument.id },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        if (Data.Success) {
                            ShowSuccessModal();
                        } else {
                            ShowLocalModal({
                                title: "Error",
                                isInput: false,
                                placeholder: Data.Msg,
                            });
                        }
                    },
                );
            },
        });
    };

    const StartDelete = () => {
        ShowLocalModal({
            title: "Delete Note",
            isInput: false,
            isDanger: true,
            placeholder: "Are you sure? This cannot be undone.",
            callback: () => {
                LoaderModal.set(true);
                SendEvent(
                    "Documents/DeleteDocument",
                    { Id: $CurrentDocument.id },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        if (Data.Success) {
                            ShowSuccessModal();
                            CloseDocument();
                            FetchDocuments();
                        } else {
                            ShowLocalModal({
                                title: "Error",
                                isInput: false,
                                placeholder: Data.Msg,
                            });
                        }
                    },
                );
            },
        });
    };

    const StartRequestSignature = () => {
        ShowLocalModal({
            title: "Request Signature",
            placeholder: "Enter CID",
            callback: (Cid) => {
                if (!Cid) return;
                LoaderModal.set(true);
                SendEvent(
                    "Documents/RequestSignature",
                    { Cid, Id: $CurrentDocument.id },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        if (Data.Success) {
                            ShowSuccessModal();
                            const NewDocument = $CurrentDocument;
                            NewDocument.signatures = Data.Signatures;
                            CurrentDocument.set(NewDocument);
                        } else {
                            ShowLocalModal({
                                title: "Error",
                                isInput: false,
                                placeholder: Data.Msg,
                            });
                        }
                    },
                );
            },
        });
    };

    const OpenDocument = async (Document) => {
        if ($CurrentDocument.id) {
            CloseDocument();
        }

        LoaderModal.set(true);
        CurrentDocument.set(Document);
        LoadDocumentEditor();
    };

    const CloseDocument = () => {
        CurrentDocument.set({});
        DocumentIsDrop.set(false);
        CreatingDocument = false;
        ShowingSignatures = false;
        ShowingOptionsDropdown = false;
    };

    const LoadDocumentEditor = async () => {
        while (!DocumentsEditor) {
            await Delay(0.25);
        }

        BalloonEditor.create(DocumentsEditor, {
            supportAllValues: true,
            toolbar: {
                items: [
                    "heading",
                    "|",
                    "bold",
                    "italic",
                    "|",
                    "blockQuote",
                    "|",
                    "undo",
                    "redo",
                    "|",
                    "numberedList",
                    "bulletedList",
                    "|",
                    "insertTable",
                ],
                shouldNotGroupWhenFull: true,
            },
            placeholder: "Start typing...",
        })
            .then((Editor) => {
                window.editor = Editor;
                LoaderModal.set(false);
                if ($CurrentDocument.content) {
                    window.editor.setData($CurrentDocument.content);
                } else {
                    window.editor.setData("");
                }

                if (!$CurrentDocument.Editing && !CreatingDocument)
                    window.editor.enableReadOnlyMode("readonly");
            })
            .catch((Error) => {
                console.error(Error);
                CloseDocument();
                LoaderModal.set(false);
            });
    };

    const FilterDocuments = () => {
        const Query = SearchQuery.toLowerCase();
        FilteredDocuments = Documents.filter((Val) => {
            return Val.title.toLowerCase().includes(Query);
        });
    };

    const FetchDocuments = (_) => {
        // Mock data for browser/dev mode
        if (IsEnvBrowser()) {
            const MockDocuments = [
                {
                    id: 1,
                    title: "Test Note 1",
                    type: 0,
                    content: "<p>This is a test note for development.</p>",
                    citizenid: "2001",
                    finalized: false,
                    editing: false,
                    signatures: [],
                },
                {
                    id: 2,
                    title: "Shopping List",
                    type: 0,
                    content: "<p>- Milk<br>- Bread<br>- Eggs</p>",
                    citizenid: "2001",
                    finalized: false,
                    editing: false,
                    signatures: [],
                },
            ].filter((doc) => doc.type === CurrentDocumentType);

            Documents = MockDocuments;
            FilteredDocuments = MockDocuments;
            return;
        }

        SendEvent(
            "Documents/GetDocuments",
            { Type: CurrentDocumentType },
            (Success, Data) => {
                if (!Success) return;
                Documents = Data;
                FilteredDocuments = Data;
            },
        );
    };

    const GetOptionsDropdown = () => {
        let Options = [];

        if ($CurrentDocument.type == 0) {
            Options.push({
                Icon: "qrcode",
                Text: "Drop QR Code",
                Cb: DOCS.DropQRCode,
            });
        }

        Options.push({
            Icon: "share-alt",
            Text: "Share (Local)",
            Cb: DOCS.SessionShareDocument,
        });

        Options.push({
            Icon: "share",
            Text: "Share (Permanent)",
            Cb: StartPermanentShare,
        });

        if ($CurrentDocument.finalized) {
            Options.push({
                Icon: "pen-nib",
                Text: "Signatures",
                Cb: () => {
                    ShowingSignatures = true;
                },
            });
        } else if ($CurrentDocument.type == 5 && !$CurrentDocument.finalized) {
            Options.push({
                Icon: "stamp",
                Text: "Finalize",
                Cb: DOCS.FinalizeDocument,
            });
        }

        if ($CurrentDocument.citizenid == $PlayerData.Cid) {
            Options.push({
                Icon: "trash",
                Text: "Delete",
                Cb: StartDelete,
                Danger: true,
            });
        }

        return Options;
    };

    const SaveDocument = () => {
        DOCS.EditMode(false);
        if (window.editor) window.editor.enableReadOnlyMode("readonly");

        LoaderModal.set(true);

        // Mock save for browser/dev mode
        if (IsEnvBrowser()) {
            setTimeout(() => {
                const Content = window.editor ? window.editor.getData() : "";
                const NewDocument = {
                    id: CreatingDocument
                        ? Documents.length + 1
                        : $CurrentDocument.id,
                    title: $CurrentDocument.title || "Untitled Note",
                    type: CurrentDocumentType,
                    content: Content,
                    citizenid: $PlayerData.Cid || "2001",
                    finalized: false,
                    editing: false,
                    signatures: [],
                };

                if (CreatingDocument) {
                    Documents.push(NewDocument);
                    FilteredDocuments = Documents;
                    ShowSuccessModal();
                    CurrentDocument.set({});
                    CreatingDocument = false;
                } else {
                    const Index = Documents.findIndex(
                        (d) => d.id === $CurrentDocument.id,
                    );
                    if (Index > -1) {
                        Documents[Index] = {
                            ...Documents[Index],
                            ...NewDocument,
                        };
                        FilteredDocuments = Documents;
                        CurrentDocument.set(NewDocument);
                    }
                }

                LoaderModal.set(false);
            }, 500);
            return;
        }

        SendEvent(
            "Documents/SaveDocument",
            {
                Id: $CurrentDocument.id,
                Title: $CurrentDocument.title,
                Type: CurrentDocumentType,
                Content: window.editor ? window.editor.getData() : "",
            },
            (Success, Data) => {
                LoaderModal.set(false);
                if (!Success) return;

                if (CreatingDocument) {
                    ShowSuccessModal();
                    CurrentDocument.set({});
                    CreatingDocument = false;
                }
            },
        );
    };

    const SetDocumentType = (Type) => {
        CurrentDocumentType = Type;
        FetchDocuments();
    };

    onMount(() => {
        FetchDocuments();
        if ($CurrentDocument.id) LoadDocumentEditor();
    });

    onDestroy(() => {
        if (window.editor) window.editor.destroy();
        window.editor = null;
    });
</script>

<AppWrapper>
    <div class="glass-container">
        <!-- BACKGROUND DEEP BLUR -->
        <div class="glass-bg"></div>

        <!-- MAIN VIEW (List) -->
        <div class="glass-header">
            <div class="gh-title">Documents</div>
            {#if CreateableDocumentTypes.includes(CurrentDocumentType)}
                <div
                    class="gh-add"
                    on:click={() => {
                        LoaderModal.set(true);
                        CreatingDocument = true;
                        LoadDocumentEditor();
                    }}
                >
                    <i class="fas fa-plus"></i>
                </div>
            {/if}
        </div>

        <div class="glass-scroll">
            <!-- SEARCH -->
            <div class="search-wrap">
                <div class="glass-search">
                    <i class="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search notes..."
                        bind:value={SearchQuery}
                        on:input={FilterDocuments}
                    />
                </div>
            </div>

            <!-- FILTERS -->
            <div class="notes-filters">
                {#each _SelectDocumentTypes as Type}
                    <div
                        class="notes-filter-chip {CurrentDocumentType ===
                        Type.Value
                            ? 'active'
                            : ''}"
                        on:click={() => SetDocumentType(Type.Value)}
                    >
                        {Type.Text}
                    </div>
                {/each}
            </div>

            <!-- LIST -->
            {#if FilteredDocuments.length === 0}
                <div class="glass-empty">
                    <i class="fas fa-sticky-note"></i>
                    <span>No notes found</span>
                </div>
            {:else}
                <div class="doc-list">
                    {#each FilteredDocuments as Data}
                        <div
                            class="glass-row"
                            on:click={() => OpenDocument(Data)}
                        >
                            <div class="gr-icon">
                                <i
                                    class="fas fa-{Data.citizenid ==
                                        $PlayerData.Cid && !Data.finalized
                                        ? 'sticky-note'
                                        : 'eye'}"
                                ></i>
                            </div>
                            <div class="gr-info">
                                <div class="gr-name">{Data.title}</div>
                                <div class="gr-sub">
                                    {#if Data.content}
                                        {@html Data.content
                                            .replace(/<[^>]*>?/gm, "")
                                            .substring(0, 30) + "..."}
                                    {:else}
                                        No content
                                    {/if}
                                </div>
                            </div>
                            <div class="gr-arrow">
                                <i class="fas fa-chevron-right"></i>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
            <div class="safe-padding"></div>
        </div>

        <!-- EDITOR OVERLAY -->
        {#if $CurrentDocument.id || CreatingDocument}
            <div
                class="glass-overlay"
                in:fly={{ y: 50, duration: 400 }}
                out:fly={{ y: 50, duration: 300 }}
            >
                <!-- Editor Header -->
                <div class="go-header">
                    <div class="go-back" on:click={CloseDocument}>
                        <i class="fas fa-arrow-left"></i> Back
                    </div>

                    <div class="go-title-input">
                        <input
                            type="text"
                            placeholder="Title"
                            bind:value={$CurrentDocument.title}
                            readonly={!CreatingDocument &&
                                !$CurrentDocument.editing}
                        />
                    </div>

                    <div class="editor-actions">
                        {#if CreatingDocument}
                            <div
                                class="glass-btn small"
                                on:click={SaveDocument}
                            >
                                <i class="fas fa-check"></i>
                            </div>
                        {:else if !$DocumentIsDrop}
                            {#if !$CurrentDocument.finalized}
                                {#if $CurrentDocument.citizenid == $PlayerData.Cid && !$CurrentDocument.editing}
                                    <div
                                        class="glass-btn small"
                                        on:click={() => {
                                            DOCS.EditMode(true);
                                            window.editor.disableReadOnlyMode(
                                                "readonly",
                                            );
                                        }}
                                    >
                                        <i class="fas fa-pen"></i>
                                    </div>
                                {:else if $CurrentDocument.editing}
                                    <div
                                        class="glass-btn small success"
                                        on:click={SaveDocument}
                                    >
                                        <i class="fas fa-check"></i>
                                    </div>
                                {/if}
                            {/if}

                            <div
                                class="glass-btn small"
                                on:click={(event) => {
                                    const IconPosition =
                                        event.target.getBoundingClientRect();
                                    const Left = IconPosition.left - 150;
                                    const Top = IconPosition.bottom + 5;

                                    DropdownOptions = GetOptionsDropdown();
                                    DropdownPosition = { top: Top, left: Left };
                                    ShowingOptionsDropdown =
                                        !ShowingOptionsDropdown;
                                }}
                            >
                                <i class="fas fa-ellipsis-v"></i>
                            </div>
                        {/if}
                    </div>
                </div>

                <!-- Editor Body -->
                <div class="go-body-editor">
                    {#if !ShowingSignatures}
                        <div
                            class="editor-wrapper"
                            bind:this={DocumentsEditor}
                        ></div>
                    {:else}
                        <!-- SIGNATURES VIEW -->
                        <div class="signatures-wrapper">
                            <div class="sig-header">
                                <span class="sh-title">Signatures</span>
                                <div
                                    class="sh-close"
                                    on:click={() => (ShowingSignatures = false)}
                                >
                                    Close
                                </div>
                            </div>

                            <div class="signatures-actions">
                                {#if $CurrentDocument.signatures.some((Data) => Data.Cid === $PlayerData.Cid && Data.Signed === false)}
                                    <div
                                        class="glass-btn wide success"
                                        on:click={DOCS.SignDocument}
                                    >
                                        Sign Document
                                    </div>
                                {/if}
                                {#if $CurrentDocument.citizenid == $PlayerData.Cid}
                                    <div
                                        class="glass-btn wide"
                                        on:click={StartRequestSignature}
                                    >
                                        Request Signature
                                    </div>
                                {/if}
                            </div>

                            <div class="signatures-list">
                                <DocumentsSignature
                                    Index={1}
                                    {...$CurrentDocument.signatures[0]}
                                />
                                <DocumentsSignature
                                    Index={2}
                                    {...$CurrentDocument.signatures[1]}
                                />
                                <DocumentsSignature
                                    Index={3}
                                    {...$CurrentDocument.signatures[2]}
                                />
                                <DocumentsSignature
                                    Index={4}
                                    {...$CurrentDocument.signatures[3]}
                                />
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- OPTION DROPDOWN -->
                {#if ShowingOptionsDropdown}
                    <div
                        class="glass-dropdown-overlay"
                        on:click={() => (ShowingOptionsDropdown = false)}
                    ></div>
                    <div
                        class="glass-dropdown"
                        style="top: 6vh; right: 2vh;"
                        transition:scale={{ start: 0.95, duration: 200 }}
                    >
                        {#each DropdownOptions as Option}
                            <div
                                class="gd-item {Option.Danger ? 'danger' : ''}"
                                on:click={() => {
                                    Option.Cb();
                                    ShowingOptionsDropdown = false;
                                }}
                            >
                                <i class="fas fa-{Option.Icon}"></i>
                                <span>{Option.Text}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- CUSTOM LOCAL MODAL -->
        {#if LocalModal.visible}
            <div class="blur-backdrop" transition:fade>
                <div
                    class="glass-modal"
                    transition:scale={{ start: 0.95, duration: 300 }}
                >
                    <div class="gm-head">
                        <span>{LocalModal.title}</span>
                        <div class="gm-close" on:click={CloseLocalModal}>
                            <i class="fas fa-times"></i>
                        </div>
                    </div>

                    <div class="gm-body">
                        {#if LocalModal.isInput}
                            <input
                                type="text"
                                class="gm-input"
                                placeholder={LocalModal.placeholder}
                                bind:value={LocalModal.value}
                                autofocus
                            />
                        {:else}
                            <div class="gm-text">{LocalModal.placeholder}</div>
                        {/if}

                        <div class="gm-actions">
                            <div class="gm-btn" on:click={CloseLocalModal}>
                                Cancel
                            </div>
                            <div
                                class="gm-btn {LocalModal.isDanger
                                    ? 'danger'
                                    : 'primary'}"
                                on:click={SubmitLocalModal}
                            >
                                {LocalModal.isInput ? "Confirm" : "Yes"}
                            </div>
                        </div>
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

    /* FILTERS */
    .notes-filters {
        display: flex;
        gap: 1vh;
        overflow-x: auto;
        padding-bottom: 1vh;
        margin-bottom: 1.5vh;
    }
    .notes-filters::-webkit-scrollbar {
        display: none;
    }
    .notes-filter-chip {
        padding: 0.6vh 1.2vh;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1.5vh;
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.6);
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.2s;
    }
    .notes-filter-chip.active {
        background: rgba(255, 255, 255, 0.9);
        color: #000;
        border-color: rgba(255, 255, 255, 0.9);
        font-weight: 600;
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

    /* EMPTY */
    .glass-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 40vh;
        opacity: 0.4;
        gap: 2vh;
    }
    .glass-empty i {
        font-size: 5vh;
    }
    .glass-empty span {
        font-size: 1.8vh;
        font-weight: 300;
    }

    /* LIST ITEMS */
    .glass-row {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 1.5vh;
        padding: 1.5vh;
        margin-bottom: 1vh;
        display: flex;
        align-items: center;
        gap: 1.5vh;
        border: 1px solid rgba(255, 255, 255, 0.03);
        transition: background 0.2s;
        cursor: pointer;
    }
    .glass-row:active {
        background: rgba(255, 255, 255, 0.08);
    }
    .gr-icon {
        width: 4vh;
        height: 4vh;
        border-radius: 1vh;
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.8vh;
        color: #fff;
        opacity: 0.8;
    }
    .gr-info {
        flex: 1;
        overflow: hidden;
    }
    .gr-name {
        font-size: 1.6vh;
        font-weight: 500;
        margin-bottom: 0.2vh;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .gr-sub {
        font-size: 1.3vh;
        opacity: 0.5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .gr-arrow {
        font-size: 1.2vh;
        opacity: 0.4;
    }

    /* OVERLAY */
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
        padding-top: 5vh;
        padding-bottom: 2vh;
    }

    .go-header {
        display: flex;
        align-items: center;
        padding: 0 2vh 2vh 2vh;
        gap: 2vh;
    }
    .go-back {
        font-size: 1.8vh;
        color: rgba(255, 255, 255, 0.7);
        display: flex;
        align-items: center;
        gap: 1vh;
        cursor: pointer;
    }
    .go-title-input {
        flex: 1;
    }
    .go-title-input input {
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        font-size: 2.2vh;
        font-weight: 600;
        color: #fff;
        font-family: inherit;
    }
    .go-body-editor {
        flex: 1;
        overflow: hidden;
        padding: 0 2vh;
        display: flex;
        flex-direction: column;
    }

    /* EDITOR ACTIONS */
    .editor-actions {
        display: flex;
        align-items: center;
        gap: 1vh;
    }
    .glass-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1.2vh;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #fff;
    }
    .glass-btn.small {
        width: 4vh;
        height: 4vh;
        font-size: 1.6vh;
    }
    .glass-btn.wide {
        width: 100%;
        height: 5vh;
        font-size: 1.6vh;
        font-weight: 500;
        margin-bottom: 1vh;
    }
    .glass-btn.success {
        background: #fff;
        color: #000;
    }

    /* EDITOR CONTAINER */
    .editor-wrapper {
        flex: 1;
        overflow-y: auto;
        padding: 1vh;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 1.5vh;
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: #fff;
    }

    /* MODAL STYLES */
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
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 2vh;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    .gm-head {
        padding: 2vh;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        font-size: 1.8vh;
    }
    .gm-close {
        opacity: 0.5;
        cursor: pointer;
    }
    .gm-body {
        padding: 2vh;
    }
    .gm-input {
        width: 100%;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 1.5vh;
        border-radius: 1vh;
        color: #fff;
        outline: none;
        font-size: 1.6vh;
        margin-bottom: 2vh;
    }
    .gm-text {
        text-align: center;
        opacity: 0.7;
        margin-bottom: 2vh;
        font-size: 1.5vh;
    }
    .gm-actions {
        display: flex;
        gap: 1.5vh;
    }
    .gm-btn {
        flex: 1;
        padding: 1.2vh;
        border-radius: 1vh;
        text-align: center;
        font-size: 1.5vh;
        font-weight: 500;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.05);
    }
    .gm-btn.primary {
        background: #fff;
        color: #000;
    }
    .gm-btn.danger {
        background: #ff4d4d;
        color: #fff;
    }

    /* DROPDOWN */
    .glass-dropdown-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 90;
    }
    .glass-dropdown {
        position: absolute;
        width: 20vh;
        background: rgba(30, 30, 35, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1.5vh;
        padding: 1vh;
        display: flex;
        flex-direction: column;
        gap: 0.5vh;
        z-index: 95;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
    }
    .gd-item {
        display: flex;
        align-items: center;
        gap: 1.5vh;
        padding: 1.2vh;
        border-radius: 1vh;
        font-size: 1.4vh;
        cursor: pointer;
        transition: background 0.2s;
        color: rgba(255, 255, 255, 0.8);
    }
    .gd-item:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }
    .gd-item.danger {
        color: #ff4d4d;
    }
    .gd-item.danger:hover {
        background: rgba(255, 77, 77, 0.1);
    }
    .gd-item i {
        width: 2vh;
        text-align: center;
    }

    /* CKEditor Overrides */
    :global(.ck.ck-editor__main > .ck-editor__editable) {
        background: transparent !important;
        border: none !important;
        color: #fff !important;
    }
    :global(.ck.ck-toolbar) {
        background: #2a2a2a !important;
        border-color: #333 !important;
    }
    :global(.ck.ck-button) {
        color: #fff !important;
    }
    :global(.ck.ck-button:hover) {
        background: #333 !important;
    }
</style>
