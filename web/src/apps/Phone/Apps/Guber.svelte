<script>
    import { onMount, onDestroy } from "svelte";
    import { SendEvent, OnEvent } from "../../../utils/Utils";
    import { fade, fly } from "svelte/transition";

    let Mode = null; // null, 'customer', 'driver'
    let DriverStatus = {
        onDuty: false,
        activeCourse: null,
        availableCourses: [],
        rate: 5.0,
    };

    let CustomerStatus = {
        state: "idle", // idle, pending, accepted, riding, rating
        request: null,
        driver: null,
        lastRide: null,
    };

    let WaypointData = {
        hasWaypoint: false,
        coords: null,
    };

    onMount(() => {
        SendEvent("peak-guber:server:getAvailableCourses", {}, (courses) => {
            if (courses) DriverStatus.availableCourses = courses;
        });
    });

    const SetMode = (m) => {
        Mode = m;
        if (m === "customer") {
            CheckWaypoint();
        } else if (m === "driver") {
            // Sync driver status from client state
            SendEvent("peak-guber:client:getDutyStatus", {}, (result) => {
                if (result) {
                    DriverStatus.onDuty = result.onDuty || false;
                    DriverStatus.activeCourse = result.activeCourse;
                    DriverStatus.rate = result.rate || 5.0;
                }
            });
        }
    };

    const CheckWaypoint = () => {
        SendEvent("peak-guber:client:getWaypoint", {}, (result) => {
            WaypointData = result;
        });
    };

    // DRIVER ACTIONS
    const ToggleDuty = () => {
        SendEvent(
            "peak-guber:server:changeDuty",
            { driverMode: !DriverStatus.onDuty },
            (state) => {
                DriverStatus.onDuty = state;
                if (!state) {
                    DriverStatus.availableCourses = [];
                    DriverStatus.activeCourse = null;
                }
            },
        );
    };

    const AcceptCourse = (courseId) => {
        SendEvent("peak-guber:server:takecourse", courseId);
    };

    const CancelDrive = () => {
        SendEvent("peak-guber:client:cancelCourse", {}, () => {
            DriverStatus.activeCourse = null;
        });
    };

    // CUSTOMER ACTIONS
    const RequestRide = () => {
        if (!WaypointData.hasWaypoint || !WaypointData.coords) return;
        CustomerStatus.state = "pending";
        SendEvent("peak-guber:client:requestRide", {
            destination: WaypointData.coords,
        });
    };

    const CancelRide = () => {
        SendEvent("peak-guber:client:cancelRide", {}, () => {
            CustomerStatus.state = "idle";
            CustomerStatus.driver = null;
        });
    };

    // EVENTS
    OnEvent("peak-guber:client:onduty", (rate) => {
        DriverStatus.onDuty = true;
        DriverStatus.rate = rate || 5.0;
    });

    OnEvent("peak-guber:client:offduty", () => {
        DriverStatus.onDuty = false;
        DriverStatus.availableCourses = [];
        DriverStatus.activeCourse = null;
    });

    OnEvent("peak-guber:client:newcourse", (course) => {
        if (DriverStatus.onDuty) {
            DriverStatus.availableCourses = [
                ...DriverStatus.availableCourses,
                course,
            ];
        }
    });

    OnEvent("peak-guber:client:delcourse", (cid) => {
        DriverStatus.availableCourses = DriverStatus.availableCourses.filter(
            (c) => c.id !== cid,
        );
    });

    OnEvent("peak-guber:client:startcourse", (course) => {
        DriverStatus.activeCourse = course;
        // Remove from available list
        DriverStatus.availableCourses = DriverStatus.availableCourses.filter(
            (c) => c.id !== course.id,
        );
    });

    OnEvent("peak-guber:client:jobdone", (newRate) => {
        DriverStatus.activeCourse = null;
        DriverStatus.rate = newRate || 5.0;
    });

    OnEvent("peak-guber:client:jobcancelled", () => {
        DriverStatus.activeCourse = null;
    });

    OnEvent("peak-guber:client:driverassigned", (data) => {
        CustomerStatus.state = "accepted";
        CustomerStatus.driver = data;
    });

    OnEvent("peak-guber:client:driverhere", () => {
        // Driver arrived at pickup - could add visual indicator
    });

    OnEvent("peak-guber:client:driverarrived", () => {
        // Driver arrived at destination
    });

    OnEvent("peak-guber:client:clientdone", (data) => {
        CustomerStatus.state = "rating";
        CustomerStatus.lastRide = data;
    });

    OnEvent("peak-guber:client:clientcancelled", () => {
        CustomerStatus.state = "idle";
        CustomerStatus.driver = null;
    });

    OnEvent("peak-guber:client:timeout", () => {
        CustomerStatus.state = "idle";
    });

    const RateDriver = (rating) => {
        if (!CustomerStatus.lastRide) return;
        SendEvent(
            "peak-guber:server:clientRated",
            {
                driver: CustomerStatus.lastRide.driver,
                reward: CustomerStatus.lastRide.reward,
                rate: rating,
            },
            () => {
                CustomerStatus.state = "idle";
                CustomerStatus.driver = null;
                CustomerStatus.lastRide = null;
            },
        );
    };
</script>

<div class="guber-app">
    <div class="header">
        <div class="logo">Guber</div>
        {#if Mode}
            <div class="back-btn" on:click={() => (Mode = null)}>
                <i class="fas fa-arrow-left"></i>
            </div>
        {/if}
    </div>

    <div class="content">
        {#if !Mode}
            <div class="mode-select" in:fade>
                <div class="card btn" on:click={() => SetMode("customer")}>
                    <i class="fas fa-car-side"></i>
                    <span>Get a Ride</span>
                </div>
                <div class="card btn" on:click={() => SetMode("driver")}>
                    <i class="fas fa-taxi"></i>
                    <span>Be a Driver</span>
                </div>
            </div>
        {:else if Mode === "driver"}
            <div class="driver-view" in:fly={{ x: 20, duration: 300 }}>
                <div class="status-bar">
                    <div class="rating">
                        <i class="fas fa-star"></i>
                        {DriverStatus.rate.toFixed(1)}
                    </div>
                    <div
                        class="toggle-switch {DriverStatus.onDuty ? 'on' : ''}"
                        on:click={ToggleDuty}
                    >
                        {DriverStatus.onDuty ? "ON DUTY" : "OFF DUTY"}
                    </div>
                </div>

                {#if DriverStatus.onDuty}
                    {#if DriverStatus.activeCourse}
                        <div class="active-course card">
                            <h3>Current Ride</h3>
                            <div class="info-row">
                                <span>Distance</span>
                                <span
                                    >{(
                                        DriverStatus.activeCourse.distance /
                                        1000
                                    ).toFixed(2)} km</span
                                >
                            </div>
                            <div class="info-row">
                                <span>Reward</span>
                                <span class="money"
                                    >${DriverStatus.activeCourse.reward}</span
                                >
                            </div>
                            <div class="status-text">
                                Follow GPS to pickup, then destination.
                            </div>
                            <button class="cancel-btn" on:click={CancelDrive}>
                                <i class="fas fa-times"></i> Cancel Ride
                            </button>
                        </div>
                    {:else}
                        <div class="course-list">
                            {#each DriverStatus.availableCourses as course}
                                <div
                                    class="course-item card"
                                    on:click={() => AcceptCourse(course.id)}
                                >
                                    <div class="course-header">
                                        <div class="course-icon">
                                            {#if course.player}
                                                <i class="fas fa-user"></i>
                                            {:else}
                                                <i class="fas fa-robot"></i>
                                            {/if}
                                        </div>
                                        <div class="course-price">
                                            ${course.reward}
                                        </div>
                                    </div>
                                    <div class="course-details">
                                        <div>
                                            <i class="fas fa-route"></i>
                                            {(course.distance / 1000).toFixed(
                                                1,
                                            )}km
                                        </div>
                                        <div>
                                            <i class="fas fa-clock"></i>
                                            ~{Math.ceil(
                                                course.distance / 500,
                                            )}min
                                        </div>
                                    </div>
                                </div>
                            {/each}
                            {#if DriverStatus.availableCourses.length === 0}
                                <div class="empty-state">
                                    <i class="fas fa-search"></i>
                                    <p>Searching for ride requests...</p>
                                </div>
                            {/if}
                        </div>
                    {/if}
                {:else}
                    <div class="offline-msg">
                        <i class="fas fa-power-off"></i>
                        <p>Go On Duty to receive requests</p>
                    </div>
                {/if}
            </div>
        {:else if Mode === "customer"}
            <div class="customer-view" in:fly={{ x: 20, duration: 300 }}>
                {#if CustomerStatus.state === "idle"}
                    <div class="location-select">
                        <h3>Where to?</h3>

                        {#if WaypointData.hasWaypoint}
                            <div class="waypoint-info card">
                                <div class="waypoint-icon">
                                    <i class="fas fa-map-pin"></i>
                                </div>
                                <div class="waypoint-text">
                                    <span class="label">Your Waypoint</span>
                                    <span class="coords">GPS Location Set</span>
                                </div>
                            </div>
                            <button class="request-btn" on:click={RequestRide}>
                                Request Guber
                            </button>
                        {:else}
                            <div class="no-waypoint">
                                <div class="no-waypoint-icon">
                                    <i class="fas fa-map-marked-alt"></i>
                                </div>
                                <p>Set a waypoint on your map first</p>
                                <span class="hint"
                                    >Close the phone, open the map, and mark
                                    your destination</span
                                >
                                <button
                                    class="refresh-btn"
                                    on:click={CheckWaypoint}
                                >
                                    <i class="fas fa-sync-alt"></i> Check Again
                                </button>
                            </div>
                        {/if}
                    </div>
                {:else if CustomerStatus.state === "pending"}
                    <div class="pending-screen">
                        <div class="pulse-loader">
                            <i class="fas fa-search"></i>
                        </div>
                        <p>Looking for a nearby driver...</p>
                        <button class="cancel-btn" on:click={CancelRide}>
                            Cancel Request
                        </button>
                    </div>
                {:else if CustomerStatus.state === "accepted"}
                    <div class="accepted-screen">
                        <div class="driver-info card">
                            <div class="driver-avatar">
                                <i class="fas fa-user-circle"></i>
                            </div>
                            <h3>{CustomerStatus.driver?.driver || "Driver"}</h3>
                            <p class="plate">
                                {CustomerStatus.driver?.plate || "---"}
                            </p>
                            <p class="status">Is on the way</p>
                        </div>
                        <button class="cancel-btn" on:click={CancelRide}>
                            Cancel Ride
                        </button>
                    </div>
                {:else if CustomerStatus.state === "rating"}
                    <div class="rating-screen">
                        <h3>Rate your Driver</h3>
                        <div class="stars">
                            {#each [1, 2, 3, 4, 5] as star}
                                <i
                                    class="fas fa-star"
                                    on:click={() => RateDriver(star)}
                                ></i>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .guber-app {
        width: 100%;
        height: 100%;
        background: radial-gradient(circle at top right, #1a1a1a, #000000);
        color: #fff;
        display: flex;
        flex-direction: column;
        font-family: "Inter", sans-serif;
    }

    .header {
        height: 6vh;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.2);
    }

    .logo {
        font-size: 2.2vh;
        font-weight: 700;
        letter-spacing: 1px;
    }

    .back-btn {
        position: absolute;
        left: 2vh;
        font-size: 1.8vh;
        cursor: pointer;
        color: #a0a0a0;
    }

    .content {
        flex: 1;
        overflow-y: auto;
        padding: 2vh;
        position: relative;
    }

    .card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 1.5vh;
        padding: 2vh;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        transition:
            transform 0.2s,
            background 0.2s;
    }

    .mode-select {
        display: flex;
        flex-direction: column;
        gap: 2vh;
        margin-top: 5vh;
    }

    .mode-select .btn {
        height: 15vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.5vh;
        font-size: 2vh;
        cursor: pointer;
    }

    .mode-select .btn i {
        font-size: 4vh;
        color: #4caf50;
    }

    .mode-select .btn:active {
        transform: scale(0.98);
        background: rgba(255, 255, 255, 0.1);
    }

    /* Driver View */
    .status-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2vh;
    }

    .rating {
        font-size: 1.8vh;
        color: #ffd700;
    }

    .toggle-switch {
        background: #333;
        padding: 1vh 2vh;
        border-radius: 2vh;
        font-size: 1.4vh;
        font-weight: bold;
        cursor: pointer;
        transition: 0.3s;
    }

    .toggle-switch.on {
        background: #4caf50;
        color: #000;
        box-shadow: 0 0 10px rgba(76, 175, 80, 0.4);
    }

    .course-list {
        display: flex;
        flex-direction: column;
        gap: 1.5vh;
    }

    .course-item {
        cursor: pointer;
    }

    .course-item:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .course-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1vh;
    }

    .course-icon {
        font-size: 2vh;
        color: #888;
    }

    .course-price {
        color: #4caf50;
        font-weight: bold;
        font-size: 1.8vh;
    }

    .course-details {
        display: flex;
        justify-content: space-between;
        font-size: 1.2vh;
        color: #ccc;
    }

    .empty-state,
    .offline-msg {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        color: #666;
        margin-top: 5vh;
        gap: 1vh;
    }

    .empty-state i,
    .offline-msg i {
        font-size: 4vh;
        margin-bottom: 1vh;
    }

    .active-course h3 {
        margin-bottom: 1.5vh;
        color: #4caf50;
    }

    .active-course .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 1vh;
        font-size: 1.4vh;
    }

    .money {
        color: #4caf50;
    }

    .status-text {
        margin-top: 2vh;
        text-align: center;
        color: #888;
        font-size: 1.2vh;
    }

    .cancel-btn {
        width: 100%;
        margin-top: 2vh;
        padding: 1.5vh;
        background: rgba(244, 67, 54, 0.2);
        border: 1px solid rgba(244, 67, 54, 0.5);
        border-radius: 1vh;
        color: #f44336;
        font-size: 1.4vh;
        cursor: pointer;
        transition: 0.3s;
    }

    .cancel-btn:hover {
        background: rgba(244, 67, 54, 0.3);
    }

    /* Customer View */
    .location-select h3 {
        margin-bottom: 2vh;
        font-size: 2vh;
    }

    .waypoint-info {
        display: flex;
        align-items: center;
        gap: 2vh;
        margin-bottom: 2vh;
    }

    .waypoint-icon {
        font-size: 3vh;
        color: #4caf50;
    }

    .waypoint-text {
        display: flex;
        flex-direction: column;
    }

    .waypoint-text .label {
        font-weight: bold;
        font-size: 1.6vh;
    }

    .waypoint-text .coords {
        font-size: 1.2vh;
        color: #888;
    }

    .no-waypoint {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-top: 5vh;
        gap: 1.5vh;
    }

    .no-waypoint-icon {
        font-size: 6vh;
        color: #555;
    }

    .no-waypoint p {
        font-size: 1.6vh;
        color: #aaa;
    }

    .no-waypoint .hint {
        font-size: 1.2vh;
        color: #666;
    }

    .refresh-btn {
        margin-top: 2vh;
        padding: 1.5vh 3vh;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 1vh;
        color: #fff;
        font-size: 1.4vh;
        cursor: pointer;
        transition: 0.3s;
    }

    .refresh-btn:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .request-btn {
        width: 100%;
        padding: 2vh;
        background: #4caf50;
        border: none;
        border-radius: 1.5vh;
        color: white;
        font-weight: bold;
        font-size: 1.6vh;
        cursor: pointer;
        box-shadow: 0 0 15px rgba(76, 175, 80, 0.3);
        transition: 0.3s;
    }

    .pending-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 50vh;
        gap: 2vh;
    }

    .pulse-loader {
        font-size: 5vh;
        animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
        0% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.2);
            opacity: 0.5;
        }
        100% {
            transform: scale(1);
            opacity: 1;
        }
    }

    .accepted-screen {
        text-align: center;
        margin-top: 5vh;
    }

    .driver-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1vh;
    }

    .driver-avatar {
        font-size: 8vh;
        color: #ccc;
    }

    .plate {
        background: #fff;
        color: #000;
        padding: 0.5vh 2vh;
        border-radius: 0.5vh;
        font-family: monospace;
        letter-spacing: 2px;
        font-weight: bold;
    }

    .rating-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2vh;
        margin-top: 10vh;
    }

    .stars {
        display: flex;
        gap: 1vh;
        font-size: 3vh;
        color: #ffd700;
        cursor: pointer;
    }
</style>
