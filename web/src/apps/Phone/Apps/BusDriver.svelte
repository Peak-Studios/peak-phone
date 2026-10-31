<script>
    import { onMount } from "svelte";
    import { SendEvent } from "../../../utils/Utils";

    let Stats = { 
        Level: 1, 
        Experience: 0, 
        TotalExperience: 0,
        TotalEarnings: 0,
        DailyExperience: 0,
        SeasonExperience: 0,
        Progress: { Current: 1, Next: 2, Progress: 0 } 
    };
    let Loading = true;

    const load = () => {
        Loading = true;
        SendEvent("BusDriver/GetData", {}, (Success, Result) => {
            Loading = false;
            if (!Success || !Result?.data) return;
            Stats = Result.data;
        });
    };

    onMount(() => {
        load();
    });

    const getMedalColor = (level) => {
        if (level >= 10) return "#FFD700"; // Gold
        if (level >= 5) return "#C0C0C0";  // Silver
        if (level >= 3) return "#CD7F32";  // Bronze
        return "#666";
    };
</script>

<div class="busdriver-phone">
    {#if Loading}
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading...</p>
        </div>
    {:else}
        <div class="header">
            <div class="level-badge" style="background: {getMedalColor(Stats.Level)}">
                <p class="level-num">{Stats.Level}</p>
            </div>
            <div class="header-text">
                <p class="title">Bus Driver</p>
                <p class="subtitle">Level {Stats.Level}</p>
            </div>
        </div>

        <div class="progress-section">
            <div class="progress-header">
                <p>Progress to Level {Stats.Progress?.Next || Stats.Level + 1}</p>
                <p>{Math.round(Stats.Progress?.Progress || 0)}%</p>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style={`width: ${Stats.Progress?.Progress || 0}%`} />
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <i class="fas fa-bolt"></i>
                <div class="stat-info">
                    <p class="stat-value">{Stats.Experience || 0}</p>
                    <p class="stat-label">Current XP</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-chart-line"></i>
                <div class="stat-info">
                    <p class="stat-value">{Stats.TotalExperience || 0}</p>
                    <p class="stat-label">Total XP</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-dollar-sign"></i>
                <div class="stat-info">
                    <p class="stat-value">${Stats.TotalEarnings || 0}</p>
                    <p class="stat-label">Total Earned</p>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-calendar-day"></i>
                <div class="stat-info">
                    <p class="stat-value">{Stats.DailyExperience || 0}</p>
                    <p class="stat-label">Today's XP</p>
                </div>
            </div>
        </div>

        <div class="refresh-btn" on:click={load}>
            <i class="fas fa-sync-alt"></i>
            <p>Refresh</p>
        </div>
    {/if}
</div>

<style>
    .busdriver-phone {
        color: white;
        padding: 1.6vh;
        display: flex;
        flex-direction: column;
        gap: 1.2vh;
        height: 100%;
        background: linear-gradient(180deg, rgba(30,30,35,1) 0%, rgba(20,20,25,1) 100%);
    }

    .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 1vh;
        opacity: 0.7;
    }

    .loading i {
        font-size: 2vh;
    }

    .header {
        display: flex;
        align-items: center;
        gap: 1.2vh;
        padding: 1vh;
        background: rgba(255,255,255,0.05);
        border-radius: 1vh;
    }

    .level-badge {
        width: 4vh;
        height: 4vh;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .level-num {
        font-size: 1.8vh;
        font-weight: bold;
        color: #111;
    }

    .header-text {
        display: flex;
        flex-direction: column;
    }

    .title {
        font-size: 1.6vh;
        font-weight: 600;
    }

    .subtitle {
        font-size: 1.2vh;
        opacity: 0.7;
    }

    .progress-section {
        padding: 1vh;
        background: rgba(255,255,255,0.05);
        border-radius: 0.8vh;
    }

    .progress-header {
        display: flex;
        justify-content: space-between;
        font-size: 1.2vh;
        margin-bottom: 0.6vh;
        opacity: 0.8;
    }

    .progress-bar {
        width: 100%;
        background: rgba(255,255,255,0.1);
        height: 0.8vh;
        border-radius: 5vh;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #2ed7b6 0%, #f1528a 100%);
        border-radius: 5vh;
        transition: width 0.3s ease;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.8vh;
    }

    .stat-card {
        display: flex;
        align-items: center;
        gap: 0.8vh;
        padding: 1vh;
        background: rgba(255,255,255,0.05);
        border-radius: 0.8vh;
    }

    .stat-card i {
        font-size: 1.4vh;
        opacity: 0.7;
        width: 2vh;
        text-align: center;
    }

    .stat-info {
        display: flex;
        flex-direction: column;
    }

    .stat-value {
        font-size: 1.4vh;
        font-weight: 600;
    }

    .stat-label {
        font-size: 1vh;
        opacity: 0.6;
    }

    .refresh-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.6vh;
        padding: 1vh;
        background: rgba(46, 215, 182, 0.2);
        border-radius: 0.8vh;
        cursor: pointer;
        margin-top: auto;
        transition: background 0.2s ease;
    }

    .refresh-btn:hover {
        background: rgba(46, 215, 182, 0.3);
    }

    .refresh-btn i {
        font-size: 1.2vh;
    }

    .refresh-btn p {
        font-size: 1.2vh;
    }
</style>
