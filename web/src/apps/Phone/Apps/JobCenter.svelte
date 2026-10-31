<script>
    import * as JOB from "./_jobcenter";
    import { onDestroy, onMount } from "svelte";
    import { OnEvent, SendEvent, AddNotification } from "../../../utils/Utils";
    import {
        HasVpn,
        JobManager,
        PlayerData,
        InputModal,
    } from "../phone.stores";
    import { fade, fly, slide } from "svelte/transition";
    import { quintOut } from "svelte/easing";
    import AppWrapper from "../components/AppWrapper.svelte";

    // --- State ---
    let Jobs = [];
    let FilteredJobs = [];
    let SearchQuery = "";

    // Timer State
    let TimerInterval;
    let Timer = 0;
    let TimerString = "00:00:00";

    // Group State
    let Groups = [];
    let IdleGroups = [];
    let BusyGroups = [];

    // --- Helpers ---
    const Notify = (Text, Type = "success") => {
        AddNotification({
            Id: Math.random().toString(36).substr(2, 9),
            Title: "Job Center",
            Text: Text,
            Icon: "briefcase",
            IconColor: Type === "success" ? "#10b981" : "#ef4444",
            BgColor: "#ffffff",
            ShowTimer: false,
        });
    };

    const ConvertMsToHMS = () => {
        const Seconds = Math.floor((Timer / 1000) % 60);
        const Minutes = Math.floor((Timer / (1000 * 60)) % 60);
        const Hours = Math.floor((Timer / (1000 * 60 * 60)) % 24);
        TimerString = `${Hours < 10 ? "0" : ""}${Hours}:${Minutes < 10 ? "0" : ""}${Minutes}:${Seconds < 10 ? "0" : ""}${Seconds}`;
    };

    const HandleSearch = () => {
        const Query = SearchQuery.toLowerCase();
        FilteredJobs = Jobs.filter((Val) =>
            Val.JobName.toLowerCase().includes(Query),
        );
    };

    // --- Event Listeners ---
    OnEvent("SetJobCenterGroups", (Data) => {
        Groups = Data.Groups || [];
        IdleGroups = Groups.filter((Val) => Val && Val.State == "Idle");
        BusyGroups = Groups.filter((Val) => Val && Val.State != "Idle");
    });

    // --- Lifecycle ---
    onMount(() => {
        SendEvent("JobCenter/GetJobs", {}, (Success, Result) => {
            if (!Success) return;
            const _Jobs = Result.map(
                ({
                    EmployeeCount,
                    GroupCount,
                    Icon,
                    JobId,
                    JobName,
                    VPNRequired,
                    SalaryRate,
                }) => ({
                    EmployeeCount,
                    GroupCount,
                    Icon,
                    JobId,
                    JobName,
                    VPNRequired,
                    SalaryRate,
                }),
            );
            Jobs = _Jobs;
            FilteredJobs = _Jobs;
        });

        if ($JobManager.CurrentJob) {
            SendEvent("JobCenter/GetJobGroups", {}, (Success, Result) => {
                if (!Success) return;
                Groups = Result || [];
                IdleGroups = Groups.filter((Val) => Val.State == "Idle");
                BusyGroups = Groups.filter((Val) => Val.State != "Idle");
            });

            if (
                $JobManager.CurrentGroup &&
                $JobManager.CurrentGroup.Tasks.length > 0
            ) {
                SendEvent("JobCenter/GetTaskActivity", {}, (Success, Data) => {
                    if (!Success) return;
                    Timer = Data;
                    ConvertMsToHMS();
                });

                TimerInterval = setInterval(() => {
                    Timer = Timer - 1000;
                    ConvertMsToHMS();
                }, 1000);
            }
        }
    });

    onDestroy(() => {
        clearInterval(TimerInterval);
    });

    // --- Reactive Logic ---
    // Watch for job changes to clear timer if needed
    $: if (
        !$JobManager.CurrentJob ||
        !$JobManager.CurrentGroup ||
        $JobManager.CurrentGroup.Tasks.length === 0
    ) {
        clearInterval(TimerInterval);
    }

    // Safe mission title: Activity.Title or job name from Jobs list, never undefined
    $: MissionTitle =
        $JobManager.CurrentGroup &&
        $JobManager.CurrentGroup.Activity &&
        $JobManager.CurrentGroup.Activity.Title
            ? $JobManager.CurrentGroup.Activity.Title
            : (() => {
                  const jobId =
                      ($JobManager.CurrentGroup &&
                          $JobManager.CurrentGroup.JobId) ||
                      $JobManager.CurrentJob;
                  const job = Jobs.find((j) => j && j.JobId === jobId);
                  return (job && job.JobName) || "Active Mission";
              })();
</script>

<AppWrapper>
    <div class="glass-container">
        <!-- BACKGROUND DEEP BLUR -->
        <div class="glass-bg"></div>

        <!-- HEADER -->
        <div class="glass-header">
            {#if !$JobManager.CurrentJob && !$JobManager.CurrentGroup}
                <div class="gh-title">Job Center</div>
            {:else if $JobManager.CurrentJob && (!$JobManager.CurrentGroup || $JobManager.CurrentGroup.Tasks.length == 0)}
                <div class="gh-back-btn" on:click={JOB.AbandonJob}>
                    <i class="fas fa-chevron-left"></i>
                </div>
                <div class="gh-title" style="margin-left: 1vh;">
                    {$JobManager.CurrentGroup ? "My Team" : "Lobby"}
                </div>
            {:else}
                <div class="gh-title">Active Mission</div>
            {/if}

            <div class="gh-actions">
                <!-- Optional header actions could go here -->
            </div>
        </div>

        <!-- SCROLL AREA -->
        <div class="glass-scroll">
            <!-- VIEW 1: JOB LIST -->
            {#if !$JobManager.CurrentJob && !$JobManager.CurrentGroup}
                <!-- SEARCH -->
                <div class="search-wrap">
                    <div class="glass-search">
                        <i class="fas fa-search"></i>
                        <input
                            type="text"
                            placeholder="Find a job..."
                            bind:value={SearchQuery}
                            on:input={HandleSearch}
                        />
                    </div>
                </div>

                <div class="contact-list-body">
                    {#each FilteredJobs as job, i (job.JobId)}
                        {#if !job.VPNRequired || $HasVpn}
                            <div
                                class="glass-row {job.VPNRequired
                                    ? 'illegal'
                                    : ''}"
                                on:click={() => JOB.SetWaypoint(i + 1)}
                            >
                                <div class="gr-avatar icon-avatar">
                                    <i class={job.Icon}></i>
                                </div>
                                <div class="gr-info">
                                    <div class="gr-name">
                                        {job.JobName}
                                        {#if job.VPNRequired}
                                            <i
                                                class="fas fa-user-secret"
                                                style="color: #ff6b6b; font-size: 1.2vh; margin-left: 0.5vh;"
                                            ></i>
                                        {/if}
                                    </div>
                                    <div class="gr-sub">
                                        <i
                                            class="fas fa-users"
                                            style="font-size: 1vh; margin-right: 0.3vh;"
                                        ></i>
                                        {job.GroupCount} Groups
                                        <span
                                            style="margin: 0 0.5vh; opacity: 0.3;"
                                            >|</span
                                        >
                                        Pay: {job.SalaryRate}/5
                                    </div>
                                </div>
                                <div class="gr-action">
                                    <i class="fas fa-location-arrow"></i>
                                </div>
                            </div>
                        {/if}
                    {/each}
                </div>

                <!-- VIEW 2: LOBBY / GROUP MANAGMENT -->
            {:else if $JobManager.CurrentJob && (!$JobManager.CurrentGroup || $JobManager.CurrentGroup.Tasks.length == 0)}
                {#if !$JobManager.CurrentGroup}
                    <!-- CREATE / CLOCK OUT BUTTONS -->
                    <div class="actions-grid">
                        <div class="glass-btn-large" on:click={JOB.CreateGroup}>
                            <div
                                class="gbl-icon"
                                style="background: rgba(74, 222, 128, 0.2); color: #4ade80;"
                            >
                                <i class="fas fa-plus"></i>
                            </div>
                            <div class="gbl-text">Create Group</div>
                        </div>
                        <div class="glass-btn-large" on:click={JOB.Signout}>
                            <div
                                class="gbl-icon"
                                style="background: rgba(248, 113, 113, 0.2); color: #f87171;"
                            >
                                <i class="fas fa-sign-out-alt"></i>
                            </div>
                            <div class="gbl-text">Clock Out</div>
                        </div>
                    </div>

                    <div class="sub-label">Available Groups</div>

                    {#if IdleGroups.length === 0 && BusyGroups.length === 0}
                        <div class="glass-empty">
                            <i class="fas fa-users-slash"></i>
                            <span>No active groups found</span>
                        </div>
                    {/if}

                    <div class="contact-list-body">
                        {#each IdleGroups as group (group.Id)}
                            <div class="glass-row">
                                <div
                                    class="gr-avatar"
                                    style="background: rgba(255,255,255,0.1); font-size: 1.2vh;"
                                >
                                    {group.Members.length}/{group.MaxSize}
                                </div>
                                <div class="gr-info">
                                    <div class="gr-name">
                                        {group.Members[0].Name}'s Team
                                    </div>
                                    <div class="gr-sub" style="color: #4ade80;">
                                        Recruiting
                                    </div>
                                </div>
                                <div
                                    class="glass-btn-small"
                                    on:click={() => JOB.RequestToJoin(group.Id)}
                                >
                                    Join
                                </div>
                            </div>
                        {/each}

                        {#each BusyGroups as group (group.Id)}
                            <div class="glass-row disabled">
                                <div class="gr-avatar busy">
                                    <i class="fas fa-briefcase"></i>
                                </div>
                                <div class="gr-info">
                                    <div class="gr-name">
                                        {group.Members[0].Name}'s Team
                                    </div>
                                    <div class="gr-sub" style="color: #fbbf24;">
                                        Working
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <!-- CURRENT GROUP -->
                    <div
                        class="my-card-glass status-card {$JobManager
                            .CurrentGroup.State === 'Busy'
                            ? 'waiting'
                            : 'assembling'}"
                    >
                        <div class="mcg-content">
                            <div class="mcg-avatar status-icon">
                                <i
                                    class="fas {$JobManager.CurrentGroup
                                        .State === 'Busy'
                                        ? 'fa-clock'
                                        : 'fa-clipboard-check'}"
                                ></i>
                            </div>
                            <div class="mcg-info">
                                <div class="mcg-name">
                                    {$JobManager.CurrentGroup.State === "Busy"
                                        ? "Waiting for Assignment"
                                        : "Team Assembling"}
                                </div>
                                <div class="mcg-sub">
                                    {$JobManager.CurrentGroup.State === "Busy"
                                        ? "Please standby..."
                                        : "Waiting for leader..."}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="sub-label">Members</div>
                    <div class="contact-list-body">
                        {#each $JobManager.CurrentGroup.Members as member, i}
                            <div class="glass-row">
                                <div class="gr-avatar">
                                    <i class="fas fa-user-astronaut"></i>
                                </div>
                                <div class="gr-info">
                                    <div class="gr-name">
                                        {member.Name}
                                        {#if i === 0}<i
                                                class="fas fa-crown"
                                                style="color: #fbbf24; margin-left: 0.5vh; font-size: 1.2vh;"
                                            ></i>{/if}
                                    </div>
                                    <div class="gr-sub">
                                        {i === 0 ? "Team Leader" : "Member"}
                                    </div>
                                </div>

                                {#if $JobManager.CurrentGroup.Members[0].Cid == $PlayerData.Cid && i !== 0}
                                    <div class="row-actions">
                                        <div
                                            class="action-icon promote"
                                            on:click={() =>
                                                JOB.PromoteToLeader(i + 1)}
                                        >
                                            <i class="fas fa-crown"></i>
                                        </div>
                                        <div
                                            class="action-icon kick"
                                            on:click={() =>
                                                JOB.KickFromGroup(i + 1)}
                                        >
                                            <i class="fas fa-times"></i>
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/each}

                        {#each Array(Math.max(0, ($JobManager.CurrentGroup.MaxSize || 4) - $JobManager.CurrentGroup.Members.length)) as _}
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <div
                                class="glass-row dashed"
                                style={($JobManager.CurrentJob.JobId ===
                                    "lamar_mission_2" ||
                                    $JobManager.CurrentJob ===
                                        "lamar_mission_2") &&
                                $JobManager.CurrentGroup.Members[0].Cid ==
                                    $PlayerData.Cid
                                    ? "cursor: pointer; opacity: 0.8;"
                                    : ""}
                                on:click={() => {
                                    if (
                                        ($JobManager.CurrentJob.JobId ===
                                            "lamar_mission_2" ||
                                            $JobManager.CurrentJob ===
                                                "lamar_mission_2") &&
                                        $JobManager.CurrentGroup.Members[0]
                                            .Cid == $PlayerData.Cid
                                    ) {
                                        InputModal.set({
                                            Visible: true,
                                            Inputs: [
                                                {
                                                    Id: "cid",
                                                    Type: "TextField",
                                                    Data: {
                                                        Title: "Citizen ID",
                                                        Value: "",
                                                        Placeholder:
                                                            "Enter Citizen ID",
                                                    },
                                                },
                                            ],
                                            Buttons: [
                                                {
                                                    Color: "success",
                                                    Text: "Invite",
                                                    Cb: (Inputs) => {
                                                        if (Inputs.cid) {
                                                            JOB.InviteToGroup(
                                                                Inputs.cid,
                                                                (
                                                                    Success,
                                                                    Result,
                                                                ) => {
                                                                    if (
                                                                        Success &&
                                                                        Result.Success
                                                                    ) {
                                                                        Notify(
                                                                            "Invite sent successfully",
                                                                            "success",
                                                                        );
                                                                    } else {
                                                                        Notify(
                                                                            Result?.Msg ||
                                                                                "Failed to send invite",
                                                                            "error",
                                                                        );
                                                                    }
                                                                },
                                                            );
                                                        }
                                                    },
                                                },
                                                {
                                                    Color: "danger",
                                                    Text: "Cancel",
                                                    Cb: () => {},
                                                },
                                            ],
                                        });
                                    }
                                }}
                            >
                                <div class="gr-avatar empty">
                                    <i class="fas fa-plus"></i>
                                </div>
                                <div class="gr-info">
                                    <div class="gr-name dimmed">
                                        {($JobManager.CurrentJob.JobId ===
                                            "lamar_mission_2" ||
                                            $JobManager.CurrentJob ===
                                                "lamar_mission_2") &&
                                        $JobManager.CurrentGroup.Members[0]
                                            .Cid == $PlayerData.Cid
                                            ? "Invite Member"
                                            : "Open Slot"}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                    <div class="safe-padding"></div>
                {/if}

                <!-- VIEW 3: ACTIVE JOB -->
            {:else}
                <div class="active-mission-container">
                    <div class="timer-glass">
                        <div class="timer-val">{TimerString}</div>
                        <div class="timer-lbl">Fullfilment Time</div>
                    </div>

                    <div class="mission-title">
                        {MissionTitle}
                    </div>

                    <div class="sub-label">Objectives</div>
                    <div class="tasks-list">
                        {#each $JobManager.CurrentGroup.Tasks as task, i}
                            <div
                                class="glass-task {task.Progress >=
                                task.RequiredProgress
                                    ? 'completed'
                                    : ''}"
                            >
                                <div class="gt-check">
                                    {#if task.Progress >= task.RequiredProgress}
                                        <i class="fas fa-check"></i>
                                    {/if}
                                </div>
                                <div class="gt-info">
                                    <div class="gt-title">{task.Title}</div>
                                    <div class="gt-bar">
                                        <div
                                            class="gt-fill"
                                            style="width: {(task.Progress /
                                                task.RequiredProgress) *
                                                100}%"
                                        ></div>
                                    </div>
                                    <div class="gt-count">
                                        {task.Progress} / {task.RequiredProgress}
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>

                    <div class="safe-padding"></div>
                </div>
            {/if}

            <div class="safe-padding"></div>
        </div>

        {#if $JobManager.CurrentJob && $JobManager.CurrentGroup}
            <div class="floating-action-bar">
                {#if $JobManager.CurrentGroup.Tasks.length === 0}
                    <!-- MY TEAM VIEW FOOTER -->
                    {#if $JobManager.CurrentGroup.Members[0].Cid == $PlayerData.Cid}
                        <div
                            class="glass-btn-wide {$JobManager.CurrentGroup
                                .State === 'Busy'
                                ? 'stop'
                                : 'start'}"
                            on:click={JOB.ToggleReady}
                        >
                            <i
                                class="fas {$JobManager.CurrentGroup.State ===
                                'Busy'
                                    ? 'fa-times'
                                    : 'fa-play'}"
                            ></i>
                            <span
                                >{$JobManager.CurrentGroup.State === 'Busy'
                                    ? "Stop Searching"
                                    : "Start Work"}</span
                            >
                        </div>
                        <div
                            class="glass-btn-square danger"
                            on:click={JOB.DeleteGroup}
                        >
                            <i class="fas fa-trash-alt"></i>
                        </div>
                    {:else}
                        <div
                            class="glass-btn-wide danger"
                            on:click={JOB.LeaveGroup}
                        >
                            <i class="fas fa-sign-out-alt"></i>
                            <span>Leave Group</span>
                        </div>
                    {/if}
                {:else}
                    <!-- ACTIVE MISSION VIEW FOOTER -->
                    <div
                        class="glass-btn-wide danger"
                        on:click={JOB.AbandonJob}
                    >
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Abort Mission</span>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</AppWrapper>

<style>
    /* ----------------------
       THEME VARIABLES - FROM CONTACTS APP
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
        justify-content: flex-start; /* Changed to start for back btn support */
        align-items: center;
    }
    .gh-title {
        font-size: 3.2vh;
        font-weight: 300;
        letter-spacing: -0.5px;
        opacity: 0.9;
        flex: 1;
    }

    .gh-back-btn {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        /* backdrop-filter: blur(10px); REMOVED PER RULES */
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.8vh;
        cursor: pointer;
        transition: background 0.2s;
        margin-right: 1vh;
    }
    .gh-back-btn:active {
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
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 1.5vh;
        height: 4.5vh;
        display: flex;
        align-items: center;
        padding: 0 1.5vh;
        gap: 1vh;
        /* backdrop-filter: blur(5px); REMOVED PER RULES */
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

    /* MY CARD STYLE (Used for Team Status) */
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
        /* backdrop-filter: blur(15px); REMOVED PER RULES */
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    }
    .my-card-glass.status-card.waiting {
        border-color: rgba(245, 158, 11, 0.3);
        background: linear-gradient(
            135deg,
            rgba(245, 158, 11, 0.1) 0%,
            rgba(245, 158, 11, 0.05) 100%
        );
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
    .status-icon {
        font-size: 2vh;
        background: rgba(255, 255, 255, 0.05);
    }

    .mcg-name {
        font-size: 1.7vh;
        font-weight: 500;
    }
    .mcg-sub {
        font-size: 1.2vh;
        opacity: 0.6;
        margin-top: 0.2vh;
    }

    /* LABELS */
    .sub-label {
        font-size: 1.2vh;
        text-transform: uppercase;
        letter-spacing: 1px;
        opacity: 0.4;
        margin-bottom: 1.5vh;
        margin-top: 2vh;
        padding-left: 0.5vh;
    }

    /* ROWS */
    .contact-list-body {
        display: flex;
        flex-direction: column;
        gap: 1vh;
    }

    .glass-row {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1.5vh;
        padding: 1.2vh;
        display: flex;
        align-items: center;
        gap: 1.5vh;
        transition: background 0.2s;
        cursor: pointer;
    }
    .glass-row:active {
        background: rgba(255, 255, 255, 0.08);
    }
    .glass-row.illegal {
        border-color: rgba(248, 113, 113, 0.2);
        background: rgba(248, 113, 113, 0.05);
    }
    .glass-row.dashed {
        border-style: dashed;
        background: transparent;
        opacity: 0.5;
        cursor: default;
    }
    .glass-row.disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .gr-avatar {
        width: 4.5vh;
        height: 4.5vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6vh;
        font-weight: 600;
        color: #fff;
    }
    .gr-avatar.icon-avatar {
        background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.1),
            rgba(255, 255, 255, 0.05)
        );
    }
    .gr-avatar.busy {
        background: rgba(245, 158, 11, 0.2);
        color: #fbbf24;
    }
    .gr-avatar.empty {
        background: transparent;
        border: 1px dashed rgba(255, 255, 255, 0.3);
    }

    .gr-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    .gr-name {
        font-size: 1.5vh;
        font-weight: 500;
        color: #fff;
        display: flex;
        align-items: center;
    }
    .gr-name.dimmed {
        opacity: 0.5;
    }
    .gr-sub {
        font-size: 1.1vh;
        opacity: 0.5;
        margin-top: 0.3vh;
        display: flex;
        align-items: center;
    }

    .gr-action {
        width: 3.5vh;
        height: 3.5vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4vh;
        opacity: 0.7;
    }

    .glass-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 5vh;
        opacity: 0.3;
        gap: 1vh;
    }
    .glass-empty i {
        font-size: 4vh;
    }

    /* Buttons */
    .actions-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5vh;
        margin-bottom: 3vh;
    }
    .glass-btn-large {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 2vh;
        padding: 2vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1vh;
        cursor: pointer;
        transition: transform 0.2s;
    }
    .glass-btn-large:active {
        transform: scale(0.98);
    }
    .gbl-icon {
        width: 5vh;
        height: 5vh;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2vh;
    }
    .gbl-text {
        font-size: 1.4vh;
        font-weight: 500;
    }

    .glass-btn-small {
        background: #3b82f6;
        padding: 0.6vh 1.5vh;
        border-radius: 1vh;
        font-size: 1.2vh;
        font-weight: 600;
    }

    .floating-action-bar {
        position: absolute;
        bottom: 2vh;
        left: 2vh;
        width: calc(100% - 4vh);
        display: flex;
        gap: 1.5vh;
        z-index: 10;
        /* backdrop-filter: blur(10px); REMOVED PER RULES */
    }

    .glass-btn-wide {
        flex: 1;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        height: 5.5vh;
        border-radius: 1.8vh;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1.2vh;
        font-weight: 600;
        font-size: 1.6vh;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        transition: all 0.2s ease;
    }
    .glass-btn-wide.stop {
        background: #ef4444;
        color: #fff;
    }
    .glass-btn-wide.start {
        background: #22c55e;
        color: #fff;
    }
    .glass-btn-wide.danger {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .glass-btn-square {
        width: 5.5vh;
        height: 5.5vh;
        border-radius: 1.8vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2vh;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.1);
    }
    .glass-btn-square.danger {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
    }

    .row-actions {
        display: flex;
        gap: 1vh;
    }
    .action-icon {
        width: 3vh;
        height: 3vh;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2vh;
        background: rgba(255, 255, 255, 0.1);
    }
    .action-icon.promote {
        background: rgba(59, 130, 246, 0.3);
        color: #60a5fa;
    }
    .action-icon.kick {
        background: rgba(239, 68, 68, 0.3);
        color: #f87171;
    }

    /* Active Mission */
    .active-mission-container {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .timer-glass {
        width: 18vh;
        height: 18vh;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.03);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        margin-bottom: 2vh;
        box-shadow: 0 0 30px rgba(0, 0, 0, 0.2);
    }
    .timer-val {
        font-size: 3.5vh;
        font-weight: 300;
        font-variant-numeric: tabular-nums;
    }
    .timer-lbl {
        font-size: 1vh;
        opacity: 0.5;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-top: 0.5vh;
    }
    .mission-title {
        font-size: 2.2vh;
        font-weight: 600;
        text-align: center;
        margin-bottom: 2vh;
        max-width: 80%;
    }

    .tasks-list {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 1.5vh;
    }
    .glass-task {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 1.5vh;
        padding: 1.5vh;
        display: flex;
        align-items: center;
        gap: 1.5vh;
        border: 1px solid transparent;
    }
    .glass-task.completed {
        border-color: rgba(74, 222, 128, 0.3);
        background: rgba(74, 222, 128, 0.05);
    }
    .gt-check {
        width: 3vh;
        height: 3vh;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2vh;
    }
    .glass-task.completed .gt-check {
        background: #22c55e;
        color: #fff;
    }
    .gt-info {
        flex: 1;
    }
    .gt-title {
        font-size: 1.4vh;
        font-weight: 500;
        margin-bottom: 0.5vh;
    }
    .gt-bar {
        height: 0.4vh;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 0.2vh;
        overflow: hidden;
    }
    .gt-fill {
        height: 100%;
        background: #3b82f6;
    }
    .glass-task.completed .gt-fill {
        background: #22c55e;
    }
    .gt-count {
        font-size: 1vh;
        opacity: 0.5;
        margin-top: 0.5vh;
        text-align: right;
    }
</style>
