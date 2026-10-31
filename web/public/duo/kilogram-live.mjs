import { KilogramLiveCapture } from './kilogram-live-capture.mjs';
import { isNuiMessage, connectionStatus, tuneVideoSenders, addIce } from './rtc-utils.mjs';

/** A bounded one-to-many live transport. Game frames never pass through Lua or the database. */
export class KilogramLive extends EventTarget {
    constructor({ send, captureFactory = options => new KilogramLiveCapture(options),
        peerFactory = options => new RTCPeerConnection(options),
        microphone = () => navigator.mediaDevices.getUserMedia({ video: false,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) } = {}) {
        super();
        this.send = send; this.captureFactory = captureFactory;
        this.peerFactory = peerFactory; this.microphone = microphone;
        this.generation = 0; this.session = null; this.connecting = false; this.ended = null; this.leaving = null;
        this.onMessage = event => {
            if (!isNuiMessage(event)) return;
            try { this.handle(event.data); }
            catch (error) { if (this.session) this.fail(this.session, error); }
        };
        this.onUnload = () => this.leave('Phone closed.');
        window.addEventListener('message', this.onMessage);
        window.addEventListener('beforeunload', this.onUnload);
    }
    changed() { this.dispatchEvent(new Event('change')); }
    valid(session) { return this.session === session && session.generation === this.generation; }
    snapshot() {
        const s = this.session;
        return { connecting: this.connecting, ended: this.ended, session: s?.info || null,
            role: s?.role, connected: !!s?.connected, stream: s?.role === 'host' ? s.local : s?.remote,
            comments: s?.comments || [], people: s?.people || [], pinned: s?.pinned || null,
            muted: !!s?.muted, microphone: !!s?.mic, micEnabled: !!s?.micEnabled,
            lastGift: s?.lastGift || null, giftSequence: s?.giftSequence || 0,
            front: s?.front !== false, notice: s?.notice || '', source: s?.source };
    }
    async rpc(route, data = {}) {
        const result = await this.send('KiloLive/' + route, data);
        if (!result || result.Success !== true || result.__phoneError) {
            throw new Error(result?.Msg || result?.Error || 'The live service could not be reached.');
        }
        return result;
    }
    data(session, extra = {}) { return { SessionId: session.id, Token: session.token, ...extra }; }
    action(route, data = {}) {
        if (!this.session) return Promise.reject(new Error('This live session has ended.'));
        return this.rpc(route, this.data(this.session, data));
    }
    async start(title, useMic = false) { return this.connect('Start', { Title: title }, useMic); }
    async join(id) { return this.connect('Join', { SessionId: id }, false); }
    async connect(route, payload, useMic) {
        if (this.session || this.connecting) throw new Error('Leave the current live first.');
        const generation = ++this.generation;
        this.connecting = true; this.ended = null; this.changed();
        let s;
        try {
            if (this.leaving) await this.leaving;
            if (generation !== this.generation) return;
            const result = await this.rpc(route, payload);
            if (generation !== this.generation) {
                await this.rpc('Leave', { SessionId: result.session.id, Token: result.token }).catch(() => {});
                return;
            }
            s = this.session = { id: result.session.id, token: result.token, role: result.role,
                source: result.source, hostSource: result.hostSource, hostToken: result.hostToken,
                options: result.settings, iceServers: result.iceServers, generation,
                info: result.session, comments: [], people: [], pinned: null, sequence: -1,
                peers: new Map(), local: new MediaStream(), remote: new MediaStream(),
                connected: false, front: true, micEnabled: false, notice: '' };
            this.applyState(s, result);
            s.heartbeat = setInterval(() => {
                if (this.valid(s)) this.action('Heartbeat').catch(error => this.fail(s, error));
            }, 8000);
            await this.action('Heartbeat');
            if (!this.valid(s)) return;
            if (s.role === 'host') {
                s.capture = await this.captureFactory({ width: s.options.width, height: s.options.height,
                    fps: s.options.fps, onError: error => this.fail(s, error) });
                if (!this.valid(s)) { s.capture.stop(); return; }
                for (const track of s.capture.stream.getVideoTracks()) {
                    s.local.addTrack(track);
                    track.addEventListener('ended', () => this.fail(s, new Error('The game camera stopped.')), { once: true });
                }
                if (!s.local.getVideoTracks().length) throw new Error('No game video track was produced.');
                if (useMic && s.options.allowMicrophone) await this.acquireMicrophone(s);
                if (!this.valid(s)) return;
                const ready = await this.action('Ready', { HasAudio: s.micEnabled });
                if (!this.valid(s)) return;
                this.applyState(s, ready); s.connected = true;
            } else {
                this.createPeer(s, s.hostSource, s.hostToken);
                const ready = await this.action('Ready');
                if (!this.valid(s)) return;
                this.applyState(s, ready);
            }
            this.connecting = false; this.changed();
        } catch (error) {
            if (generation === this.generation) {
                this.connecting = false;
                if (s) this.fail(s, error);
                else { this.ended = { reason: error.message, error: true }; this.changed(); }
            }
            throw error;
        }
    }
    async acquireMicrophone(s) {
        let expired = false, timer;
        try {
            const pending = Promise.resolve().then(() => this.microphone());
            pending.then(stream => {
                if (expired || !this.valid(s)) stream.getTracks().forEach(track => track.stop());
            }, () => {});
            const mic = await Promise.race([pending, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Microphone permission timed out.')), 8000);
            })]);
            if (!this.valid(s)) { mic.getTracks().forEach(track => track.stop()); return; }
            if (!mic.getAudioTracks().length) { mic.getTracks().forEach(track => track.stop()); throw new Error('No microphone track.'); }
            s.mic = mic; s.micEnabled = true;
            for (const track of mic.getAudioTracks()) {
                s.local.addTrack(track);
                track.addEventListener('ended', () => {
                    if (!this.valid(s)) return;
                    s.micEnabled = false; s.notice = 'Microphone disconnected. Video is still live.';
                    this.action('Moderate', { Mode: 'audio', Enabled: false }).catch(() => {}); this.changed();
                }, { once: true });
            }
        } catch {
            expired = true;
            if (this.valid(s)) s.notice = 'Microphone unavailable in this client. Broadcasting video only.';
        } finally { clearTimeout(timer); }
    }
    createPeer(s, source, token) {
        const previous = s.peers.get(source);
        if (previous?.token === token) return previous;
        if (previous) this.closePeer(s, previous);
        if (!this.valid(s) || s.peers.size >= s.options.maxViewers) return null;
        const pc = this.peerFactory({ iceServers: Array.isArray(s.iceServers) ? s.iceServers : [],
            iceTransportPolicy: s.options.relayOnly ? 'relay' : 'all', bundlePolicy: 'max-bundle' });
        const p = { pc, source, token, candidates: [], chain: Promise.resolve(), restarts: 0, closed: false };
        s.peers.set(source, p);
        pc.onicecandidate = event => {
            if (this.peerValid(s, p)) this.signal(s, p, { type: 'ice',
                candidate: event.candidate?.toJSON?.() || event.candidate || false }).catch(error => this.peerFailed(s, p, error));
        };
        pc.ontrack = event => {
            if (!this.peerValid(s, p) || s.role !== 'viewer') return;
            if (!s.remote.getTracks().some(track => track.id === event.track.id)) s.remote.addTrack(event.track);
            this.changed();
        };
        pc.onconnectionstatechange = pc.oniceconnectionstatechange = () => {
            if (!this.peerValid(s, p)) return;
            const status = connectionStatus(pc);
            if (status === p.status) return;
            p.status = status;
            if (status === 'connected') {
                clearTimeout(p.deadline); p.deadline = null;
                clearTimeout(p.restartTimer); p.restartTimer = null;
                void tuneVideoSenders(pc, s.options);
                if (s.role === 'viewer') {
                    s.connected = true; s.notice = '';
                    this.action('Status', { Connected: true }).catch(error => this.fail(s, error));
                }
            } else if (status === 'disconnected' || status === 'failed') {
                this.deadline(s, p);
                if (s.role === 'viewer') {
                    s.connected = false; s.notice = 'Reconnecting to the live…';
                    this.action('Status', { Connected: false }).catch(() => {});
                    if (p.restarts < 2 && !p.restartTimer) p.restartTimer = setTimeout(() => {
                        p.restartTimer = null;
                        if (this.peerValid(s, p) && connectionStatus(pc) !== 'connected') {
                            ++p.restarts;
                            this.signal(s, p, { type: 'restart' }).catch(error => this.peerFailed(s, p, error));
                        }
                    }, 1500);
                }
            }
            this.changed();
        };
        if (s.role === 'host') {
            for (const track of s.local.getTracks()) pc.addTrack(track, s.local);
        }
        // Tuning before SDP can reject on CEF and used to drop every new viewer.
        // Negotiate first, then apply optional encoding hints without failing media.
        p.setup = Promise.resolve();
        this.deadline(s, p);
        return p;
    }
    peerValid(s, p) { return this.valid(s) && !p.closed && s.peers.get(p.source) === p; }
    deadline(s, p) {
        if (p.deadline) return; // Duplicate ICE/state events must not extend a dead connection forever.
        p.deadline = setTimeout(() => this.peerFailed(s, p,
            new Error('Live video could not connect. Check the TURN relay and retry.')), Math.max(10, Math.min(60, Number(s.options.connectionTimeout) || 25)) * 1000);
    }
    queue(s, p, task) {
        if (!p) return;
        p.chain = p.chain.then(() => this.peerValid(s, p) ? task() : undefined)
            .catch(error => this.peerFailed(s, p, error));
        return p.chain;
    }
    signal(s, p, signal) {
        if (!this.peerValid(s, p)) return Promise.resolve();
        return this.rpc('Signal', this.data(s, { Peer: p.source, PeerToken: p.token, Signal: signal }));
    }
    async offer(s, p, restart = false) {
        if (!this.peerValid(s, p) || s.role !== 'host' || p.pc.signalingState !== 'stable') return;
        await p.setup;
        if (!this.peerValid(s, p) || p.pc.signalingState !== 'stable') return;
        await p.pc.setLocalDescription(await p.pc.createOffer({ iceRestart: restart }));
        if (this.peerValid(s, p)) await this.signal(s, p, { type: 'description',
            description: { type: 'offer', sdp: p.pc.localDescription.sdp } });
    }
    async receive(s, p, signal) {
        if (!signal || !this.peerValid(s, p)) return;
        if (signal.type === 'restart' && s.role === 'host') {
            this.deadline(s, p); return this.offer(s, p, true);
        }
        if (signal.type === 'ice') {
            const candidate = signal.candidate || null;
            if (!p.pc.remoteDescription) {
                if (p.candidates.length >= 512) throw new Error('Too many pending video candidates.');
                p.candidates.push(candidate);
            } else await addIce(p.pc, candidate);
            return;
        }
        const desc = signal.description;
        if (signal.type !== 'description' || !desc || typeof desc.sdp !== 'string' || desc.sdp.length > 50000) return;
        if (desc.type !== (s.role === 'host' ? 'answer' : 'offer')) return;
        if (desc.type === 'answer' && p.pc.signalingState === 'stable') return;
        if (desc.type === 'offer' && p.pc.signalingState !== 'stable') return;
        await p.pc.setRemoteDescription({ type: desc.type, sdp: desc.sdp });
        if (!this.peerValid(s, p)) return;
        for (const candidate of p.candidates.splice(0)) await addIce(p.pc, candidate);
        if (desc.type === 'offer') {
            await p.pc.setLocalDescription(await p.pc.createAnswer());
            if (this.peerValid(s, p)) await this.signal(s, p, { type: 'description',
                description: { type: 'answer', sdp: p.pc.localDescription.sdp } });
        }
        if (this.peerValid(s, p)) void tuneVideoSenders(p.pc, s.options);
    }
    handle(data) {
        if (data?.Action === 'ClosePhone' && (this.session || this.connecting)) { this.leave('Phone closed.'); return; }
        if (data?.Action !== 'KiloLive/Event') return;
        const s = this.session;
        if (!s || data.SessionId !== s.id || data.Token !== s.token) return;
        const payload = data.Data || {};
        switch (data.Kind) {
            case 'ended': this.stop(payload.reason || 'Live ended.', payload.session, { error: !!payload.retryable, retryId: payload.retryable && s.role === 'viewer' ? s.id : null }); return;
            case 'peer-ready':
                if (s.role === 'host') {
                    const peer = this.createPeer(s, payload.source, payload.token);
                    this.queue(s, peer, () => this.offer(s, peer));
                }
                return;
            case 'peer-left': {
                const peer = s.peers.get(payload.source);
                if (peer?.token === payload.token) this.closePeer(s, peer);
                return;
            }
            case 'signal': {
                const peer = s.peers.get(payload.source);
                if (peer?.token === payload.token) this.queue(s, peer, () => this.receive(s, peer, payload.signal));
                return;
            }
            case 'state': this.applyState(s, payload); break;
            case 'summary': s.info = { ...s.info, ...payload }; break;
            case 'reaction': s.info.likes = payload.likes; break;
            case 'comment':
                if (!s.comments.some(comment => comment.id === payload.id)) {
                    s.comments.push(payload);
                    s.comments = s.comments.slice(-s.options.commentHistory);
                }
                s.sequence = Math.max(s.sequence, payload.id); break;
            case 'gift': s.lastGift = payload; s.giftSequence = (s.giftSequence || 0) + 1; break;
            default: return;
        }
        this.changed();
    }
    applyState(s, state) {
        if ((state.sequence ?? 0) < s.sequence) return;
        s.sequence = state.sequence ?? 0;
        s.info = { ...s.info, ...state.session };
        s.comments = state.comments || []; s.people = state.people || [];
        s.pinned = state.pinned || null; s.muted = !!state.muted;
    }
    async flip() {
        const s = this.session;
        if (s?.role !== 'host') return;
        const result = await this.action('FlipCamera');
        if (this.valid(s)) { s.front = result.Front; this.changed(); }
    }
    async muteMicrophone() {
        const s = this.session;
        if (!s?.mic || s.role !== 'host') return;
        s.micEnabled = !s.micEnabled;
        for (const track of s.mic.getAudioTracks()) track.enabled = s.micEnabled;
        this.changed();
        try { await this.action('Moderate', { Mode: 'audio', Enabled: s.micEnabled }); }
        catch (error) { if (this.valid(s)) { s.notice = error.message; this.changed(); } }
    }
    closePeer(s, p) {
        p.closed = true;
        clearTimeout(p.deadline); clearTimeout(p.restartTimer);
        p.pc.ontrack = p.pc.onicecandidate = p.pc.onconnectionstatechange = p.pc.oniceconnectionstatechange = null;
        try { p.pc.close(); } catch { /* Already disposed by the browser. */ }
        if (s.peers.get(p.source) === p) s.peers.delete(p.source);
    }
    peerFailed(s, p, error) {
        if (!this.peerValid(s, p)) return;
        console.warn('[KiloGram Live] Peer connection stopped:', error?.name || 'Error', error?.message || 'Unknown error');
        this.closePeer(s, p);
        if (s.role === 'viewer') this.fail(s, error);
        else {
            this.action('DropPeer', { Peer: p.source, PeerToken: p.token, Reason: /relay|TURN|connect/i.test(error?.message || '') ? 'relay' : 'negotiation' }).catch(() => {});
            s.notice = 'One viewer could not connect. Your broadcast is still live.'; this.changed();
        }
    }
    fail(s, error) {
        if (!this.valid(s)) return;
        this.leave(error?.message || 'Live connection failed.', { error: true, retryId: s.role === 'viewer' ? s.id : null });
    }
    leave(reason = 'You left the live.', details = {}) {
        const s = this.session;
        this.stop(reason, undefined, details);
        if (!s) return this.leaving || Promise.resolve();
        const request = this.rpc('Leave', this.data(s)).catch(() => {});
        const cleanup = request.finally(() => { if (this.leaving === cleanup) this.leaving = null; });
        this.leaving = cleanup;
        return cleanup;
    }
    stop(reason, summary, details = {}) {
        const s = this.session;
        ++this.generation; this.session = null; this.connecting = false;
        if (s) {
            clearInterval(s.heartbeat);
            for (const peer of [...s.peers.values()]) this.closePeer(s, peer);
            try { s.capture?.stop(); } catch { /* Always release the remaining media. */ }
            for (const stream of [s.local, s.remote, s.mic]) for (const track of stream?.getTracks() || []) {
                try { track.stop(); } catch { /* Track may have ended with its device. */ }
            }
        }
        this.ended = reason ? { reason, session: summary || s?.info, role: s?.role, ...details } : null;
        this.changed();
    }
    destroy() {
        this.leave('Phone closed.');
        window.removeEventListener('message', this.onMessage);
        window.removeEventListener('beforeunload', this.onUnload);
    }
}
