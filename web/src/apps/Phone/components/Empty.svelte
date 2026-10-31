<script>
    export let Icon = "frown";
    export let Text = "Nothing to see here!";
</script>

<div class="phone-misc-empty">
    <div class="empty-icon-wrapper">
        <i class="fas fa-{Icon}" />
    </div>
    <p>{Text}</p>
</div>

<style>
    .phone-misc-empty {
        position: relative;
        left: 0;
        right: 0;
        text-align: center;
        width: max-content;
        margin: 0 auto;
        margin-top: 8vh;
        animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(1vh);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .empty-icon-wrapper {
        width: 6vh;
        height: 6vh;
        margin: 0 auto 2vh;
        border-radius: 50%;
        background: linear-gradient(135deg, 
            rgba(102, 126, 234, 0.15) 0%, 
            rgba(118, 75, 162, 0.15) 100%);
        border: 1px solid rgba(102, 126, 234, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .phone-misc-empty > .empty-icon-wrapper > i {
        font-size: 2.5vh;
        color: rgba(102, 126, 234, 0.7);
    }

    .phone-misc-empty > p {
        margin: 0;
        font-size: 1.4vh;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.6);
    }
</style>