<script>
    import { fade } from "svelte/transition";
    import { SendEvent } from "../../../utils/Utils";
    import TextField from "../../../components/TextField/TextField.svelte";
    import AppWrapper from "../components/AppWrapper.svelte";

    let TargetId;

    const SendAnonymousPing = () => {
        if (!TargetId || TargetId.length === 0) {
            return;
        }
        SendEvent("Pinger/SendPing", {
            IsAnon: true,
            Id: Number(TargetId),
        });
    };
</script>

<AppWrapper>
    <div class="pinger-container" in:fade={{ duration: 200 }}>
        <div class="pinger-header">
            <div class="pinger-icon-wrapper">
                <i class="fas fa-user-secret"></i>
            </div>
            <h2 class="pinger-title">Anonymous Pinger</h2>
            <p class="pinger-subtitle">Share your location anonymously</p>
        </div>

        <div class="pinger-form">
            <div class="input-card">
                <TextField
                    Icon="id-card-alt"
                    Title="Target Citizen ID"
                    Placeholder="Enter CID..."
                    bind:RealValue={TargetId}
                    Type="number"
                />
            </div>

            <div class="pinger-actions">
                <button class="ping-btn anonymous" on:click={SendAnonymousPing}>
                    <i class="fas fa-user-secret"></i>
                    <span>Send Anonymous Location</span>
                </button>
            </div>

            <div class="pinger-info">
                <i class="fas fa-shield-alt"></i>
                <span>Burner SIM Active - Your identity is protected</span>
            </div>
        </div>
    </div>
</AppWrapper>

<style>
    .pinger-container {
        padding: 4.5vh 2vh 4vh 2vh;
        height: 100%;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2vh;
        background: linear-gradient(
            180deg,
            rgba(15, 10, 25, 0.95) 0%,
            rgba(10, 5, 20, 0.98) 100%
        );
    }

    .pinger-header {
        text-align: center;
        padding: 2vh 0;
    }

    .pinger-icon-wrapper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 7vh;
        height: 7vh;
        border-radius: 50%;
        background: linear-gradient(
            145deg,
            rgba(139, 92, 246, 0.2) 0%,
            rgba(88, 28, 135, 0.3) 100%
        );
        border: 1px solid rgba(139, 92, 246, 0.4);
        box-shadow:
            0 4px 20px rgba(0, 0, 0, 0.4),
            inset 0 0 20px rgba(139, 92, 246, 0.15),
            0 0 30px rgba(139, 92, 246, 0.2);
        margin-bottom: 1.5vh;
    }

    .pinger-icon-wrapper i {
        font-size: 3vh;
        color: #a78bfa;
        filter: drop-shadow(0 0 10px rgba(139, 92, 246, 0.6));
    }

    .pinger-title {
        font-size: 2.4vh;
        font-weight: 700;
        color: #e2e8f0;
        margin: 0 0 0.5vh 0;
        text-shadow: 0 0 10px rgba(139, 92, 246, 0.3);
    }

    .pinger-subtitle {
        font-size: 1.3vh;
        color: rgba(167, 139, 250, 0.7);
        margin: 0;
    }

    .pinger-form {
        display: flex;
        flex-direction: column;
        gap: 2vh;
    }

    .input-card {
        background: linear-gradient(
            145deg,
            rgba(20, 15, 35, 0.9) 0%,
            rgba(30, 20, 50, 0.85) 100%
        );
        border: 1px solid rgba(139, 92, 246, 0.2);
        border-radius: 1.5vh;
        padding: 1.5vh;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    }

    .pinger-actions {
        display: flex;
        flex-direction: column;
        gap: 1.2vh;
    }

    .ping-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1vh;
        width: 100%;
        padding: 1.5vh;
        border-radius: 1.2vh;
        border: 1px solid;
        font-size: 1.4vh;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .ping-btn.anonymous {
        background: linear-gradient(
            145deg,
            rgba(139, 92, 246, 0.2) 0%,
            rgba(88, 28, 135, 0.15) 100%
        );
        border-color: rgba(139, 92, 246, 0.4);
        color: #a78bfa;
        box-shadow:
            0 4px 15px rgba(0, 0, 0, 0.3),
            inset 0 0 15px rgba(139, 92, 246, 0.1),
            0 0 20px rgba(139, 92, 246, 0.1);
    }

    .ping-btn.anonymous:hover {
        background: linear-gradient(
            145deg,
            rgba(139, 92, 246, 0.3) 0%,
            rgba(88, 28, 135, 0.25) 100%
        );
        box-shadow:
            0 4px 25px rgba(0, 0, 0, 0.4),
            0 0 30px rgba(139, 92, 246, 0.25);
        transform: translateY(-2px);
    }

    .pinger-info {
        display: flex;
        align-items: center;
        gap: 1vh;
        padding: 1.2vh 1.5vh;
        background: linear-gradient(
            145deg,
            rgba(20, 15, 35, 0.9) 0%,
            rgba(30, 20, 50, 0.85) 100%
        );
        border: 1px solid rgba(139, 92, 246, 0.2);
        border-radius: 1.2vh;
        color: rgba(167, 139, 250, 0.8);
        font-size: 1.2vh;
    }

    .pinger-info i {
        color: #a78bfa;
        font-size: 1.4vh;
        filter: drop-shadow(0 0 4px rgba(139, 92, 246, 0.5));
    }
</style>
