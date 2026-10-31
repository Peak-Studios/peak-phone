<script>
    import "../components/Misc.css";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { SendEvent, FormatPhone } from "../../../utils/Utils";
    import AppWrapper from "../components/AppWrapper.svelte";

    let activeTab = "emergency";
    let EmergencyWorkers = [];
    let TowWorkers = [];
    let IsLoading = true;

    const LoadWorkers = () => {
        IsLoading = true;

        SendEvent("Services/GetEmergencyWorkers", {}, (Success, Data) => {
            if (Success && Data) {
                EmergencyWorkers = Data;
            }
        });

        SendEvent("Services/GetTowWorkers", {}, (Success, Data) => {
            if (Success && Data) {
                TowWorkers = Data;
            }
            IsLoading = false;
        });
    };

    onMount(() => {
        LoadWorkers();
    });

    const CallWorker = (worker) => {
        if (!worker?.Phone) return;

        SendEvent("Contacts/Call", {
            Phone: worker.Phone,
            DisplayPhone: worker.DisplayPhone,
        });
    };

    const GetJobLabel = (job) => {
        const labels = {
            police: "Police Officer",
            ambulance: "Paramedic",
            bcso: "Deputy Sheriff",
            sasp: "State Trooper",
            ranger: "Park Ranger",
            fire: "Firefighter",
            impound: "Tow Operator",
        };
        return labels[job] || job;
    };

    const GetJobIcon = (job) => {
        const icons = {
            police: "fa-shield-alt",
            ambulance: "fa-ambulance",
            bcso: "fa-star",
            sasp: "fa-badge",
            ranger: "fa-tree",
            fire: "fa-fire-extinguisher",
            impound: "fa-truck-pickup",
        };
        return icons[job] || "fa-user";
    };

    const GetJobColor = (job) => {
        const colors = {
            police: "#3b82f6",
            ambulance: "#ef4444",
            bcso: "#a855f7",
            sasp: "#6366f1",
            ranger: "#22c55e",
            fire: "#f97316",
            impound: "#eab308",
        };
        return colors[job] || "#6b7280";
    };

    $: CurrentWorkers =
        activeTab === "emergency" ? EmergencyWorkers : TowWorkers;
</script>

<AppWrapper>
    <div class="services-container">
        <!-- BACKGROUND -->
        <div class="services-bg"></div>

        <!-- HEADER -->
        <div class="services-header">
            <div class="sh-title">Services</div>
            <div class="sh-refresh" on:click={LoadWorkers}>
                <i class="fas fa-sync-alt" class:spinning={IsLoading}></i>
            </div>
        </div>

        <div class="services-content">
            <!-- TABS -->
            <div class="services-tabs">
                <div
                    class="tab-btn"
                    class:active={activeTab === "emergency"}
                    on:click={() => (activeTab = "emergency")}
                >
                    <i class="fas fa-phone-alt"></i>
                    <span>Emergency</span>
                    {#if EmergencyWorkers.length > 0}
                        <div class="tab-badge">{EmergencyWorkers.length}</div>
                    {/if}
                </div>
                <div
                    class="tab-btn"
                    class:active={activeTab === "tow"}
                    on:click={() => (activeTab = "tow")}
                >
                    <i class="fas fa-truck-pickup"></i>
                    <span>Tow Truck</span>
                    {#if TowWorkers.length > 0}
                        <div class="tab-badge">{TowWorkers.length}</div>
                    {/if}
                </div>
            </div>

            <!-- CONTENT -->
            <div class="tab-content" in:fade={{ duration: 200 }}>
                {#if IsLoading}
                    <div class="services-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>Loading available workers...</span>
                    </div>
                {:else if CurrentWorkers.length === 0}
                    <div class="services-empty">
                        <i
                            class="fas {activeTab === 'emergency'
                                ? 'fa-phone-slash'
                                : 'fa-truck-pickup'}"
                        ></i>
                        <span
                            >No {activeTab === "emergency"
                                ? "emergency workers"
                                : "tow operators"} available</span
                        >
                        <span class="sub"
                            >Check back later or try refreshing</span
                        >
                    </div>
                {:else}
                    <div class="workers-list">
                        {#each CurrentWorkers as worker}
                            <div
                                class="worker-card"
                                in:fade={{ duration: 150 }}
                            >
                                <div class="worker-left">
                                    <div
                                        class="worker-avatar"
                                        style="background-color: {GetJobColor(
                                            worker.Job,
                                        )}20; border-color: {GetJobColor(
                                            worker.Job,
                                        )}40"
                                    >
                                        {#if worker.Avatar}
                                            <img src={worker.Avatar} alt="" />
                                        {:else}
                                            <i
                                                class="fas {GetJobIcon(
                                                    worker.Job,
                                                )}"
                                                style="color: {GetJobColor(
                                                    worker.Job,
                                                )}"
                                            ></i>
                                        {/if}
                                    </div>
                                    <div class="worker-status"></div>
                                </div>

                                <div class="worker-info">
                                    <div class="worker-name">
                                        {worker.Name || "Anonymous"}
                                    </div>
                                    <div
                                        class="worker-job"
                                        style="color: {GetJobColor(worker.Job)}"
                                    >
                                        {GetJobLabel(worker.Job)}
                                    </div>
                                </div>

                                <div class="worker-actions">
                                    <div
                                        class="call-btn"
                                        style="background: {GetJobColor(
                                            worker.Job,
                                        )}"
                                        on:click={() => CallWorker(worker)}
                                    >
                                        <i class="fas fa-phone-alt"></i>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- INFO FOOTER -->
            <div class="services-footer">
                <i class="fas fa-info-circle"></i>
                <span>Only workers currently on duty are shown</span>
            </div>
        </div>
    </div>
</AppWrapper>

<style>
    .services-container {
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

    .services-bg {
        position: absolute;
        width: 100%;
        height: 100%;
        background: radial-gradient(
            circle at 50% 0%,
            #1a2942 0%,
            #0d0d10 60%,
            #000 100%
        );
        z-index: 0;
    }

    .services-header {
        position: relative;
        z-index: 2;
        padding: 5vh 2.5vh 1.5vh 2.5vh;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .sh-title {
        font-size: 3.2vh;
        font-weight: 300;
        letter-spacing: -0.5px;
        opacity: 0.9;
    }

    .sh-refresh {
        width: 4vh;
        height: 4vh;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        cursor: pointer;
        font-size: 1.4vh;
        transition: all 0.2s;
    }

    .sh-refresh:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .spinning {
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

    .services-content {
        position: relative;
        z-index: 1;
        height: calc(100% - 10vh);
        display: flex;
        flex-direction: column;
        padding: 0 2vh;
    }

    /* TABS */
    .services-tabs {
        display: flex;
        gap: 1vh;
        margin-bottom: 2vh;
        flex-shrink: 0;
    }

    .tab-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.8vh;
        padding: 1.2vh 1vh;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1.2vh;
        font-size: 1.3vh;
        cursor: pointer;
        opacity: 0.6;
        transition: all 0.2s;
        position: relative;
    }

    .tab-btn i {
        font-size: 1.4vh;
    }

    .tab-btn.active {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.1);
        opacity: 1;
    }

    .tab-badge {
        position: absolute;
        top: -0.5vh;
        right: -0.5vh;
        min-width: 2vh;
        height: 2vh;
        padding: 0 0.5vh;
        background: #3b82f6;
        border-radius: 1vh;
        font-size: 1vh;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .tab-content {
        flex: 1;
        overflow: hidden;
        position: relative;
    }

    /* WORKERS LIST */
    .workers-list {
        height: 100%;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1vh;
        padding-bottom: 8vh;
    }

    .workers-list::-webkit-scrollbar {
        display: none;
    }

    .worker-card {
        display: flex;
        align-items: center;
        gap: 1.5vh;
        padding: 1.5vh;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1.5vh;
        transition: all 0.2s;
    }

    .worker-card:hover {
        background: rgba(255, 255, 255, 0.06);
    }

    .worker-left {
        position: relative;
    }

    .worker-avatar {
        width: 5vh;
        height: 5vh;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid;
        overflow: hidden;
    }

    .worker-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .worker-avatar i {
        font-size: 2vh;
    }

    .worker-status {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 1.4vh;
        height: 1.4vh;
        background: #22c55e;
        border: 2px solid #0d0d10;
        border-radius: 50%;
    }

    .worker-info {
        flex: 1;
        overflow: hidden;
    }

    .worker-name {
        font-size: 1.5vh;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 0.3vh;
    }

    .worker-job {
        font-size: 1.2vh;
        font-weight: 500;
        opacity: 0.9;
    }

    .worker-actions {
        display: flex;
        gap: 0.8vh;
    }

    .call-btn {
        width: 4.5vh;
        height: 4.5vh;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5vh;
        color: #fff;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    .call-btn:hover {
        transform: scale(1.05);
    }

    .call-btn:active {
        transform: scale(0.95);
    }

    /* EMPTY & LOADING STATES */
    .services-empty,
    .services-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 1.5vh;
        text-align: center;
        opacity: 0.5;
        padding-bottom: 10vh;
    }

    .services-empty i,
    .services-loading i {
        font-size: 5vh;
        margin-bottom: 1vh;
    }

    .services-empty span,
    .services-loading span {
        font-size: 1.5vh;
    }

    .services-empty .sub {
        font-size: 1.2vh;
        opacity: 0.6;
    }

    /* FOOTER */
    .services-footer {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 1.5vh 2vh;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.8vh;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
        font-size: 1.1vh;
        opacity: 0.5;
        pointer-events: none;
    }
</style>
