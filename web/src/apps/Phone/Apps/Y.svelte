<script>
    import "../components/Misc.css";
    import { onMount, tick } from "svelte";
    import {
        ExtractImageUrls,
        FormatCurrency,
        GetTimeLabel,
        NormalizeImageUrl,
        OnEvent,
        SendEvent,
        ShowSuccessModal,
    } from "../../../utils/Utils";
    import { InputModal, LoaderModal } from "../phone.stores";

    import AppWrapper from "../components/AppWrapper.svelte";
    import ImageContainer from "../components/ImageContainer.svelte";

    let Posts = [];
    let FilteredPosts = [];
    let ShowingLimit = 20;
    let IsPremium = false;
    let PremiumExpiration = null;
    let SearchQuery = "";
    let SearchFocused = false;
    let CurrentTab = "foryou"; // foryou, following
    let CurrentView = "home"; // home, search, messages, notifications, profile, view_profile
    let ViewedProfileData = {}; // Full data of the profile being viewed (Bio, Counts, etc)
    let MyProfileData = {}; // My own profile data

    const FilterPosts = (Query) => {
        SearchQuery = Query;
        Query = Query.toLowerCase();

        if (!Query) {
            FilteredPosts = Posts;
            return;
        }

        FilteredPosts = Posts.filter(
            (Val) =>
                Val.Msg.toLowerCase().includes(Query) ||
                Val.Sender.toLowerCase().includes(Query),
        );
    };

    const LoadMore = () => {
        ShowingLimit = ShowingLimit + 20;
    };

    const CreatePost = () => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Message",
                    Type: "TextArea",
                    Data: {
                        Title: "What is happening?!",
                        Placeholder: "Type your post here...",
                        MaxLength: 280,
                    },
                },
                {
                    Id: "Image",
                    Type: "TextField",
                    Data: {
                        Title: "Image URL (Optional)",
                        Placeholder: "https://...",
                        MaxLength: 255,
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (!Result.Message || Result.Message.length <= 0) return;
                LoaderModal.set(true);

                const cleanedImage = NormalizeImageUrl(Result.Image);

                SendEvent(
                    "Y/CreatePost",
                    { Msg: Result.Message, Image: cleanedImage },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        if (Data) {
                            ShowSuccessModal("Posted!");
                            RefreshFeed();
                        }
                    },
                );
            },
        });
    };

    const ReplyPost = (Data) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Message",
                    Type: "TextArea",
                    Data: {
                        Title: `Reply to @${Data.Sender}`,
                        Value: `@${Data.Sender} `,
                        Placeholder: "Post your reply",
                        MaxLength: 280,
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (!Result.Message || Result.Message.length <= 0) return;
                LoaderModal.set(true);
                SendEvent(
                    "Y/CreatePost",
                    { Msg: Result.Message },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        if (Data) {
                            ShowSuccessModal("Reply Sent!");
                            RefreshFeed();
                        }
                    },
                );
            },
        });
    };

    const Repost = (Data) => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Message",
                    Type: "TextArea",
                    Data: {
                        Title: "Repost this?",
                        Value: `RT @${Data.Sender}: ${Data.Msg}`,
                        Placeholder: "Add a comment...",
                        MaxLength: 280,
                    },
                },
            ],
            OnSubmit: (Result) => {
                if (!Result.Message || Result.Message.length <= 0) return;
                LoaderModal.set(true);
                SendEvent(
                    "Y/CreatePost",
                    { Msg: Result.Message },
                    (Success, Data) => {
                        LoaderModal.set(false);
                        if (!Success) return;
                        if (Data) {
                            ShowSuccessModal("Reposted!");
                            RefreshFeed();
                        }
                    },
                );
            },
        });
    };

    const ReportPost = (Id) => {
        LoaderModal.set(true);
        SendEvent("Y/ReportPost", { Id: Id }, (Success, Data) => {
            LoaderModal.set(false);
            if (!Success) return;
            ShowSuccessModal("Post Reported");
        });
    };

    const ToggleLike = (Data) => {
        let TargetId = Data.Id;
        // Optimistic UI update
        Posts = Posts.map((p) => {
            if (p.Id === TargetId) {
                if (typeof p.LikeCount === "undefined") p.LikeCount = 0;
                let NewLikedState = !p.HasLiked;
                p.HasLiked = NewLikedState;
                p.LikeCount = NewLikedState
                    ? p.LikeCount + 1
                    : Math.max(0, p.LikeCount - 1);
            }
            return p;
        });
        FilterPosts(SearchQuery);

        SendEvent("Y/ToggleLike", { Id: TargetId }, (Success, Result) => {
            if (!Success || !Result.Success) {
                RefreshFeed();
                return;
            }
            // Sync with server result
            Posts = Posts.map((p) => {
                if (p.Id === TargetId) {
                    p.HasLiked = Result.HasLiked;
                    p.LikeCount = Result.LikeCount;
                }
                return p;
            });
            FilterPosts(SearchQuery);
        });
    };

    const TogglePremium = () => {
        LoaderModal.set(true);
        SendEvent("Y/TogglePremium", {}, (Success, Data) => {
            LoaderModal.set(false);
            if (!Success || !Data.Success) return;

            IsPremium = Data.IsPremium;
            PremiumExpiration = Data.Expiration;

            if (Data.IsPremium) {
                ShowSuccessModal("Welcome to Premium!");
            } else {
                ShowSuccessModal("Premium Cancelled");
            }
        });
    };

    const RefreshFeed = () => {
        FilterPosts(SearchQuery);
    };

    const GoToProfile = (ProfileData) => {
        // Check if viewing self
        if (ProfileData.Sender === (MyProfileData.Username || "") || ProfileData.Cid === MyProfileData.CitizenId) {
             CurrentView = "profile";
             FetchMyProfile();
             return;
        }

        ViewedProfileData = {
            Sender: ProfileData.Sender,
            Avatar: ProfileData.Avatar,
            IsPremium: ProfileData.IsPremium,
        };
        CurrentView = "view_profile";
        SendEvent("Y/GetProfile", { Cid: ProfileData.Cid }, (Success, Data) => {
            if (Success) ViewedProfileData = { ...ViewedProfileData, ...Data };
        });
    };

    const ToggleFollow = () => {
        if (!ViewedProfileData || !ViewedProfileData.Sender) return;
        
        // Optimistic UI update
        ViewedProfileData.IsFollowing = !ViewedProfileData.IsFollowing;
        if (ViewedProfileData.IsFollowing) {
            ViewedProfileData.Followers = (ViewedProfileData.Followers || 0) + 1;
        } else {
             ViewedProfileData.Followers = Math.max(0, (ViewedProfileData.Followers || 1) - 1);
        }

        SendEvent("Y/ToggleFollow", { TargetCid: ViewedProfileData.Cid }, (Success, Data) => {
            if (!Success || !Data.Success) {
                 // Revert if failed
                 ViewedProfileData.IsFollowing = !ViewedProfileData.IsFollowing;
                 ShowSuccessModal("Failed to follow/unfollow");
                 return;
            }
            // Sync with server
            ViewedProfileData.IsFollowing = Data.IsFollowing;
        });
    }

    const FetchMyProfile = () => {
        SendEvent("Y/GetProfile", {}, (Success, Data) => {
            if (Success) MyProfileData = Data;
        });
    };
    
    // ... [Rest of EditProfile] ...
    const EditProfile = () => {
        InputModal.set({
            Visible: true,
            Inputs: [
                {
                    Id: "Name",
                    Type: "TextField",
                    Data: {
                        Title: "Display Name",
                        Value: MyProfileData.Name || "",
                        Placeholder: "Your Name",
                        MaxLength: 50,
                    },
                },
                {
                    Id: "Bio",
                    Type: "TextArea",
                    Data: {
                        Title: "Bio",
                        Value: MyProfileData.Bio || "",
                        Placeholder: "Add a bio to your profile",
                        MaxLength: 160,
                    },
                },
                {
                    Id: "Avatar",
                    Type: "TextField",
                    Data: {
                        Title: "Profile Picture URL",
                        Value: MyProfileData.Avatar || "",
                        Placeholder: "https://...",
                    },
                },
                {
                    Id: "Banner",
                    Type: "TextField",
                    Data: {
                        Title: "Banner URL",
                        Value: MyProfileData.Banner || "",
                        Placeholder: "https://...",
                    },
                },
            ],
            OnSubmit: (Result) => {
                LoaderModal.set(true);
                SendEvent("Y/UpdateProfile", Result, (Success, Data) => {
                    LoaderModal.set(false);
                    if (!Success) return;
                    ShowSuccessModal("Profile Updated!");
                    FetchMyProfile();
                });
            },
        });
    };

    onMount(() => {
        SendEvent("Y/GetPosts", {}, (Success, Data) => {
            if (Success && Data) {
                Posts = Data.reverse().map((Post) => ({
                    ...Post,
                    Image: NormalizeImageUrl(Post.Image),
                }));
                RefreshFeed();
            }
        });
        FetchMyProfile();
        SendEvent("Y/GetPremiumStatus", {}, (Success, Data) => {
            if (!Success) return;
            IsPremium = Data.IsPremium;
            PremiumExpiration = Data.Expiration;
        });
    });

    OnEvent("Y/SetPosts", (Data) => {
        Posts = Data.Posts.reverse().map((Post) => ({
            ...Post,
            Image: NormalizeImageUrl(Post.Image),
        }));
        FilterPosts(SearchQuery);
    });
</script>

<AppWrapper>
    <div class="y-app">
        <header class="header">
            <div class="header-top">
                <div
                    class="profile-icon"
                    on:click={() => {
                        CurrentView = "profile";
                        FetchMyProfile();
                    }}
                >
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="logo">
                    <!-- Simple Y logo using text or icon if available -->
                    <span class="logo-text">Y</span>
                </div>
                <div class="header-actions">
                    <button
                        class="premium-btn"
                        class:active={IsPremium}
                        on:click={TogglePremium}
                    >
                        <i class="fas fa-certificate"></i>
                    </button>
                </div>
            </div>
            <div class="tabs">
                <button
                    class="tab-btn"
                    class:active={CurrentTab === "foryou"}
                    on:click={() => (CurrentTab = "foryou")}>For you</button
                >
                <button
                    class="tab-btn"
                    class:active={CurrentTab === "following"}
                    on:click={() => (CurrentTab = "following")}
                    >Following</button
                >
            </div>
        </header>

        <main class="feed">
            {#if CurrentView === "home"}
                <!-- Home Feed -->
                {#if FilteredPosts.length === 0}
                    <div class="empty-feed">
                        <i
                            class="fas fa-wind"
                            style="margin-bottom: 1rem; font-size: 2rem;"
                        ></i>
                        <p>No posts yet.</p>
                    </div>
                {:else}
                    {#each FilteredPosts.slice(0, ShowingLimit) as post (post.Id || Math.random())}
                        <article class="post">
                            <div
                                class="post-avatar"
                                on:click|stopPropagation={() =>
                                    GoToProfile(post)}
                            >
                                <div
                                    class="avatar-img"
                                    style="background-image: url({post.Avatar ||
                                        './images/default_profile.png'});"
                                    referrerpolicy="no-referrer"
                                ></div>
                            </div>
                            <div
                                class="post-content"
                                on:click={() => {
                                    /* View single post detail? */
                                }}
                            >
                                <div class="post-header">
                                    <div class="user-meta">
                                        <span
                                            class="display-name"
                                            on:click|stopPropagation={() =>
                                                GoToProfile(post)}
                                            >@{post.Sender}</span
                                        >
                                        {#if post.IsPremium}
                                            <i
                                                class="fas fa-check-circle verified-badge"
                                            ></i>
                                        {/if}
                                        <span class="separator">·</span>
                                        <span class="timestamp"
                                            >{GetTimeLabel(
                                                post.Timestamp,
                                            )}</span
                                        >
                                    </div>
                                    <button
                                        class="more-btn"
                                        on:click|stopPropagation={() =>
                                            ReportPost(post.Id)}
                                    >
                                        <i class="fas fa-ellipsis-h"></i>
                                    </button>
                                </div>

                                <div class="post-text">
                                    <p>{ExtractImageUrls(post.Msg)[1]}</p>
                                </div>

                                {#if post.Image}
                                    <div class="post-media simple">
                                        <img
                                            src={post.Image}
                                            alt="Post Media"
                                            loading="lazy"
                                            referrerpolicy="no-referrer"
                                        />
                                    </div>
                                {/if}
                                {#if ExtractImageUrls(post.Msg)[0].length > 0}
                                    <div class="post-media-gallery">
                                        <ImageContainer
                                            Attachments={ExtractImageUrls(
                                                post.Msg,
                                            )[0]}
                                        />
                                    </div>
                                {/if}

                                <div class="post-actions">
                                    <button
                                        class="action-btn reply"
                                        on:click|stopPropagation={() =>
                                            ReplyPost(post)}
                                    >
                                        <i class="far fa-comment"></i>
                                        <!-- <span>0</span> -->
                                    </button>
                                    <button
                                        class="action-btn repost"
                                        on:click|stopPropagation={() =>
                                            Repost(post)}
                                    >
                                        <i class="fas fa-retweet"></i>
                                    </button>
                                    <button
                                        class="action-btn like"
                                        class:liked={post.HasLiked}
                                        on:click|stopPropagation={() =>
                                            ToggleLike(post)}
                                    >
                                        {#if post.HasLiked}
                                            <i class="fas fa-heart"></i>
                                        {:else}
                                            <i class="far fa-heart"></i>
                                        {/if}
                                        {#if post.LikeCount > 0}
                                            <span class="count"
                                                >{post.LikeCount}</span
                                            >
                                        {/if}
                                    </button>
                                    <button
                                        class="action-btn share"
                                        on:click|stopPropagation={() => {}}
                                    >
                                        <i class="far fa-share-square"></i>
                                    </button>
                                </div>
                            </div>
                        </article>
                    {/each}

                    {#if FilteredPosts.length > ShowingLimit}
                        <button class="show-more" on:click={LoadMore}
                            >Show more</button
                        >
                    {/if}
                {/if}

                <div class="fab-container">
                    <button class="fab" on:click={CreatePost}>
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            {:else if CurrentView === "search"}
                <div class="view-container">
                    <div class="search-header" style="padding: 16px;">
                        <input
                            type="text"
                            placeholder="Search Y"
                            bind:value={SearchQuery}
                            on:input={() => FilterPosts(SearchQuery)}
                            style="width: 100%; padding: 10px; border-radius: 20px; border: 1px solid #333; background: #202327; color: white;"
                        />
                    </div>
                    <div class="search-results">
                        {#if SearchQuery.length > 0}
                            {#each FilteredPosts as post}
                                <article class="post">
                                    <!-- Reuse post component logic or simplify for search results -->
                                    <div
                                        class="post-avatar"
                                        on:click|stopPropagation={() =>
                                            GoToProfile(post)}
                                    >
                                        <div
                                            class="avatar-img"
                                            style="background-image: url({post.Avatar ||
                                                './images/default_profile.png'});"
                                        ></div>
                                    </div>
                                    <div class="post-content">
                                        <div class="user-meta">
                                            <span class="display-name"
                                                >@{post.Sender}</span
                                            >
                                            <span class="timestamp"
                                                >{GetTimeLabel(
                                                    post.Timestamp,
                                                )}</span
                                            >
                                        </div>
                                        <div class="post-text">
                                            <p>
                                                {ExtractImageUrls(post.Msg)[1]}
                                            </p>
                                        </div>
                                    </div>
                                </article>
                            {/each}
                        {:else}
                            <div class="empty-feed">
                                <p>Try searching for people or topics</p>
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if CurrentView === "messages"}
                <div class="view-container">
                    <div class="empty-feed">
                        <i
                            class="far fa-envelope"
                            style="font-size: 2rem; margin-bottom: 1rem;"
                        ></i>
                        <p>Messages coming soon</p>
                    </div>
                </div>
            {:else if CurrentView === "profile" || CurrentView === "view_profile"}
                {#if CurrentView === "profile" && MyProfileData}
                    <div class="view-container profile-view">
                        <div class="profile-header">
                            <div
                                class="cover-photo"
                                style="background-color: #333; height: 120px; width: 100%; background-image: url({MyProfileData.Banner ||
                                    ''}); background-size: cover; background-position: center;"
                            ></div>
                            <div
                                class="profile-info"
                                style="padding: 16px; position: relative;"
                            >
                                <div
                                    class="profile-avatar-large"
                                    style="width: 80px; height: 80px; border-radius: 50%; background-color: #000; border: 4px solid #000; position: absolute; top: -40px; left: 16px; background-image: url({MyProfileData.Avatar ||
                                        './images/default_profile.png'}); background-size: cover; background-position: center;"
                                ></div>

                                <div
                                    class="profile-actions"
                                    style="display: flex; justify-content: flex-end;"
                                >
                                    <button
                                        class="edit-profile-btn"
                                        on:click={EditProfile}
                                        style="background: transparent; border: 1px solid #cfd9de; color: #eff3f4; padding: 6px 16px; border-radius: 20px; font-weight: 700; cursor: pointer;"
                                        >Edit profile</button
                                    >
                                </div>

                                <div
                                    class="profile-details"
                                    style="margin-top: 40px;"
                                >
                                    <h1
                                        style="font-size: 20px; font-weight: 800; margin: 0;"
                                    >
                                        {MyProfileData.Name || "My Profile"}
                                    </h1>
                                    <p style="color: #71767b; margin: 4px 0;">
                                        @{MyProfileData.Username || "me"}
                                    </p>
                                    <p class="bio" style="margin-top: 12px;">
                                        {MyProfileData.Bio || "No bio yet."}
                                    </p>

                                    <div
                                        class="follow-stats"
                                        style="display: flex; gap: 20px; margin-top: 12px; color: #71767b; font-size: 14px;"
                                    >
                                        <span
                                            ><strong style="color: #eff3f4;"
                                                >{MyProfileData.Following ||
                                                    0}</strong
                                            > Following</span
                                        >
                                        <span
                                            ><strong style="color: #eff3f4;"
                                                >{MyProfileData.Followers ||
                                                    0}</strong
                                            > Followers</span
                                        >
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                {:else if CurrentView === "view_profile" && ViewedProfileData}
                    <div class="view-container profile-view">
                        <div class="profile-header">
                            <div
                                class="cover-photo"
                                style="background-color: #333; height: 120px; width: 100%; background-image: url({ViewedProfileData.Banner ||
                                    ''}); background-size: cover; background-position: center;"
                            ></div>
                            <div
                                class="profile-info"
                                style="padding: 16px; position: relative;"
                            >
                                <div
                                    class="profile-avatar-large"
                                    style="width: 80px; height: 80px; border-radius: 50%; background-color: #000; border: 4px solid #000; position: absolute; top: -40px; left: 16px; background-image: url({ViewedProfileData.Avatar ||
                                        './images/default_profile.png'}); background-size: cover; background-position: center;"
                                ></div>

                                <div
                                    class="profile-actions"
                                    style="display: flex; justify-content: flex-end;"
                                >
                                    <button
                                        class="edit-profile-btn"
                                        style="background: {ViewedProfileData.IsFollowing ? 'transparent' : '#eff3f4'}; border: 1px solid {ViewedProfileData.IsFollowing ? '#cfd9de' : '#eff3f4'}; color: {ViewedProfileData.IsFollowing ? '#eff3f4' : '#0f1419'}; padding: 6px 16px; border-radius: 20px; font-weight: 700; cursor: pointer;"
                                        on:click={ToggleFollow}
                                        >{ViewedProfileData.IsFollowing ? 'Following' : 'Follow'}</button
                                    >
                                </div>

                                <div
                                    class="profile-details"
                                    style="margin-top: 40px;"
                                >
                                    <h1
                                        style="font-size: 20px; font-weight: 800; margin: 0;"
                                    >
                                        {ViewedProfileData.Name ||
                                            "@" + ViewedProfileData.Sender}
                                    </h1>
                                    <p style="color: #71767b; margin: 4px 0;">
                                        @{ViewedProfileData.Sender}
                                    </p>
                                    <p class="bio" style="margin-top: 12px;">
                                        {ViewedProfileData.Bio || "No bio yet."}
                                    </p>

                                    <div
                                        class="follow-stats"
                                        style="display: flex; gap: 20px; margin-top: 12px; color: #71767b; font-size: 14px;"
                                    >
                                        <span
                                            ><strong style="color: #eff3f4;"
                                                >{ViewedProfileData.Following ||
                                                    0}</strong
                                            > Following</span
                                        >
                                        <span
                                            ><strong style="color: #eff3f4;"
                                                >{ViewedProfileData.Followers ||
                                                    0}</strong
                                            > Followers</span
                                        >
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}
            {/if}
        </main>

        <!-- <div class="fab-container"> ... moved inside home view -->

        <nav class="bottom-nav">
            <button
                class="nav-item"
                class:active={CurrentView === "home"}
                on:click={() => (CurrentView = "home")}
            >
                <i class="fas fa-home"></i>
            </button>
            <button
                class="nav-item"
                class:active={CurrentView === "search"}
                on:click={() => (CurrentView = "search")}
            >
                <i class="fas fa-search"></i>
            </button>
            <button
                class="nav-item"
                class:active={CurrentView === "notifications"}
                on:click={() => (CurrentView = "notifications")}
            >
                <i class="far fa-bell"></i>
            </button>
            <button
                class="nav-item"
                on:click={() => SendEvent("Y/OpenMessages")}
            >
                <i class="far fa-envelope"></i>
            </button>
        </nav>
    </div>
</AppWrapper>

<style>
    .y-app {
        width: 100%;
        height: 100%;
        background-color: #000000;
        color: #e7e9ea;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Helvetica, Arial, sans-serif;
        position: relative;
    }

    /* Header */
    .header {
        position: sticky;
        top: 0;
        background: rgba(0, 0, 0, 0.92);
        z-index: 10;
        border-bottom: 1px solid #2f3336;
        padding-top: 32px; /* Status bar clearance */
    }

    .header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 16px;
        height: 53px;
    }

    .profile-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: #eff3f4;
    }

    .logo {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
    }

    .logo-text {
        font-size: 22px;
        font-weight: 800;
        font-style: italic;
        color: #eff3f4;
    }

    .header-actions .premium-btn {
        background: none;
        border: none;
        color: #eff3f4;
        font-size: 18px;
        cursor: pointer;
    }
    .header-actions .premium-btn.active {
        color: #1d9bf0;
    }

    .tabs {
        display: flex;
        height: 53px;
    }

    .tab-btn {
        flex: 1;
        background: none;
        border: none;
        color: #71767b;
        font-weight: 500;
        font-size: 15px;
        cursor: pointer;
        position: relative;
        transition: color 0.2s;
    }

    .tab-btn:hover {
        background-color: rgba(239, 243, 244, 0.1);
    }

    .tab-btn.active {
        color: #eff3f4;
        font-weight: 700;
    }

    .tab-btn.active::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 56px;
        height: 4px;
        background-color: #1d9bf0;
        border-radius: 9999px;
    }

    /* Feed */
    .feed {
        flex: 1;
        overflow-y: auto;
        padding-bottom: 80px; /* Space for FAB */
    }

    .empty-feed {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: #71767b;
    }

    .post {
        display: flex;
        padding: 12px 16px;
        border-bottom: 1px solid #2f3336;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .post:hover {
        background-color: rgba(255, 255, 255, 0.03);
    }

    .post-avatar {
        margin-right: 12px;
        flex-shrink: 0;
    }

    .avatar-img {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background-size: cover;
        background-position: center;
        background-color: #333;
    }

    .post-content {
        flex: 1;
        min-width: 0;
    }

    .post-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 2px;
    }

    .user-meta {
        display: flex;
        align-items: center;
        overflow: hidden;
        white-space: nowrap;
        font-size: 15px;
    }

    .display-name {
        font-weight: 700;
        color: #eff3f4;
        margin-right: 2px;
    }

    .verified-badge {
        color: #1d9bf0;
        font-size: 14px;
        margin-left: 2px;
        margin-right: 4px;
    }

    .separator {
        color: #71767b;
        margin: 0 4px;
    }

    .timestamp {
        color: #71767b;
        font-weight: 400;
    }

    .more-btn {
        background: none;
        border: none;
        color: #71767b;
        cursor: pointer;
        padding: 4px;
        margin-top: -4px;
        transition:
            color 0.2s,
            background-color 0.2s;
        border-radius: 50%;
    }
    .more-btn:hover {
        color: #1d9bf0;
        background-color: rgba(29, 155, 240, 0.1);
    }

    .post-text {
        font-size: 15px;
        line-height: 20px;
        color: #e7e9ea;
        margin-bottom: 12px;
        white-space: pre-wrap;
        word-wrap: break-word;
    }

    .post-media.simple img {
        width: 100%;
        border-radius: 16px;
        border: 1px solid #2f3336;
        margin-top: 8px;
    }

    /* Actions */
    .post-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        max-width: 425px; /* Limit width */
    }

    .action-btn {
        background: none;
        border: none;
        color: #71767b;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        padding: 6px;
        border-radius: 50%;
        transition: all 0.2s;
    }

    .action-btn i {
        font-size: 18px;
    }

    .action-btn:hover.reply {
        color: #1d9bf0;
        background-color: rgba(29, 155, 240, 0.1);
    }
    .action-btn:hover.repost {
        color: #00ba7c;
        background-color: rgba(0, 186, 124, 0.1);
    }
    .action-btn:hover.like {
        color: #f91880;
        background-color: rgba(249, 24, 128, 0.1);
    }
    .action-btn:hover.share {
        color: #1d9bf0;
        background-color: rgba(29, 155, 240, 0.1);
    }

    .action-btn.liked {
        color: #f91880;
    }
    .action-btn.liked i {
        animation: pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    @keyframes pop {
        0% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.3);
        }
        100% {
            transform: scale(1);
        }
    }

    .show-more {
        width: 100%;
        padding: 16px;
        background: none;
        border: none;
        color: #1d9bf0;
        cursor: pointer;
        font-size: 15px;
        border-bottom: 1px solid #2f3336;
    }
    .show-more:hover {
        background-color: rgba(255, 255, 255, 0.03);
    }

    /* FAB */
    .fab-container {
        position: absolute;
        bottom: 70px; /* Above nav */
        right: 20px;
        z-index: 20;
    }

    .fab {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background-color: #1d9bf0;
        box-shadow: 0 4px 10px rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        font-size: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s;
    }

    .fab:hover {
        background-color: #1a8cd8;
        transform: scale(1.05);
    }

    /* Bottom Nav */
    .bottom-nav {
        height: 50px;
        border-top: 1px solid #2f3336;
        display: flex;
        align-items: center;
        justify-content: space-around;
        background-color: #000000;
        z-index: 30;
    }

    .nav-item {
        background: none;
        border: none;
        color: #eff3f4;
        font-size: 24px;
        cursor: pointer;
        padding: 10px;
    }

    .nav-item.active {
        color: #eff3f4;
    }

    .nav-item:not(.active) {
        color: #71767b;
    }
</style>
