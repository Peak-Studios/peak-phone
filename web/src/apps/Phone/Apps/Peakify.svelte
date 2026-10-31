<script>
import { onMount } from "svelte";
import AppWrapper from "../components/AppWrapper.svelte";
import { CurrentNetwork } from "../phone.stores";
import { CopyToClipboard, SendEvent } from "../../../utils/Utils";

let activeTab = "library";
let isLoading = true;
let isSaving = false;
let tracks = [];
let playlists = [];
let selectedPlaylistId = null;
let currentSession = null;
let notice = "";

let draftTitle = "";
let draftUrl = "";
let draftPlaylistName = "";
let draftPlaylistDescription = "";
let collaboratorCitizenId = "";

let playRadius = 25;
let playVolume = 35;

const providerColors = {
    youtube: "#ff5d5d",
    soundcloud: "#ff8f3d",
    spotify: "#52d681",
    link: "#6ea8ff",
};

const setNotice = (text) => {
    notice = text;
    clearTimeout(setNotice.timeout);
    setNotice.timeout = setTimeout(() => (notice = ""), 2500);
};

const loadState = () => {
    isLoading = true;
    SendEvent("Peakify/GetState", {}, (success, data) => {
        isLoading = false;
        if (!success || !data) return;
        tracks = data.Tracks || [];
        playlists = data.Playlists || [];
        if (!selectedPlaylistId && playlists.length > 0) {
            selectedPlaylistId = playlists[0].id;
        }
    });
};

const loadSession = () => {
    if (!$CurrentNetwork) {
        currentSession = null;
        return;
    }

    SendEvent("Peakify/GetDeviceState", { NetworkId: $CurrentNetwork }, (success, data) => {
        currentSession = success ? data : null;
    });
};

const saveTrack = () => {
    if (!draftUrl.trim()) return;
    isSaving = true;
    SendEvent("Peakify/SaveTrack", { Url: draftUrl.trim(), Title: draftTitle.trim() }, (success, data) => {
        isSaving = false;
        if (!success || data?.Success === false) {
            return setNotice(data?.Message || "Failed to save link.");
        }
        draftTitle = "";
        draftUrl = "";
        setNotice("Saved to your library.");
        loadState();
    });
};

const deleteTrack = (trackId) => {
    SendEvent("Peakify/DeleteTrack", { TrackId: trackId }, (success) => {
        if (!success) return;
        loadState();
    });
};

const createPlaylist = () => {
    if (!draftPlaylistName.trim()) return;
    SendEvent("Peakify/CreatePlaylist", {
        Name: draftPlaylistName.trim(),
        Description: draftPlaylistDescription.trim(),
    }, (success) => {
        if (!success) return;
        draftPlaylistName = "";
        draftPlaylistDescription = "";
        loadState();
        setNotice("Playlist created.");
    });
};

const deletePlaylist = (playlistId) => {
    SendEvent("Peakify/DeletePlaylist", { PlaylistId: playlistId }, (success) => {
        if (!success) return;
        if (selectedPlaylistId === playlistId) selectedPlaylistId = null;
        loadState();
    });
};

const addTrackToPlaylist = (playlistId, trackId) => {
    if (!playlistId || !trackId) return;
    SendEvent("Peakify/AddTrackToPlaylist", { PlaylistId: playlistId, TrackId: trackId }, (success) => {
        if (!success) return;
        loadState();
        setNotice("Added to playlist.");
    });
};

const removeTrackFromPlaylist = (playlistId, trackId) => {
    SendEvent("Peakify/RemoveTrackFromPlaylist", { PlaylistId: playlistId, TrackId: trackId }, (success) => {
        if (!success) return;
        loadState();
    });
};

const addCollaborator = () => {
    if (!selectedPlaylist?.isOwner || !collaboratorCitizenId.trim()) return;
    SendEvent("Peakify/AddCollaborator", {
        PlaylistId: selectedPlaylist.id,
        CitizenId: collaboratorCitizenId.trim(),
    }, (success) => {
        if (!success) return setNotice("Could not add collaborator.");
        collaboratorCitizenId = "";
        loadState();
        setNotice("Collaborator added.");
    });
};

const removeCollaborator = (citizenId) => {
    SendEvent("Peakify/RemoveCollaborator", {
        PlaylistId: selectedPlaylist.id,
        CitizenId: citizenId,
    }, (success) => {
        if (!success) return;
        loadState();
    });
};

const playTrack = (track) => {
    if (!$CurrentNetwork) {
        return setNotice("Use the network icon to connect to a nearby boombox or vehicle.");
    }
    SendEvent("Peakify/Play", {
        NetworkId: $CurrentNetwork,
        Url: track.url,
        Title: track.title,
        Radius: playRadius,
        Volume: playVolume / 100,
    }, (success, data) => {
        if (!success || !data?.Success) {
            return setNotice(data?.Message || "Playback failed.");
        }
        currentSession = data.Session;
        setNotice("Now playing nearby.");
    });
};

const setPausedState = (paused) => {
    if (!$CurrentNetwork || !currentSession) return;
    SendEvent("Peakify/Pause", { NetworkId: $CurrentNetwork, Paused: paused }, (success) => {
        if (!success) return;
        currentSession = { ...currentSession, Paused: paused };
    });
};

const stopPlayback = () => {
    if (!$CurrentNetwork) return;
    SendEvent("Peakify/Stop", { NetworkId: $CurrentNetwork }, (success) => {
        if (!success) return;
        currentSession = null;
    });
};

const stopCarrying = () => {
    SendEvent("Peakify/StopCarry", {}, (success) => {
        if (!success) return;
        setNotice("Stopped carrying boombox.");
    });
};

const sharePlaylist = (playlist) => {
    CopyToClipboard(`Peakify playlist #${playlist.id} - ${playlist.name}`);
    setNotice("Playlist reference copied.");
};

const getProviderLabel = (provider) => {
    if (provider === "youtube") return "YouTube";
    if (provider === "soundcloud") return "SoundCloud";
    if (provider === "spotify") return "Spotify";
    return "Link";
};

const shortUrl = (value) => value && value.length > 42 ? `${value.slice(0, 42)}...` : value || "";

$: selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) || null;

$: if (selectedPlaylistId && playlists.length > 0 && !playlists.find((playlist) => playlist.id === selectedPlaylistId)) {
    selectedPlaylistId = playlists[0]?.id || null;
}

$: if ($CurrentNetwork) {
    loadSession();
} else {
    currentSession = null;
}

onMount(() => {
    loadState();
    loadSession();
});
</script>

<AppWrapper>
<div class="peakify-shell">
    <div class="peakify-backdrop"></div>

    <div class="hero-card">
        <div class="hero-copy">
            <div class="eyebrow">Peakify</div>
            <div class="title">Street soundtrack control.</div>
            <div class="subtitle">Save links, build playlists, and throw audio around a boombox or vehicle radio.</div>
        </div>
        <div class="device-card">
            <div class="device-label">Connected target</div>
            <div class:connected-device={$CurrentNetwork} class="device-pill">
                {#if $CurrentNetwork}
                    {#if $CurrentNetwork.includes("carried")}
                        {currentSession?.NetworkId === $CurrentNetwork ? "Carried Speaker" : "Nearby Carrier"}
                    {:else}
                        {$CurrentNetwork.replace("peakify-", "").replaceAll("-", " ")}
                    {/if}
                {:else}
                    Not connected
                {/if}
            </div>
            <div class="device-hint">
                {$CurrentNetwork ? "Playback controls target this connection." : "Use the phone network icon to connect nearby."}
            </div>
        </div>
    </div>

    <div class="tab-row">
        <button class:active={activeTab === "library"} on:click={() => (activeTab = "library")}>Library</button>
        <button class:active={activeTab === "playlists"} on:click={() => (activeTab = "playlists")}>Playlists</button>
        <button class:active={activeTab === "device"} on:click={() => (activeTab = "device")}>Device</button>
    </div>

    {#if notice}
        <div class="notice">{notice}</div>
    {/if}

    {#if isLoading}
        <div class="loading-state">
            <i class="fas fa-circle-notch fa-spin"></i>
            <span>Loading Peakify...</span>
        </div>
    {:else if activeTab === "library"}
        <div class="content-grid">
            <div class="panel add-panel">
                <div class="panel-title">Save a link</div>
                <input bind:value={draftTitle} class="field" placeholder="Song title or nickname" />
                <textarea bind:value={draftUrl} class="field textarea" placeholder="Paste a YouTube, SoundCloud, or Spotify link"></textarea>
                <button class="primary-btn" on:click={saveTrack}>{isSaving ? "Saving..." : "Save to Library"}</button>
            </div>

            <div class="panel list-panel">
                <div class="panel-title">Saved tracks</div>
                {#if tracks.length === 0}
                    <div class="empty-block">No saved tracks yet. Start with a link above.</div>
                {:else}
                    <div class="track-list">
                        {#each tracks as track}
                            <div class="track-card">
                                <div class="track-top">
                                    <div class="provider-dot" style={`background:${providerColors[track.provider] || providerColors.link}`}></div>
                                    <div class="track-meta">
                                        <div class="track-title">{track.title}</div>
                                        <div class="track-url">{shortUrl(track.url)}</div>
                                    </div>
                                    <div class="provider-tag">{getProviderLabel(track.provider)}</div>
                                </div>
                                <div class="track-actions">
                                    <button class="ghost-btn strong" on:click={() => playTrack(track)}>Play</button>
                                    <select class="playlist-select" on:change={(event) => addTrackToPlaylist(Number(event.target.value), track.id)}>
                                        <option value="">Add to playlist</option>
                                        {#each playlists as playlist}
                                            <option value={playlist.id}>{playlist.name}</option>
                                        {/each}
                                    </select>
                                    <button class="ghost-btn danger" on:click={() => deleteTrack(track.id)}>Remove</button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    {:else if activeTab === "playlists"}
        <div class="content-grid playlist-grid">
            <div class="panel playlist-sidebar">
                <div class="panel-title">Create playlist</div>
                <input bind:value={draftPlaylistName} class="field" placeholder="Playlist name" />
                <textarea bind:value={draftPlaylistDescription} class="field textarea small" placeholder="Description"></textarea>
                <button class="primary-btn" on:click={createPlaylist}>Create</button>

                <div class="playlist-list">
                    {#each playlists as playlist}
                        <button class:selected={selectedPlaylistId === playlist.id} class="playlist-chip" on:click={() => (selectedPlaylistId = playlist.id)}>
                            <span>{playlist.name}</span>
                            <small>{playlist.tracks?.length || 0} tracks</small>
                        </button>
                    {/each}
                </div>
            </div>

            <div class="panel playlist-detail">
                {#if !selectedPlaylist}
                    <div class="empty-block">Pick a playlist to manage tracks and collaborators.</div>
                {:else}
                    <div class="playlist-header">
                        <div>
                            <div class="panel-title">{selectedPlaylist.name}</div>
                            <div class="playlist-subtitle">{selectedPlaylist.description || "No description yet"}</div>
                            <div class="playlist-owner">Owner: {selectedPlaylist.ownerName}</div>
                        </div>
                        <div class="playlist-header-actions">
                            <button class="ghost-btn" on:click={() => sharePlaylist(selectedPlaylist)}>Share</button>
                            {#if selectedPlaylist.isOwner}
                                <button class="ghost-btn danger" on:click={() => deletePlaylist(selectedPlaylist.id)}>Delete</button>
                            {/if}
                        </div>
                    </div>

                    <div class="collab-card">
                        <div class="mini-title">Collaborators</div>
                        <div class="collab-list">
                            {#if selectedPlaylist.collaborators?.length > 0}
                                {#each selectedPlaylist.collaborators as collaborator}
                                    <div class="collab-pill">
                                        <span>{collaborator.name}</span>
                                        {#if selectedPlaylist.isOwner}
                                            <button on:click={() => removeCollaborator(collaborator.citizenid)}>
                                                <i class="fas fa-times"></i>
                                            </button>
                                        {/if}
                                    </div>
                                {/each}
                            {:else}
                                <div class="empty-inline">No collaborators yet.</div>
                            {/if}
                        </div>
                        {#if selectedPlaylist.isOwner}
                            <div class="collab-form">
                                <input bind:value={collaboratorCitizenId} class="field compact" placeholder="Citizen ID" />
                                <button class="ghost-btn strong" on:click={addCollaborator}>Add</button>
                            </div>
                        {/if}
                    </div>

                    <div class="track-list compact-list">
                        {#if selectedPlaylist.tracks?.length > 0}
                            {#each selectedPlaylist.tracks as track}
                                <div class="track-card compact-card">
                                    <div class="track-meta">
                                        <div class="track-title">{track.title}</div>
                                        <div class="track-url">{shortUrl(track.url)}</div>
                                    </div>
                                    <div class="track-actions compact-actions">
                                        <button class="ghost-btn strong" on:click={() => playTrack(track)}>Play</button>
                                        <button class="ghost-btn danger" on:click={() => removeTrackFromPlaylist(selectedPlaylist.id, track.id)}>Remove</button>
                                    </div>
                                </div>
                            {/each}
                        {:else}
                            <div class="empty-block">No tracks in this playlist yet.</div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    {:else}
        <div class="content-grid device-grid">
            <div class="panel session-panel">
                <div class="panel-title">Broadcast settings</div>
                <div class="setting-row"><span>Radius</span><div class="value-pill">{playRadius}m</div></div>
                <input type="range" min="8" max="60" step="1" bind:value={playRadius} />
                <div class="setting-row"><span>Volume</span><div class="value-pill">{playVolume}%</div></div>
                <input type="range" min="5" max="100" step="1" bind:value={playVolume} />
            </div>
            <div class="panel now-playing-panel">
                <div class="panel-title">Now playing</div>
                {#if currentSession}
                    <div class="session-badge">{getProviderLabel(currentSession.Provider)}</div>
                    <div class="session-title">{currentSession.Title}</div>
                    <div class="session-copy">Radius {Math.round(currentSession.Radius)}m • Volume {Math.round((currentSession.Volume || 0) * 100)}%</div>
                    <div class="session-actions">
                        {#if currentSession.Paused}
                            <button class="primary-btn" on:click={() => setPausedState(false)}>Resume</button>
                        {:else}
                            <button class="ghost-btn strong" on:click={() => setPausedState(true)}>Pause</button>
                        {/if}
                        <button class="ghost-btn danger" on:click={stopPlayback}>Stop</button>
                    </div>
                {:else}
                    <div class="empty-block tall">Nothing is playing on the connected target.</div>
                {/if}
                
                {#if $CurrentNetwork?.includes("carried")}
                    <div class="session-actions" style="margin-top: 1vh;">
                        <button class="primary-btn" on:click={stopCarrying}>Stop Carrying</button>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
</AppWrapper>

<style>
.peakify-shell{position:relative;width:100%;height:100%;padding:4.6vh 1.8vh 1.4vh;box-sizing:border-box;color:#f7fbff;overflow:hidden;font-family:"Trebuchet MS","Segoe UI",sans-serif}.peakify-backdrop{position:absolute;inset:0;background:radial-gradient(circle at 20% 15%,rgba(0,200,170,.18),transparent 36%),radial-gradient(circle at 80% 20%,rgba(255,118,47,.18),transparent 30%),linear-gradient(160deg,rgba(7,20,28,.98),rgba(9,12,19,.98));z-index:0}.hero-card,.tab-row,.notice,.loading-state,.content-grid{position:relative;z-index:1}.hero-card{display:grid;grid-template-columns:1.35fr .95fr;gap:1vh;margin-bottom:1.2vh}.hero-copy,.device-card,.panel,.notice,.loading-state{border:.1vh solid rgba(255,255,255,.08);background:rgba(8,16,24,.72);backdrop-filter:none;border-radius:1.8vh;box-shadow:0 1.2vh 3vh rgba(0,0,0,.28)}.hero-copy{padding:1.4vh}.eyebrow{font-size:1.05vh;letter-spacing:.24vh;text-transform:uppercase;color:#86ffe8;margin-bottom:.8vh}.title{font-size:2.45vh;line-height:1.02;font-weight:700;margin-bottom:.7vh}.subtitle{font-size:1.15vh;color:rgba(236,245,255,.72);line-height:1.45}.device-card{padding:1.2vh;display:flex;flex-direction:column;gap:.8vh}.device-label,.panel-title,.mini-title{font-size:1.05vh;font-weight:700;text-transform:uppercase;letter-spacing:.14vh;color:rgba(255,255,255,.68)}.device-pill,.value-pill,.provider-tag,.session-badge{display:inline-flex;align-items:center;justify-content:center;width:fit-content;padding:.55vh 1vh;border-radius:999vh;background:rgba(255,255,255,.08);font-size:1.05vh;font-weight:700;text-transform:uppercase;letter-spacing:.06vh}.connected-device{background:linear-gradient(135deg,rgba(55,210,168,.25),rgba(55,112,210,.24));color:#d7fff6}.device-hint,.track-url,.playlist-subtitle,.playlist-owner,.session-copy,.empty-inline{font-size:1.05vh;line-height:1.4;color:rgba(238,245,255,.62)}.tab-row{display:flex;gap:.8vh;margin-bottom:1vh}.tab-row button,.playlist-chip,.primary-btn,.ghost-btn{border:none;cursor:pointer;transition:transform .16s ease,background .16s ease,color .16s ease}.tab-row button{flex:1;border-radius:1.2vh;padding:1vh .4vh;font-size:1.15vh;font-weight:700;color:rgba(255,255,255,.68);background:rgba(255,255,255,.05)}.tab-row button.active{background:linear-gradient(135deg,#1fd0aa,#2f8bff);color:#fff}.notice,.loading-state{margin-bottom:1vh;padding:.95vh 1.15vh;display:flex;align-items:center;gap:.8vh;font-size:1.1vh}.content-grid{display:grid;grid-template-columns:.92fr 1.08fr;gap:1vh;height:calc(100% - 20.2vh)}.playlist-grid{grid-template-columns:.86fr 1.14fr}.device-grid{grid-template-columns:.9fr 1.1fr}.panel{padding:1.2vh;overflow:hidden;display:flex;flex-direction:column;gap:.9vh}.field{width:100%;box-sizing:border-box;border:.1vh solid rgba(255,255,255,.08);border-radius:1.2vh;background:rgba(255,255,255,.05);color:#fff;padding:1vh 1.1vh;font-size:1.15vh;resize:none;outline:none}.textarea{min-height:11vh}.textarea.small{min-height:7vh}.field.compact{padding:.8vh 1vh}.primary-btn,.ghost-btn{border-radius:1.2vh;padding:.95vh 1.15vh;font-size:1.08vh;font-weight:700}.primary-btn{background:linear-gradient(135deg,#1fd0aa,#2f8bff);color:#fff}.ghost-btn{background:rgba(255,255,255,.06);color:#fff}.ghost-btn.strong{background:rgba(31,208,170,.15);color:#aafaea}.ghost-btn.danger{background:rgba(255,96,96,.14);color:#ffb6b6}.primary-btn:hover,.ghost-btn:hover,.playlist-chip:hover,.tab-row button:hover{transform:translateY(-.1vh)}.list-panel,.playlist-detail,.playlist-sidebar,.session-panel,.now-playing-panel{min-height:0}.track-list,.playlist-list,.compact-list{overflow-y:auto;display:flex;flex-direction:column;gap:.8vh;padding-right:.2vh}.track-list::-webkit-scrollbar,.playlist-list::-webkit-scrollbar,.compact-list::-webkit-scrollbar{width:.35vh}.track-list::-webkit-scrollbar-thumb,.playlist-list::-webkit-scrollbar-thumb,.compact-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:999vh}.track-card,.playlist-chip,.collab-card{background:rgba(255,255,255,.04);border:.1vh solid rgba(255,255,255,.05);border-radius:1.35vh}.track-card{padding:1vh;display:flex;flex-direction:column;gap:.9vh}.track-top,.track-actions,.playlist-header,.playlist-header-actions,.setting-row,.session-actions,.collab-form,.compact-card{display:flex;align-items:center;gap:.8vh}.track-top{align-items:flex-start}.provider-dot{width:1vh;height:1vh;border-radius:50%;flex:0 0 auto;margin-top:.35vh;box-shadow:0 0 1vh rgba(255,255,255,.24)}.track-meta{flex:1;min-width:0}.track-title,.session-title{font-size:1.32vh;font-weight:700;line-height:1.2;margin-bottom:.3vh}.playlist-select{flex:1;min-width:0;border:.1vh solid rgba(255,255,255,.08);border-radius:1vh;background:rgba(255,255,255,.06);color:#fff;padding:.72vh .8vh;font-size:1.02vh}.playlist-chip{width:100%;text-align:left;padding:.95vh 1vh;color:#fff;display:flex;flex-direction:column;gap:.25vh}.playlist-chip.selected{background:linear-gradient(135deg,rgba(31,208,170,.18),rgba(47,139,255,.18));border-color:rgba(138,233,255,.22)}.playlist-chip small{color:rgba(255,255,255,.58);font-size:.95vh}.playlist-detail{justify-content:flex-start}.playlist-header{justify-content:space-between;align-items:flex-start}.playlist-header-actions{flex-wrap:wrap;justify-content:flex-end}.collab-card{padding:1vh;display:flex;flex-direction:column;gap:.75vh}.collab-list{display:flex;flex-wrap:wrap;gap:.55vh}.collab-pill{display:inline-flex;align-items:center;gap:.45vh;padding:.55vh .8vh;border-radius:999vh;background:rgba(255,255,255,.08);font-size:1vh}.collab-pill button{border:none;background:transparent;color:rgba(255,255,255,.72);cursor:pointer}.setting-row{justify-content:space-between}.setting-row label{font-size:1.15vh;font-weight:600}input[type="range"]{width:100%;accent-color:#2f8bff}.empty-block{flex:1;min-height:10vh;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:1.2vh;border:.1vh dashed rgba(255,255,255,.12);color:rgba(241,247,255,.55);font-size:1.1vh;line-height:1.5;padding:1.4vh}.empty-block.tall{min-height:18vh}.compact-card{justify-content:space-between}.compact-actions{flex-shrink:0}
</style>
