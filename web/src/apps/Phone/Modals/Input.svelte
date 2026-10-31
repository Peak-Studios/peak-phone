<script>
    import { onMount } from "svelte";
    import { fade, fly } from "svelte/transition";
    import { cubicOut } from "svelte/easing";
    import Button from "../../../components/Button/Button.svelte";
    import TextArea from "../../../components/TextArea/TextArea.svelte";
    import TextField from "../../../components/TextField/TextField.svelte";
    import Checkbox from "../../../components/Checkbox/Checkbox.svelte";
    import { InputModal } from "../phone.stores";
    import {
        FormatCurrency,
        FormatPhone,
        NormalizeImageUrl,
        SendEvent,
    } from "../../../utils/Utils";

    let InputValues = {};
    let MultiSelectValues = {};
    let GalleryPhotos = [];
    let SelectedImages = {};
    let GalleryLoading = true;

    // Check if any input needs gallery photos
    const needsGallery = () => {
        const inputs = $InputModal.Inputs || [];
        return inputs.some((input) => input.Type === "ImagePicker");
    };

    // Load gallery photos if needed
    const loadGalleryPhotos = () => {
        if (!needsGallery()) return;
        GalleryLoading = true;
        SendEvent("Gallery/GetPhotos", {}, (Success, Data) => {
            GalleryLoading = false;
            if (Success) {
                // Ensure unique images
                const uniquePhotos = [];
                const urls = new Set();
                (Data || []).forEach((p) => {
                    const normalizedPhotoUrl = NormalizeImageUrl(p.photo_url);
                    if (!urls.has(normalizedPhotoUrl)) {
                        urls.add(normalizedPhotoUrl);
                        uniquePhotos.push({
                            ...p,
                            photo_url: normalizedPhotoUrl,
                        });
                    }
                });
                GalleryPhotos = uniquePhotos;
            }
        });
    };

    // Toggle image selection for ImagePicker
    const toggleImageSelection = (inputId, photoUrl) => {
        if (SelectedImages[inputId] === photoUrl) {
            // Deselect if already selected
            SelectedImages[inputId] = null;
            InputValues[inputId] = null;
        } else {
            // Select new image
            SelectedImages[inputId] = photoUrl;
            InputValues[inputId] = photoUrl;
        }
        SelectedImages = { ...SelectedImages };
    };

    // Check if image is selected
    const isImageSelected = (inputId, photoUrl) => {
        return SelectedImages[inputId] === photoUrl;
    };

    onMount(() => {
        loadGalleryPhotos();
    });

    const Buttons = $InputModal.Buttons || [
        {
            Color: "warning",
            Text: "Cancel",
            Cb: (Result) => {
                if ($InputModal.OnCancel) $InputModal.OnCancel(Result);
            },
        },
        {
            Color: "success",
            Text: "Confirm",
            Cb: (Result) => {
                if ($InputModal.OnSubmit) $InputModal.OnSubmit(Result);
            },
        },
    ];

    const Inputs = $InputModal.Inputs || [
        {
            Type: "Text",
            Text: "No inputs defined.",
            Data: {
                style: "text-align: center; margin-bottom: 1vh; font-size: 1.5vh;",
            },
        },
    ];

    // Initialize MultiSelect & Input Values
    Inputs.forEach((input) => {
        if (input.Type === "MultiSelect") {
            MultiSelectValues[input.Id] = [];
            InputValues[input.Id] = [];
        } else if (input.Data && input.Data.Value) {
            InputValues[input.Id] = input.Data.Value;
        }
    });

    const toggleMultiSelectItem = (inputId, value, maxSelections) => {
        const currentValues = MultiSelectValues[inputId] || [];
        const index = currentValues.indexOf(value);

        if (index > -1) {
            // Remove if already selected
            currentValues.splice(index, 1);
        } else {
            // Add if not at max
            if (!maxSelections || currentValues.length < maxSelections) {
                currentValues.push(value);
            }
        }

        MultiSelectValues[inputId] = [...currentValues];
        InputValues[inputId] = [...currentValues];
    };

    const isSelected = (inputId, value) => {
        return (MultiSelectValues[inputId] || []).includes(value);
    };

    const SubmitInput = (Data) => {
        Data.Cb(InputValues);
        // Only close if it's not a specific 'action' that keeps it open (default behavior closes)
        // But the previous implementation always closed it:
        InputModal.set({ Visible: false });
    };

    const CloseModal = () => {
        InputModal.set({ Visible: false });
    };
</script>

<div
    class="input-modal-overlay"
    transition:fade={{ duration: 200 }}
    on:click|self={CloseModal}
>
    <div
        class="bottom-sheet"
        transition:fly={{ y: 500, duration: 400, opacity: 1, easing: cubicOut }}
    >
        <div class="sheet-handle-bar">
            <div class="handle"></div>
        </div>

        <div class="sheet-content">
            {#each Inputs as Data, Id}
                <div class="input-item-container">
                    {#if Data.Type == "Text"}
                        <p class="input-display-text" {...Data.Data}>
                            {Data.Text}
                        </p>
                    {:else if Data.Type == "TextField"}
                        <div class="field-label-wrapper">
                            {#if Data.Data.Title}
                                <label class="field-label"
                                    >{Data.Data.Title}</label
                                >
                            {/if}
                            <div class="modern-input-box">
                                {#if Data.Data.Icon}
                                    <i
                                        class="fas fa-{Data.Data
                                            .Icon} field-icon"
                                    ></i>
                                {/if}
                                <TextField
                                    {...Data.Data}
                                    bind:Value={InputValues[Data.Id]}
                                    class="sheet-input-field"
                                    Placeholder={Data.Data.Placeholder || ""}
                                    SubSet={(Val) => {
                                        if (Data.IsPhone) {
                                            if (Val.length == 0) return " ";
                                            return FormatPhone(Val);
                                        }

                                        if (Data.IsCurrency) {
                                            if (Val.length == 0)
                                                return "€ 0,00";
                                            return FormatCurrency.format(Val);
                                        }

                                        const SubSetValue = Data.Data.SubSet
                                            ? Data.Data.SubSet(Val)
                                            : "";

                                        // Trigger updates for dependent fields if any
                                        // (Primitive reactivity)
                                        return SubSetValue;
                                    }}
                                />
                            </div>
                        </div>
                    {:else if Data.Type == "TextArea"}
                        <div class="field-label-wrapper">
                            {#if Data.Data.Title}
                                <label class="field-label"
                                    >{Data.Data.Title}</label
                                >
                            {/if}
                            <div class="modern-input-box textarea-box">
                                <TextArea
                                    {...Data.Data}
                                    bind:Value={InputValues[Data.Id]}
                                    class="sheet-textarea-field"
                                    Placeholder={Data.Data.Placeholder || ""}
                                />
                            </div>
                        </div>
                    {:else if Data.Type == "Checkbox"}
                        <div class="modern-checkbox-row">
                            <Checkbox
                                {...Data.Data}
                                bind:Checked={InputValues[Data.Id]}
                            />
                            <span class="checkbox-label-text"
                                >{Data.Data.Title}</span
                            >
                        </div>
                    {:else if Data.Type == "MultiSelect"}
                        <div class="sheet-section">
                            <div class="section-header">
                                <div class="title-row">
                                    <i
                                        class="fas fa-{Data.Data.Icon ||
                                            'list'}"
                                    />
                                    <span
                                        >{Data.Data.Title ||
                                            "Select Options"}</span
                                    >
                                </div>
                                <span class="selection-count">
                                    {(MultiSelectValues[Data.Id] || []).length}
                                    {Data.Data.MaxSelections
                                        ? ` / ${Data.Data.MaxSelections}`
                                        : ""}
                                </span>
                            </div>
                            <div class="options-scroller">
                                {#each Data.Data.Options || [] as option}
                                    <button
                                        class="option-chip"
                                        class:active={isSelected(
                                            Data.Id,
                                            option.Value,
                                        )}
                                        on:click={() =>
                                            toggleMultiSelectItem(
                                                Data.Id,
                                                option.Value,
                                                Data.Data.MaxSelections,
                                            )}
                                    >
                                        {#if isSelected(Data.Id, option.Value)}
                                            <i class="fas fa-check"></i>
                                        {/if}
                                        <span>{option.Text}</span>
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {:else if Data.Type == "ImagePicker"}
                        <div class="sheet-section">
                            <div class="section-header">
                                <div class="title-row">
                                    <i
                                        class="fas fa-{Data.Data.Icon ||
                                            'image'}"
                                    />
                                    <span
                                        >{Data.Data.Title ||
                                            "Select Photo"}</span
                                    >
                                </div>
                            </div>

                            <div class="gallery-scroll-container">
                                {#if GalleryLoading}
                                    <div class="gallery-placeholder">
                                        <i class="fas fa-spinner fa-spin"></i>
                                    </div>
                                {:else if GalleryPhotos.length === 0}
                                    <div class="gallery-placeholder">
                                        <i class="fas fa-images"></i>
                                        <span>No photos</span>
                                    </div>
                                {:else}
                                    <div class="gallery-track">
                                        {#each GalleryPhotos as photo}
                                            <button
                                                class="gallery-thumb"
                                                class:selected={isImageSelected(
                                                    Data.Id,
                                                    photo.photo_url,
                                                )}
                                                on:click={() =>
                                                    toggleImageSelection(
                                                        Data.Id,
                                                        photo.photo_url,
                                                    )}
                                                style="background-image: url({photo.photo_url});"
                                            >
                                                {#if isImageSelected(Data.Id, photo.photo_url)}
                                                    <div class="thumb-overlay">
                                                        <i
                                                            class="fas fa-check-circle"
                                                        ></i>
                                                    </div>
                                                {/if}
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>

        <div class="sheet-actions">
            <!-- Render Cancel button distinctively -->
            {#each Buttons as Data}
                <button
                    class="sheet-btn {Data.Color == 'warning' ||
                    Data.Color == 'error'
                        ? 'ghost'
                        : 'primary'}"
                    on:click={() => SubmitInput(Data)}
                >
                    {Data.Text}
                </button>
            {/each}
        </div>

        <!-- Safe area spacer for home bar -->
        <div class="safe-area-spacer"></div>
    </div>
</div>

<style>
    .input-modal-overlay {
        position: absolute;
        inset: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        align-items: center;
    }

    .bottom-sheet {
        width: 100%;
        max-height: 90%;
        background: rgba(22, 22, 24, 0.98); /* Very dark drawer */
        border-top-left-radius: 20px;
        border-top-right-radius: 20px;
        box-shadow:
            0 -10px 40px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.08) inset;
        display: flex;
        flex-direction: column;
        padding-bottom: 0;
        overflow: hidden;
    }

    .sheet-handle-bar {
        width: 100%;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .handle {
        width: 40px;
        height: 4px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
    }

    .sheet-content {
        flex: 1;
        overflow-y: auto;
        padding: 8px 24px 24px 24px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    /* Scrollbar Styling */
    .sheet-content::-webkit-scrollbar {
        width: 4px;
    }
    .sheet-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
    }

    .input-item-container {
        display: flex;
        flex-direction: column;
    }

    .input-display-text {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
        text-align: center;
        margin: 0;
        line-height: 1.5;
    }

    .field-label-wrapper {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .field-label {
        font-size: 13px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        margin-left: 4px;
    }

    .modern-input-box {
        background: rgba(
            255,
            255,
            255,
            0.08
        ); /* Lighter background for inputs */
        border-radius: 12px;
        display: flex;
        align-items: center;
        padding: 0 12px;
        transition: all 0.2s;
        border: 1px solid transparent;
    }

    .modern-input-box:focus-within {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
    }

    .textarea-box {
        padding: 12px;
        align-items: flex-start;
    }

    .field-icon {
        color: rgba(255, 255, 255, 0.5);
        font-size: 14px;
        margin-right: 10px;
    }

    /* Global styles for passed components to make them fit */
    :global(.sheet-input-field),
    :global(.sheet-textarea-field) {
        background: transparent !important;
        border: none !important;
        color: white !important;
        width: 100%;
        font-family: inherit;
        font-size: 15px;
        padding: 12px 0 !important;
        outline: none !important;
    }
    :global(.sheet-textarea-field) {
        min-height: 80px;
        resize: none;
        padding: 0 !important;
    }

    /* Checkbox Row */
    .modern-checkbox-row {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .checkbox-label-text {
        font-size: 15px;
        color: white;
    }

    /* Sections (MultiSelect / ImagePicker) */
    .sheet-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 4px;
    }

    .title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        font-weight: 600;
    }

    .selection-count {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
    }

    /* Options Chips */
    .options-scroller {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .option-chip {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid transparent;
        border-radius: 20px;
        padding: 8px 16px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .option-chip:active {
        transform: scale(0.95);
    }

    .option-chip.active {
        background: #1d9bf0;
        color: white;
        border-color: #1d9bf0;
    }

    /* Gallery Horizontal Scroll */
    .gallery-scroll-container {
        width: 100%;
        overflow-x: auto;
        padding-bottom: 8px; /* Room for scrollbar */
    }

    .gallery-scroll-container::-webkit-scrollbar {
        height: 4px;
    }
    .gallery-scroll-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
    }

    .gallery-track {
        display: inline-flex;
        gap: 10px;
    }

    .gallery-thumb {
        width: 100px;
        height: 100px;
        border-radius: 12px;
        background-size: cover;
        background-position: center;
        background-color: #333;
        flex-shrink: 0;
        position: relative;
        border: 2px solid transparent;
        cursor: pointer;
        transition: transform 0.2s;
    }

    .gallery-thumb:active {
        transform: scale(0.95);
    }

    .gallery-thumb.selected {
        border-color: #1d9bf0;
    }

    .thumb-overlay {
        position: absolute;
        inset: 0;
        background: rgba(29, 155, 240, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 24px;
    }

    .gallery-placeholder {
        width: 100%;
        height: 100px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.4);
        font-size: 13px;
    }

    /* Actions Footer */
    .sheet-actions {
        padding: 16px 24px 0 24px;
        display: flex;
        gap: 12px;
        background: rgba(
            22,
            22,
            24,
            0.95
        ); /* Cover content when scrolling behind */
        border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .sheet-btn {
        flex: 1;
        padding: 14px;
        border-radius: 14px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: transform 0.1s;
    }

    .sheet-btn:active {
        transform: scale(0.97);
    }

    .sheet-btn.primary {
        background: white;
        color: black;
    }

    .sheet-btn.ghost {
        background: rgba(255, 255, 255, 0.1);
        color: white;
    }

    .safe-area-spacer {
        height: 34px; /* Approximate iOS home indicator area */
        flex-shrink: 0;
    }
</style>
