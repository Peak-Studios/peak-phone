<div class="phone-checkmark-wrapper">
    <div class="phone-checkmark-container">
        <div class="checkmark-container">
            <div style="width: 6vh; height: 6vh" class="circle" />
            <svg fill="#fff" class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" width="3vh" height="3vh">
                <path d="M 28.28125 6.28125 L 11 23.5625 L 3.71875 16.28125 L 2.28125 17.71875 L 10.28125 25.71875 L 11 26.40625 L 11.71875 25.71875 L 29.71875 7.71875 Z"/>
            </svg>
        </div>
    </div>
</div>

<style>
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes slideScale {
        from {
            opacity: 0;
            transform: translate(-50%, -48%) scale(0.9);
        }
        to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }
    }

    .phone-checkmark-wrapper {
        position: absolute;
        z-index: 999;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        animation: fadeIn 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .phone-checkmark-container {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 72%;
        height: max-content;
        padding: 5vh 0;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, 
            rgba(102, 126, 234, 0.08) 0%, 
            rgba(118, 75, 162, 0.08) 100%),
            rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: var(--radius-xl);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4),
                    0 8px 24px rgba(102, 126, 234, 0.15),
                    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: slideScale 300ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .checkmark-container {
        animation: CheckmarkScale .3s ease-in-out .9s both;
    }

    .checkmark-container .circle {
        display: block;
        width: 5.6vh;
        height: 5.6vh;
        margin: 10% auto;
        border-radius: 50%;
        box-shadow: inset 0 0 0 transparent;
        background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
        animation: CheckmarkFill .4s ease-in-out .4s forwards;
    }

    .checkmark-container .checkmark {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.0);
        animation: CheckmarkShow .3s ease-in-out .9s forwards;
        filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
    }

    @keyframes CheckmarkShow {
        from {
            transform: translate(-50%, -50%) scale(0.0);
        }
        to {
            transform: translate(-50%, -50%) scale(1.0);
        }
    }

    @keyframes CheckmarkFill {
        from {
            box-shadow: inset 0 0 0 0 rgba(74, 222, 128, 0.3);
        }
        to {
            box-shadow: inset 0 0 0 3vh rgba(74, 222, 128, 0.3),
                        0 0 20px rgba(74, 222, 128, 0.4);
        }
    }

    @keyframes CheckmarkScale {
        0%, 100% {
            transform: none;
        }
        50% {
            transform: scale(1.1);
        }
    }
</style>