/**
 * VideoCallManager.js
 * WebRTC Video Call Manager using PeerJS for FiveM Phone
 * Handles peer-to-peer video streaming for Facetime calls
 */

// PeerJS configuration with public STUN/TURN servers
const DEFAULT_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
];

// Video quality settings
const VIDEO_CONSTRAINTS = {
    video: {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 }
    },
    audio: true
};

class VideoCallManager {
    constructor() {
        this.peer = null;
        this.currentCall = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerId = null;
        this.isInitialized = false;
        this.isInCall = false;

        // Callbacks for UI updates
        this.onLocalStream = null;
        this.onRemoteStream = null;
        this.onCallConnected = null;
        this.onCallEnded = null;
        this.onError = null;
        this.onPeerIdReady = null;

        // Retry configuration
        this.maxRetries = 3;
        this.retryDelay = 1000;

        // Pending connection state - for handling race conditions
        this.pendingRemotePeerId = null;
        this.isInitiator = false;
        this.connectionAttempts = 0;

        // Microphone manager (shared audio stream with reference counting)
        this.microphoneStream = null;
        this.microphoneRefCount = 0;
        this.microphoneRefs = {};
        this.isTalking = false;
    }

    /**
     * Generate unique peer ID based on server ID
     */
    generatePeerId(serverId) {
        const randomSuffix = Math.random().toString(36).substring(2, 11);
        return `fwphone_${serverId}_${randomSuffix}`;
    }

    /**
     * Initialize PeerJS connection
     */
    async initialize(serverId, customIceServers = null) {
        if (this.isInitialized && this.peer) {
            return this.peerId;
        }

        return new Promise((resolve, reject) => {
            try {
                this.peerId = this.generatePeerId(serverId);

                const iceServers = customIceServers || DEFAULT_ICE_SERVERS;

                // Dynamic import PeerJS (loaded via CDN in index.html)
                if (typeof Peer === 'undefined') {
                    reject(new Error('PeerJS library not loaded'));
                    return;
                }

                this.peer = new Peer(this.peerId, {
                    debug: 0, // 0 = no logs, 3 = all logs
                    config: {
                        iceServers: iceServers
                    }
                });

                this.peer.on('open', (id) => {
                    console.log('[VideoCall] Peer connected with ID:', id);
                    this.isInitialized = true;
                    this.peerId = id;

                    // Setup microphone toggle listener
                    this.setupMicrophoneToggleListener();

                    if (this.onPeerIdReady) {
                        this.onPeerIdReady(id);
                    }

                    // Process any pending connection that was queued before we were ready
                    this.processPendingConnection();

                    resolve(id);
                });

                this.peer.on('call', (call) => {
                    console.log('[VideoCall] Incoming call from:', call.peer);
                    this.handleIncomingCall(call);
                });

                this.peer.on('error', (err) => {
                    console.error('[VideoCall] Peer error:', err);
                    if (this.onError) {
                        this.onError(err);
                    }

                    // Handle specific error types
                    if (err.type === 'unavailable-id') {
                        // Regenerate ID and retry
                        this.peerId = this.generatePeerId(serverId);
                        this.peer.reconnect();
                    }
                });

                this.peer.on('disconnected', () => {
                    console.log('[VideoCall] Peer disconnected, attempting reconnect...');
                    if (!this.peer.destroyed) {
                        this.peer.reconnect();
                    }
                });

                this.peer.on('close', () => {
                    console.log('[VideoCall] Peer connection closed');
                    this.isInitialized = false;
                });

            } catch (error) {
                console.error('[VideoCall] Failed to initialize:', error);
                reject(error);
            }
        });
    }

    /**
     * Acquire microphone stream reference (with reference counting)
     * @param {string} identifier - Unique identifier for this usage
     */
    async acquireMicrophoneStream(identifier = 'videocall') {
        if (!this.microphoneStream) {
            try {
                // Create audio stream with optimized settings (like lb-phone)
                this.microphoneStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        autoGainControl: false,
                        noiseSuppression: false,
                        echoCancellation: false
                    }
                });
                console.log('[VideoCall] MicrophoneManager: Got audio stream');
            } catch (err) {
                console.error('[VideoCall] MicrophoneManager: Failed to get audio stream', err);
                return null;
            }
        }

        if (!this.microphoneRefs[identifier]) {
            this.microphoneRefs[identifier] = true;
            this.microphoneRefCount++;
            console.log(`[VideoCall] MicrophoneManager (${identifier}): ${this.microphoneRefCount} audio stream${this.microphoneRefCount !== 1 ? 's' : ''} in use`);
        }

        return this.microphoneStream;
    }

    /**
     * Release microphone stream reference
     * @param {string} identifier - Unique identifier for this usage
     */
    releaseMicrophoneStream(identifier = 'videocall') {
        if (this.microphoneRefCount <= 0) {
            console.warn('[VideoCall] MicrophoneManager: Microphone usage is already 0');
            return;
        }

        if (this.microphoneRefs[identifier]) {
            delete this.microphoneRefs[identifier];
            this.microphoneRefCount--;
            console.log(`[VideoCall] MicrophoneManager: ${this.microphoneRefCount} audio stream${this.microphoneRefCount !== 1 ? 's' : ''} in use`);

            if (this.microphoneRefCount === 0 && this.microphoneStream) {
                this.microphoneStream.getTracks().forEach(track => track.stop());
                this.microphoneStream = null;
                console.log('[VideoCall] MicrophoneManager: Stopped audio stream');
            }
        }
    }

    /**
     * Mute/unmute microphone based on talking state
     * @param {boolean} enabled - Whether microphone should be enabled
     */
    setMicrophoneEnabled(enabled) {
        if (this.microphoneStream) {
            this.microphoneStream.getAudioTracks().forEach(track => {
                track.enabled = enabled;
            });
            console.log(`[VideoCall] MicrophoneManager: ${enabled ? 'Unmuting' : 'Muting'} microphone stream`);
        }
    }

    /**
     * Get local media stream with walkable camera video and microphone audio
     * Uses getDisplayMedia to capture the game window when walkable camera is active
     */
    async getLocalStream() {
        try {
            const tracks = [];

            // === GET AUDIO STREAM (with reference counting) ===
            const audioStream = await this.acquireMicrophoneStream('videocall');
            if (audioStream) {
                audioStream.getAudioTracks().forEach(track => tracks.push(track));
                console.log('[VideoCall] Using microphone audio stream');
            } else {
                console.warn('[VideoCall] No audio available');
            }

            // === GET VIDEO STREAM FROM WALKABLE CAMERA ===
            // When RenderScriptCams is active, the camera view is rendered to the game window
            // We use getDisplayMedia to capture the game window
            try {
                // Request screen capture (user will select the game window)
                // Note: This requires user interaction, so we'll handle it gracefully
                const displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        width: { ideal: 1280, max: 1920 },
                        height: { ideal: 720, max: 1080 },
                        frameRate: { ideal: 30, max: 60 }
                    },
                    audio: false // We already have audio from microphone
                });

                // Get video track from display stream
                const videoTrack = displayStream.getVideoTracks()[0];
                if (videoTrack) {
                    tracks.push(videoTrack);
                    console.log('[VideoCall] Captured video from display (walkable camera)');

                    // Handle track ending (user stops sharing)
                    videoTrack.onended = () => {
                        console.log('[VideoCall] Video track ended (user stopped sharing)');
                        // Optionally notify UI or handle reconnection
                    };
                }
            } catch (displayErr) {
                console.warn('[VideoCall] Could not capture display (user cancelled or not available):', displayErr);
                // Fallback: Create a placeholder video track
                // This allows the call to continue without video
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 480;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, 640, 480);
                ctx.fillStyle = '#34d399';
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Camera not available', 320, 240);

                const canvasStream = canvas.captureStream(1);
                canvasStream.getVideoTracks().forEach(track => tracks.push(track));
                console.log('[VideoCall] Using placeholder video track');
            }

            // Combine all tracks into a single stream
            this.localStream = new MediaStream(tracks);
            console.log('[VideoCall] Local stream created with', tracks.length, 'tracks');

            if (this.onLocalStream) {
                this.onLocalStream(this.localStream);
            }

            return this.localStream;
        } catch (error) {
            console.error('[VideoCall] Failed to get local stream:', error);
            throw error;
        }
    }

    /**
     * Start a call to a remote peer
     */
    async startCall(remotePeerId) {
        if (!this.peer || !this.isInitialized) {
            throw new Error('Peer not initialized');
        }

        if (this.isInCall) {
            throw new Error('Already in a call');
        }

        try {
            console.log('[VideoCall] Starting call to:', remotePeerId);

            await this.getLocalStream();

            this.currentCall = this.peer.call(remotePeerId, this.localStream);
            this.isInCall = true;

            this.setupCallHandlers(this.currentCall);

        } catch (error) {
            console.error('[VideoCall] Failed to start call:', error);
            this.cleanup();
            throw error;
        }
    }

    /**
     * Handle incoming call
     */
    async handleIncomingCall(call) {
        try {
            console.log('[VideoCall] Answering incoming call');

            await this.getLocalStream();

            call.answer(this.localStream);
            this.currentCall = call;
            this.isInCall = true;

            this.setupCallHandlers(call);

        } catch (error) {
            console.error('[VideoCall] Failed to answer call:', error);
            this.cleanup();
            throw error;
        }
    }

    /**
     * Setup event handlers for a call
     */
    setupCallHandlers(call) {
        call.on('stream', (remoteStream) => {
            console.log('[VideoCall] Received remote stream');
            this.remoteStream = remoteStream;

            if (this.onRemoteStream) {
                this.onRemoteStream(remoteStream);
            }

            if (this.onCallConnected) {
                this.onCallConnected();
            }
        });

        call.on('close', () => {
            console.log('[VideoCall] Call closed by remote');
            // Only cleanup if we're still in a call (prevents duplicate cleanup)
            if (this.isInCall) {
                this.cleanup();
                if (this.onCallEnded) {
                    this.onCallEnded();
                }
            }
        });

        call.on('error', (err) => {
            console.error('[VideoCall] Call error:', err);
            if (this.onError) {
                this.onError(err);
            }
        });
    }

    /**
     * End current call
     */
    endCall() {
        // Guard against multiple calls
        if (!this.isInCall && !this.currentCall) {
            console.log('[VideoCall] endCall called but no active call');
            return;
        }

        console.log('[VideoCall] Ending call');

        if (this.currentCall) {
            this.currentCall.close();
            this.currentCall = null; // Clear immediately to prevent re-entry
        }

        this.cleanup();

        if (this.onCallEnded) {
            this.onCallEnded();
        }
    }

    /**
     * Toggle local video
     */
    toggleVideo(enabled) {
        if (this.localStream) {
            const videoTracks = this.localStream.getVideoTracks();
            videoTracks.forEach(track => {
                track.enabled = enabled;
            });
        }
        return enabled;
    }

    /**
     * Toggle local audio
     */
    toggleAudio(enabled) {
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            audioTracks.forEach(track => {
                track.enabled = enabled;
            });
        }
        return enabled;
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        console.log('[VideoCall] Cleaning up resources');

        // Stop canvas animation
        if (this.canvasAnimationId) {
            clearInterval(this.canvasAnimationId);
            this.canvasAnimationId = null;
        }

        // Clean up canvas
        if (this.videoCanvas) {
            this.videoCanvas = null;
        }

        // Close audio context
        if (this.audioContext) {
            try {
                this.audioContext.close();
            } catch (e) {
                // Ignore errors on close
            }
            this.audioContext = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }

        this.currentCall = null;
        this.isInCall = false;
        this.pendingRemotePeerId = null;
        this.connectionAttempts = 0;
    }

    /**
     * Connect to a remote peer with queuing support
     * If peer not ready, queues the ID for later processing
     * @param {string} remotePeerId - The remote peer's ID
     * @param {boolean} initiator - Whether this client initiated the call
     */
    async connectToRemote(remotePeerId, initiator) {
        console.log('[VideoCall] connectToRemote called:', remotePeerId, 'initiator:', initiator, 'isInitialized:', this.isInitialized);

        this.isInitiator = initiator;

        // If not initialized yet, queue the peer ID for later
        if (!this.peer || !this.isInitialized) {
            console.log('[VideoCall] Peer not ready, queuing remote peer ID:', remotePeerId);
            this.pendingRemotePeerId = remotePeerId;
            return;
        }

        // Only the initiator should start the outgoing call
        // The receiver will get an incoming call via peer.on('call')
        if (!initiator) {
            console.log('[VideoCall] Not initiator, waiting for incoming call from:', remotePeerId);
            return;
        }

        // Already in a call, don't start another
        if (this.isInCall) {
            console.log('[VideoCall] Already in call, skipping connection');
            return;
        }

        try {
            this.connectionAttempts++;
            console.log('[VideoCall] Attempting connection to:', remotePeerId, 'attempt:', this.connectionAttempts);
            await this.startCall(remotePeerId);
        } catch (error) {
            console.error('[VideoCall] Failed to connect:', error);

            // Retry if under limit
            if (this.connectionAttempts < this.maxRetries) {
                console.log('[VideoCall] Retrying connection in', this.retryDelay, 'ms');
                setTimeout(() => {
                    this.connectToRemote(remotePeerId, initiator);
                }, this.retryDelay);
            } else {
                console.error('[VideoCall] Max retries reached, giving up');
                if (this.onError) {
                    this.onError(new Error('Failed to connect after ' + this.maxRetries + ' attempts'));
                }
            }
        }
    }

    /**
     * Process any pending remote peer ID (called after initialization completes)
     */
    processPendingConnection() {
        if (this.pendingRemotePeerId && this.isInitialized) {
            console.log('[VideoCall] Processing pending connection to:', this.pendingRemotePeerId);
            const peerId = this.pendingRemotePeerId;
            this.pendingRemotePeerId = null;
            this.connectToRemote(peerId, this.isInitiator);
        }
    }

    /**
     * Destroy peer connection completely
     */
    destroy() {
        this.cleanup();

        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }

        this.isInitialized = false;
        this.peerId = null;
    }

    /**
     * Get current peer ID
     */
    getPeerId() {
        return this.peerId;
    }

    /**
     * Check if currently in a call
     */
    getIsInCall() {
        return this.isInCall;
    }
    /**
     * Listen for microphone toggle messages from Lua
     * This allows the game to control microphone based on talking state
     */
    setupMicrophoneToggleListener() {
        window.addEventListener('message', (event) => {
            if (event.data && event.data.action === 'camera:toggleMicrophone') {
                this.setMicrophoneEnabled(event.data.data);
            }
        });
    }
}

// Singleton instance
let videoCallManagerInstance = null;

export function getVideoCallManager() {
    if (!videoCallManagerInstance) {
        videoCallManagerInstance = new VideoCallManager();
    }
    return videoCallManagerInstance;
}

export default VideoCallManager;
