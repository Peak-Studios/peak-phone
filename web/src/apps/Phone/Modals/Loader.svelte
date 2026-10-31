<div class="phone-loader-wrapper">
    <div class="phone-loader-container">
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="margin: auto; background: transparent; display: block; shape-rendering: auto;" width="13.5vh" height="13.5vh" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid">
            <g transform="rotate(0 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.9166666666666666s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(30 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.8333333333333334s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(60 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.75s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(90 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.6666666666666666s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(120 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.5833333333333334s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(150 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.5s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(180 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.4166666666666667s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(210 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.3333333333333333s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(240 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.25s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(270 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.16666666666666666s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(300 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="-0.08333333333333333s" repeatCount="indefinite"></animate>
                </rect>
            </g>
            <g transform="rotate(330 50 50)">
                <rect x="47.5" y="24" rx="1.92" ry="1.92" width="5" height="12" fill="#ffffff">
                    <animate attributeName="opacity" values="1;0" keyTimes="0;1" dur="1s" begin="0s" repeatCount="indefinite"></animate>
                </rect>
            </g>
        </svg>
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

    @keyframes pulse {
        0%, 100% {
            transform: translate(-50%, -50%) scale(1);
        }
        50% {
            transform: translate(-50%, -50%) scale(1.05);
        }
    }

    .phone-loader-wrapper {
        position: absolute;
        z-index: 999;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        animation: fadeIn 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .phone-loader-container {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 72%;
        height: max-content;
        padding: 4vh 0;
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
        animation: slideScale 300ms cubic-bezier(0.4, 0, 0.2, 1),
                   pulse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    .phone-loader-container :global(svg) {
        filter: drop-shadow(0 4px 12px rgba(102, 126, 234, 0.3));
    }
</style>