<script>
    import "../components/Misc.css";
    import { onMount, onDestroy } from "svelte";
    import { fade, scale, fly } from "svelte/transition";
    import { InputModal, LoaderModal } from "../phone.stores";
    import {
        GetContactsSelect,
        GetTimeLabel,
        IsEnvBrowser,
        NormalizeImageUrl,
        OnEvent,
        SendEvent,
        SetDropdown,
        ShowSuccessModal,
    } from "../../../utils/Utils";
    import { PhoneBackground, ProfilePicture } from "../phone.stores";

    import Button from "../../../components/Button/Button.svelte";
    import AppWrapper from "../components/AppWrapper.svelte";

    let Photos = [];
    let SelectedPhoto = null;
    let SelectedPhotoIndex = -1;
    let ShowingShareModal = false;
    let NearbyPlayers = [];
    let SelectedPlayerForShare = null;
    let IsLoading = true;

    // Mission 3: Lamar send mode
    let LamarSendEnabled = false;

    // Lazy loading observer
    let imageObserver;
    let loadedImages = new Set();

    const LoadPhotos = () => {
        IsLoading = true;
        SendEvent("Gallery/GetPhotos", {}, (Success, Data) => {
            IsLoading = false;
            if (Success) {
                Photos = (Data || []).map((Photo) => ({
                    ...Photo,
                    photo_url: NormalizeImageUrl(Photo.photo_url),
                }));
            }
        });
    };

    // Mission 3: Listen for Lamar mode toggle
    OnEvent("Gallery/SetLamarMode", (Data) => {
        LamarSendEnabled = Data?.Enabled ?? false;
    });

    // Mission 3: Send photo to Lamar
    const SendToLamar = (Photo) => {
        if (!Photo) return;
        LoaderModal.set(true);
        SendEvent(
            "Gallery/SendToLamar",
            { PhotoUrl: Photo.photo_url },
            (Success) => {
                LoaderModal.set(false);
                if (Success) {
                    ShowSuccessModal();
                    if (SelectedPhoto) ClosePhotoView();
                }
            },
        );
    };

    const DeletePhoto = (PhotoId) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Confirm",
                    Type: "TextField",
                    Data: {
                        Title: "Delete this photo?",
                        Select: [
                            { Text: "Cancel", Value: "cancel" },
                            { Text: "Delete", Value: "delete" },
                        ],
                        Value: "cancel",
                        RealValue: "Cancel",
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (Result.Confirm !== "delete") return;

                LoaderModal.set(true);
                SendEvent(
                    "Gallery/DeletePhoto",
                    { PhotoId: PhotoId },
                    (Success) => {
                        LoaderModal.set(false);
                        if (Success) {
                            Photos = Photos.filter((p) => p.id !== PhotoId);
                            ShowSuccessModal();
                            if (SelectedPhoto && SelectedPhoto.id === PhotoId) {
                                ClosePhotoView();
                            }
                        }
                    },
                );
            },
        });
    };

    const PostToTwatter = (Photo) => {
        if (!Photo) return;

        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Caption",
                    Type: "TextArea",
                    Data: {
                        Title: "Caption (optional)",
                        Placeholder: "Write a caption for your photo...",
                    },
                },
            ],
            OnSubmit: (Result) => {
                LoaderModal.set(true);
                SendEvent(
                    "Gallery/PostToTwatter",
                    {
                        PhotoId: Photo.id,
                        Caption: Result.Caption || "",
                    },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        if (Data) {
                            ShowSuccessModal();
                            if (SelectedPhoto) ClosePhotoView();
                        }
                    },
                );
            },
        });
    };

    const ShareToSpecificPlayer = (Photo) => {
        if (!Photo) return;

        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Target",
                    Type: "TextField",
                    Data: {
                        Title: "Citizen ID or Phone Number",
                        Icon: "user",
                        Placeholder: "1234 or 0612345678",
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (!Result.Target || Result.Target.length === 0) return;

                LoaderModal.set(true);
                SendEvent(
                    "Gallery/ShareToSpecificPlayer",
                    {
                        PhotoId: Photo.id,
                        Target: Result.Target,
                    },
                    (Success) => {
                        LoaderModal.set(false);
                        if (Success) {
                            ShowSuccessModal();
                            if (SelectedPhoto) ClosePhotoView();
                        }
                    },
                );
            },
        });
    };

    const ShareToAllNearby = (Photo) => {
        if (!Photo) return;

        SendEvent("Gallery/GetNearbyPlayers", {}, (Success, Data) => {
            if (Success) {
                const NearbyCount = Data?.length || 0;
                if (NearbyCount === 0) {
                    InputModal.set({
                        Visible: true,
                        Inputs: [
                            {
                                Id: "Info",
                                Type: "TextField",
                                Data: {
                                    Title: "No nearby players found. Get closer to share.",
                                    Value: "OK",
                                    Disabled: true,
                                },
                            },
                        ],
                        OnSubmit: () => {},
                    });
                    return;
                }

                InputModal.set({
                    Visible: true,
                    Inputs: [
                        {
                            Id: "Confirm",
                            Type: "TextField",
                            Data: {
                                Title: `Share with ${NearbyCount} nearby player${NearbyCount > 1 ? "s" : ""}?`,
                                Select: [
                                    { Text: "Cancel", Value: "cancel" },
                                    { Text: "Share", Value: "share" },
                                ],
                                Value: "cancel",
                                RealValue: "Cancel",
                            },
                        },
                    ],
                    OnSubmit: (Result) => {
                        if (Result.Confirm !== "share") return;

                        LoaderModal.set(true);
                        SendEvent(
                            "Gallery/ShareToAllNearby",
                            { PhotoId: Photo.id },
                            (ShareSuccess) => {
                                LoaderModal.set(false);
                                if (ShareSuccess) {
                                    ShowSuccessModal();
                                    if (SelectedPhoto) ClosePhotoView();
                                }
                            },
                        );
                    },
                });
            }
        });
    };

    const SendInMessage = async (Photo) => {
        if (!Photo) return;

        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Phone",
                    Type: "TextField",
                    IsPhone: true,
                    ContactPicker: true,
                    Data: {
                        Title: "Phone Number",
                        Icon: "phone",
                        Select: await GetContactsSelect(),
                        SearchSelect: true,
                    },
                },
                {
                    Id: "Message",
                    Type: "TextArea",
                    Data: {
                        Title: "Message (optional)",
                        Placeholder: "Add a message...",
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (!Result.Phone || Result.Phone.length === 0) return;

                LoaderModal.set(true);
                SendEvent(
                    "Gallery/SendInMessage",
                    {
                        PhotoUrl: Photo.photo_url,
                        Phone: Result.Phone,
                        Message: Result.Message || "",
                    },
                    (Success) => {
                        LoaderModal.set(false);
                        if (Success) {
                            ShowSuccessModal();
                            if (SelectedPhoto) ClosePhotoView();
                        }
                    },
                );
            },
        });
    };

    const SetAsWallpaper = (Photo) => {
        if (!Photo || !Photo.photo_url) return;

        LoaderModal.set(true);
        // Update the client store immediately for instant feedback
        PhoneBackground.set(Photo.photo_url);

        // Persist to server (creates a preference saved in DB)
        SendEvent(
            "Phone/SetPreference",
            {
                Id: "Phone.Background",
                Value: Photo.photo_url,
            },
            (Success) => {
                LoaderModal.set(false);
                if (Success) {
                    // Determine if it was an import or a capture
                    ShowSuccessModal();
                    if (SelectedPhoto) ClosePhotoView();
                }
            },
        );
    };

    const SetAsProfilePicture = (Photo) => {
        if (!Photo || !Photo.photo_url) return;

        LoaderModal.set(true);
        ProfilePicture.set(Photo.photo_url);

        SendEvent("UpdateProfilePicture", Photo.photo_url, (Success) => {
            LoaderModal.set(false);
            ShowSuccessModal();
            if (SelectedPhoto) ClosePhotoView();
        });
    };

    const ImportPhotoFromUrl = () => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "PhotoUrl",
                    Type: "TextField",
                    Data: {
                        Title: "Import Photo from URL",
                        Icon: "link",
                        Placeholder: "https://example.com/image.jpg",
                    },
                },
            ],
            OnSubmit: async (Result) => {
                if (!Result.PhotoUrl || Result.PhotoUrl.trim().length === 0) {
                    return;
                }

                const url = Result.PhotoUrl.trim();
                const normalizedUrl = NormalizeImageUrl(url);

                // Validate URL format - support URLs with query parameters (like Discord CDN links)
                // Pattern: Must start with http:// or https:// and contain a valid image extension
                // Extension can be anywhere in the path and followed by query params or end of string
                const urlPattern = /^https?:\/\/.+/i;
                const hasValidProtocol = urlPattern.test(url);

                if (!hasValidProtocol) {
                    InputModal.set({
                        Visible: true,
                        Inputs: [
                            {
                                Id: "Error",
                                Type: "TextField",
                                Data: {
                                    Title: "Invalid URL",
                                    Value: "URL must start with http:// or https://",
                                    Disabled: true,
                                },
                            },
                        ],
                        OnSubmit: () => {},
                    });
                    return;
                }

                // Check for valid image extension (more flexible pattern to support various URL formats)
                // Pattern matches extension followed by: query params, hash, slash, or end of string
                const extensionPattern =
                    /\.(jpg|jpeg|png|gif|webp)(\?|&|#|\/|$)/i;
                if (!extensionPattern.test(url)) {
                    InputModal.set({
                        Visible: true,
                        Inputs: [
                            {
                                Id: "Error",
                                Type: "TextField",
                                Data: {
                                    Title: "Invalid URL",
                                    Value: "Please enter a valid image URL (jpg, png, gif, webp)",
                                    Disabled: true,
                                },
                            },
                        ],
                        OnSubmit: () => {},
                    });
                    return;
                }

                // Send to server immediately (no client-side verification due to CORS restrictions)
                LoaderModal.set(true);
                SendEvent(
                    "Gallery/ImportPhoto",
                    { PhotoUrl: normalizedUrl },
                    (Success) => {
                        LoaderModal.set(false);
                        if (Success) {
                            ShowSuccessModal();
                            LoadPhotos();
                        } else {
                            InputModal.set({
                                Visible: true,
                                Inputs: [
                                    {
                                        Id: "Error",
                                        Type: "TextField",
                                        Data: {
                                            Title: "Import Failed",
                                            Value: "Failed to import photo. Please check the URL and try again.",
                                            Disabled: true,
                                        },
                                    },
                                ],
                                OnSubmit: () => {},
                            });
                        }
                    },
                );
            },
        });
    };

    const ConfirmShare = () => {
        if (!SelectedPhoto || !SelectedPlayerForShare) return;

        SendEvent(
            "Gallery/SharePhoto",
            {
                PhotoId: SelectedPhoto.id,
                TargetSource: SelectedPlayerForShare.source,
            },
            (Success) => {
                if (Success) {
                    ShowSuccessModal();
                    ShowingShareModal = false;
                    SelectedPhoto = null;
                    SelectedPlayerForShare = null;
                }
            },
        );
    };

    const ViewPhoto = (Photo, index) => {
        SelectedPhoto = Photo;
        SelectedPhotoIndex = index;
    };

    const ClosePhotoView = () => {
        SelectedPhoto = null;
        SelectedPhotoIndex = -1;
    };

    const NavigatePhoto = (direction) => {
        if (!SelectedPhoto || Photos.length <= 1) return;

        let newIndex = SelectedPhotoIndex + direction;
        if (newIndex < 0) newIndex = Photos.length - 1;
        if (newIndex >= Photos.length) newIndex = 0;

        SelectedPhoto = Photos[newIndex];
        SelectedPhotoIndex = newIndex;
    };

    // Keyboard navigation
    const handleKeydown = (event) => {
        if (!SelectedPhoto) return;

        if (event.key === "Escape") {
            ClosePhotoView();
        } else if (event.key === "ArrowLeft") {
            NavigatePhoto(-1);
        } else if (event.key === "ArrowRight") {
            NavigatePhoto(1);
        }
    };

    // Context menu handler
    const HandleContextMenu = (event, Photo) => {
        event.preventDefault();

        SetDropdown(true, GetPhotoOptionsDropdown(Photo), {
            Left: event.clientX,
            Top: event.clientY,
        });
    };

    // Build context menu options
    const GetPhotoOptionsDropdown = (Photo) => {
        let options = [];

        // Mission 3: Add Send to Lamar option if enabled
        if (LamarSendEnabled) {
            options.push({
                Icon: "paper-plane",
                Text: "Send to Lamar",
                Cb: () => SendToLamar(Photo),
            });
        }

        options.push(
            {
                Icon: "user",
                Text: "Share to Player",
                Cb: () => ShareToSpecificPlayer(Photo),
            },
            {
                Icon: "image",
                Text: "Set as Wallpaper",
                Cb: () => SetAsWallpaper(Photo),
            },
            {
                Icon: "user-circle",
                Text: "Set as Profile Picture",
                Cb: () => SetAsProfilePicture(Photo),
            },
            {
                Icon: "users",
                Text: "Share to Nearby",
                Cb: () => ShareToAllNearby(Photo),
            },
            {
                Icon: "bird",
                Text: "Post to Y",
                Cb: () => PostToTwatter(Photo),
            },
            {
                Icon: "comment",
                Text: "Send in Message",
                Cb: () => SendInMessage(Photo),
            },
            {
                Icon: "trash",
                Text: "Delete",
                Cb: () => DeletePhoto(Photo.id),
            },
        );

        return options;
    };

    // Lazy loading for images
    const setupLazyLoading = () => {
        if (typeof IntersectionObserver === "undefined") return;

        imageObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const src = img.dataset.src;
                        if (src) {
                            // Set referrer policy to bypass CORS restrictions
                            img.referrerPolicy = "no-referrer";
                            // Set error handler before setting src
                            img.onerror = () => {
                                console.warn(
                                    "[Gallery] Failed to load image:",
                                    src,
                                );
                                img.alt = "Failed to load image";
                                img.style.backgroundColor =
                                    "rgba(255, 255, 255, 0.1)";
                            };
                            img.src = src;
                            loadedImages.add(src);
                            imageObserver.unobserve(img);
                        }
                    }
                });
            },
            { rootMargin: "50px" },
        );
    };

    const observeImage = (node, src) => {
        if (loadedImages.has(src)) {
            node.src = src;
            // Set referrer policy to bypass CORS restrictions for external images
            node.referrerPolicy = "no-referrer";
            return {};
        }

        node.dataset.src = src;
        // Set referrer policy to bypass CORS restrictions for external images
        node.referrerPolicy = "no-referrer";

        // Add error handler for debugging broken images
        node.onerror = () => {
            console.warn("[Gallery] Failed to load image:", src);
            // Show a placeholder or error indicator instead of hiding
            node.alt = "Failed to load image";
            node.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
        };

        if (imageObserver) {
            imageObserver.observe(node);
        } else {
            node.src = src;
        }

        return {
            destroy() {
                if (imageObserver) {
                    imageObserver.unobserve(node);
                }
            },
        };
    };

    OnEvent("Gallery/SharedPhoto", (Data) => {
        if (Data && Data.PhotoUrl) {
            SelectedPhoto = {
                photo_url: Data.PhotoUrl,
                timestamp: new Date().toISOString(),
            };
            SelectedPhotoIndex = -1;
        }
    });

    OnEvent("Gallery/RefreshPhotos", () => {
        LoadPhotos();
    });

    OnEvent("Gallery/PhotoCaptured", (Data) => {
        if (Data && Data.PhotoUrl) {
            InputModal.set({
                Visible: true,
                Inputs: [
                    {
                        Id: "PostToTwatter",
                        Type: "TextField",
                        Data: {
                            Title: "Post to Y?",
                            Select: [
                                { Text: "Just Save to Gallery", Value: "save" },
                                { Text: "Post to Y", Value: "twatter" },
                            ],
                            Value: "save",
                            RealValue: "Just Save to Gallery",
                        },
                    },
                    {
                        Id: "Caption",
                        Type: "TextArea",
                        Data: {
                            Title: "Caption (optional)",
                            Placeholder: "Write a caption...",
                        },
                    },
                ],
                OnSubmit: (Result) => {
                    if (Result.PostToTwatter === "twatter") {
                        LoaderModal.set(true);
                        SendEvent(
                            "Gallery/PostToTwatter",
                            {
                                PhotoUrl: Data.PhotoUrl,
                                Caption: Result.Caption || "",
                            },
                            (Success, ResponseData) => {
                                LoaderModal.set(false);
                                if (!Success) return;
                                if (ResponseData) ShowSuccessModal();
                            },
                        );
                    }
                },
            });
        }
    });

    onMount(() => {
        setupLazyLoading();
        LoadPhotos();
        window.addEventListener("keydown", handleKeydown);
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeydown);
        if (imageObserver) {
            imageObserver.disconnect();
        }
    });
</script>

<AppWrapper>
    <!-- Header with photo count -->
    <div class="gallery-header">
        <h2 class="gallery-title">Gallery</h2>
        <div class="gallery-header-actions">
            {#if Photos.length > 0}
                <span class="gallery-count"
                    >{Photos.length} photo{Photos.length !== 1 ? "s" : ""}</span
                >
            {/if}
            <button
                class="gallery-import-btn"
                on:click={ImportPhotoFromUrl}
                title="Import Photo from URL"
            >
                <i class="fas fa-upload"></i>
            </button>
        </div>
    </div>

    {#if IsLoading}
        <!-- Loading skeleton -->
        <div class="gallery-container">
            <div class="gallery-grid">
                {#each Array(6) as _, i}
                    <div
                        class="gallery-item skeleton"
                        style="animation-delay: {i * 100}ms"
                    >
                        <div class="skeleton-shimmer"></div>
                    </div>
                {/each}
            </div>
        </div>
    {:else if Photos.length === 0}
        <!-- Empty state -->
        <div class="gallery-empty" in:fade={{ duration: 300 }}>
            <div class="empty-icon">
                <i class="fas fa-camera"></i>
            </div>
            <h3>No Photos Yet</h3>
            <p>Take your first photo using the camera</p>
            <div class="empty-hint">
                <i class="fas fa-info-circle"></i>
                Press <kbd>M</kbd> → Camera → <kbd>Enter</kbd>
            </div>
        </div>
    {:else}
        <!-- Photo grid -->
        <div class="gallery-container">
            <div class="gallery-grid">
                {#each Photos as Photo, index (Photo.id)}
                    <div
                        class="gallery-item"
                        on:click={() => ViewPhoto(Photo, index)}
                        on:contextmenu={(e) => HandleContextMenu(e, Photo)}
                        on:keypress={(e) =>
                            e.key === "Enter" && ViewPhoto(Photo, index)}
                        role="button"
                        tabindex="0"
                        in:scale={{
                            duration: 200,
                            delay: index * 30,
                            start: 0.9,
                        }}
                    >
                        <img
                            use:observeImage={Photo.photo_url}
                            alt=""
                            loading="lazy"
                            referrerpolicy="no-referrer"
                        />
                        <div class="gallery-item-overlay">
                            <i class="fas fa-expand"></i>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <!-- Photo viewer -->
    {#if SelectedPhoto && !ShowingShareModal}
        <div
            class="gallery-viewer"
            on:click={ClosePhotoView}
            on:keypress={(e) => e.key === "Escape" && ClosePhotoView()}
            role="button"
            tabindex="0"
            transition:fade={{ duration: 200 }}
        >
            <div
                class="gallery-viewer-content"
                on:click|stopPropagation
                on:keypress|stopPropagation
                role="button"
                tabindex="0"
                transition:scale={{ duration: 200, start: 0.95 }}
            >
                <!-- Navigation arrows -->
                {#if Photos.length > 1}
                    <button
                        class="viewer-nav prev"
                        on:click={() => NavigatePhoto(-1)}
                    >
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button
                        class="viewer-nav next"
                        on:click={() => NavigatePhoto(1)}
                    >
                        <i class="fas fa-chevron-right"></i>
                    </button>
                {/if}

                <img
                    src={SelectedPhoto.photo_url}
                    alt=""
                    class="gallery-viewer-image"
                    referrerpolicy="no-referrer"
                    on:error={(e) => {
                        console.warn(
                            "[Gallery] Failed to load image in viewer:",
                            SelectedPhoto.photo_url,
                        );
                        e.target.alt = "Failed to load image";
                    }}
                    on:contextmenu={(e) => HandleContextMenu(e, SelectedPhoto)}
                />

                {#if SelectedPhoto.timestamp}
                    <div class="gallery-viewer-date">
                        {GetTimeLabel(SelectedPhoto.timestamp)}
                    </div>
                {/if}

                {#if Photos.length > 1}
                    <div class="gallery-viewer-counter">
                        {SelectedPhotoIndex + 1} / {Photos.length}
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Share modal -->
    {#if ShowingShareModal}
        <div class="gallery-share-modal" transition:fade={{ duration: 200 }}>
            <div
                class="gallery-share-content"
                transition:scale={{ duration: 200, start: 0.95 }}
            >
                <h2>Share Photo</h2>
                <p>Select a nearby player:</p>
                {#if NearbyPlayers.length === 0}
                    <p class="gallery-no-players">No nearby players found</p>
                {:else}
                    <div class="gallery-players-list">
                        {#each NearbyPlayers as Player}
                            <div
                                class="gallery-player-item"
                                class:selected={SelectedPlayerForShare &&
                                    SelectedPlayerForShare.source ===
                                        Player.source}
                                on:click={() =>
                                    (SelectedPlayerForShare = Player)}
                                on:keypress={(e) =>
                                    e.key === "Enter" &&
                                    (SelectedPlayerForShare = Player)}
                                role="button"
                                tabindex="0"
                            >
                                <i class="fas fa-user"></i>
                                <span>{Player.name}</span>
                                <span class="gallery-player-distance"
                                    >{Player.distance}m</span
                                >
                            </div>
                        {/each}
                    </div>
                {/if}
                <div class="gallery-share-actions">
                    <Button
                        Icon="check"
                        Label="Share"
                        on:click={ConfirmShare}
                        Disabled={!SelectedPlayerForShare ||
                            NearbyPlayers.length === 0}
                    />
                    <Button
                        Icon="times"
                        Label="Cancel"
                        on:click={() => {
                            ShowingShareModal = false;
                            SelectedPhoto = null;
                            SelectedPlayerForShare = null;
                        }}
                    />
                </div>
            </div>
        </div>
    {/if}
</AppWrapper>

<style>
    /* Header */
    .gallery-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 3.5vh 1.5vh 1vh 1.5vh;
    }

    .gallery-title {
        margin: 0;
        font-size: 2.2vh;
        font-weight: 600;
        background: linear-gradient(
            135deg,
            #fff 0%,
            rgba(255, 255, 255, 0.8) 100%
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .gallery-header-actions {
        display: flex;
        align-items: center;
        gap: 1vh;
    }

    .gallery-count {
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.5);
        background: rgba(255, 255, 255, 0.08);
        padding: 0.4vh 1vh;
        border-radius: 2vh;
    }

    .gallery-import-btn {
        width: 3.5vh;
        height: 3.5vh;
        border-radius: 50%;
        background: rgba(102, 126, 234, 0.2);
        border: 1px solid rgba(102, 126, 234, 0.4);
        color: rgba(102, 126, 234, 0.9);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-size: 1.4vh;
        padding: 0;
    }

    .gallery-import-btn:hover {
        background: rgba(102, 126, 234, 0.4);
        border-color: rgba(102, 126, 234, 0.6);
        transform: scale(1.1);
    }

    .gallery-import-btn:active {
        transform: scale(0.95);
    }

    /* Container */
    .gallery-container {
        padding: 0.5vh 1vh 1vh;
        height: calc(100% - 6vh);
        overflow-y: auto;
        overflow-x: hidden;
    }

    .gallery-container::-webkit-scrollbar {
        width: 0.3vh;
    }

    .gallery-container::-webkit-scrollbar-track {
        background: transparent;
    }

    .gallery-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 1vh;
    }

    /* Grid */
    .gallery-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.8vh;
    }

    .gallery-item {
        position: relative;
        aspect-ratio: 1;
        overflow: hidden;
        border-radius: 1vh;
        cursor: pointer;
        background: linear-gradient(
            135deg,
            rgba(102, 126, 234, 0.1) 0%,
            rgba(118, 75, 162, 0.1) 100%
        );
        border: 1px solid rgba(255, 255, 255, 0.08);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .gallery-item:hover {
        transform: scale(1.03);
        border-color: rgba(102, 126, 234, 0.4);
        box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.3),
            0 0 20px rgba(102, 126, 234, 0.2);
    }

    .gallery-item:active {
        transform: scale(0.98);
    }

    .gallery-item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
    }

    .gallery-item:hover img {
        transform: scale(1.1);
    }

    .gallery-item-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            180deg,
            transparent 60%,
            rgba(0, 0, 0, 0.6) 100%
        );
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.25s ease;
    }

    .gallery-item:hover .gallery-item-overlay {
        opacity: 1;
    }

    .gallery-item-overlay i {
        color: white;
        font-size: 1.8vh;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    }

    /* Skeleton loading */
    .gallery-item.skeleton {
        background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.05) 0%,
            rgba(255, 255, 255, 0.02) 100%
        );
        animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.08) 50%,
            transparent 100%
        );
        animation: shimmer 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.6;
        }
    }

    @keyframes shimmer {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(100%);
        }
    }

    /* Empty state */
    .gallery-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: calc(100% - 8vh);
        text-align: center;
        padding: 2vh;
    }

    .empty-icon {
        width: 8vh;
        height: 8vh;
        border-radius: 50%;
        background: linear-gradient(
            135deg,
            rgba(102, 126, 234, 0.2) 0%,
            rgba(118, 75, 162, 0.2) 100%
        );
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 2vh;
        border: 1px solid rgba(102, 126, 234, 0.3);
    }

    .empty-icon i {
        font-size: 3vh;
        color: rgba(102, 126, 234, 0.8);
    }

    .gallery-empty h3 {
        margin: 0 0 0.8vh;
        font-size: 1.8vh;
        font-weight: 600;
        color: white;
    }

    .gallery-empty p {
        margin: 0;
        font-size: 1.3vh;
        color: rgba(255, 255, 255, 0.6);
    }

    .empty-hint {
        margin-top: 2vh;
        padding: 1vh 1.5vh;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 0.8vh;
        font-size: 1.1vh;
        color: rgba(255, 255, 255, 0.5);
        display: flex;
        align-items: center;
        gap: 0.8vh;
    }

    .empty-hint kbd {
        background: rgba(255, 255, 255, 0.1);
        padding: 0.2vh 0.5vh;
        border-radius: 0.3vh;
        font-family: monospace;
        font-size: 1vh;
    }

    /* Photo viewer */
    .gallery-viewer {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.95);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .gallery-viewer-content {
        position: relative;
        max-width: 95%;
        max-height: 90%;
        cursor: default;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .gallery-viewer-image {
        max-width: 100%;
        max-height: 65vh;
        object-fit: contain;
        border-radius: 1vh;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }

    /* Navigation arrows */
    .viewer-nav {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 10;
    }

    .viewer-nav:hover {
        background: rgba(102, 126, 234, 0.4);
        border-color: rgba(102, 126, 234, 0.6);
        transform: translateY(-50%) scale(1.1);
    }

    .viewer-nav.prev {
        left: -5vh;
    }

    .viewer-nav.next {
        right: -5vh;
    }

    /* Action buttons */
    .gallery-viewer-actions {
        display: flex;
        gap: 1vh;
        margin-top: 1.5vh;
    }

    .action-btn {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        font-size: 1.4vh;
    }

    .action-btn:hover {
        background: rgba(102, 126, 234, 0.4);
        border-color: rgba(102, 126, 234, 0.6);
        transform: scale(1.15);
    }

    .action-btn.danger:hover {
        background: rgba(239, 68, 68, 0.4);
        border-color: rgba(239, 68, 68, 0.6);
    }

    .action-btn.close {
        margin-left: 1vh;
    }

    .gallery-viewer-date {
        text-align: center;
        color: rgba(255, 255, 255, 0.5);
        font-size: 1.1vh;
        margin-top: 1vh;
    }

    .gallery-viewer-counter {
        position: absolute;
        bottom: -3vh;
        left: 50%;
        transform: translateX(-50%);
        color: rgba(255, 255, 255, 0.4);
        font-size: 1.1vh;
        background: rgba(0, 0, 0, 0.5);
        padding: 0.4vh 1vh;
        border-radius: 1vh;
    }

    /* Share modal */
    .gallery-share-modal {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.92);
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .gallery-share-content {
        background: linear-gradient(
                135deg,
                rgba(102, 126, 234, 0.08) 0%,
                rgba(118, 75, 162, 0.08) 100%
            ),
            rgba(26, 29, 41, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 1.5vh;
        padding: 2vh;
        min-width: 30vh;
        max-width: 40vh;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }

    .gallery-share-content h2 {
        margin: 0 0 0.8vh 0;
        font-size: 1.8vh;
        color: white;
    }

    .gallery-share-content p {
        margin: 0 0 1.2vh 0;
        font-size: 1.2vh;
        color: rgba(255, 255, 255, 0.7);
    }

    .gallery-no-players {
        color: rgba(255, 255, 255, 0.5);
        font-style: italic;
    }

    .gallery-players-list {
        max-height: 25vh;
        overflow-y: auto;
        margin-bottom: 1.2vh;
    }

    .gallery-player-item {
        padding: 1vh;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 0.8vh;
        margin-bottom: 0.5vh;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 1vh;
        transition: all 0.2s ease;
        border: 1px solid transparent;
    }

    .gallery-player-item:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .gallery-player-item.selected {
        background: rgba(102, 126, 234, 0.25);
        border-color: rgba(102, 126, 234, 0.5);
    }

    .gallery-player-item i {
        color: rgba(255, 255, 255, 0.7);
        font-size: 1.3vh;
    }

    .gallery-player-item span {
        color: white;
        font-size: 1.3vh;
    }

    .gallery-player-distance {
        margin-left: auto;
        color: rgba(255, 255, 255, 0.5) !important;
        font-size: 1.1vh !important;
    }

    .gallery-share-actions {
        display: flex;
        gap: 1vh;
        justify-content: flex-end;
    }
</style>
