/** Compatibility helpers shared ONLY by the live/call transports. Never relax relay policy. */
export function isNuiMessage(event, host = globalThis.window) {
    // SendNUIMessage has a null source on some CEF builds. Session/peer tokens are
    // still checked by each consumer and server; arbitrary sibling frames are rejected.
    return !event.source || event.source === host || event.source === host?.parent;
}
export function connectionStatus(pc) {
    const state = pc.connectionState;
    // Prefer aggregate DTLS/ICE state when implemented; ICE can be connected
    // while DTLS has failed. Fall back only for CEF builds without this API.
    if (['connected','failed','disconnected','closed'].includes(state)) return state;
    if (state) return 'connecting';
    const ice = pc.iceConnectionState;
    if (ice === 'connected' || ice === 'completed') return 'connected';
    if (['failed','disconnected','closed'].includes(ice)) return ice;
    return 'connecting';
}
/** Older CEF versions expose no encodings until SDP is installed. Changing their
 * count is illegal. Bitrate/fps hints must NEVER prevent SDP or end a working call. */
export async function tuneVideoSenders(pc, { bitrate = 800000, fps = 20 } = {}) {
    const results = [];
    for (const sender of pc.getSenders?.() || []) {
        if (sender.track?.kind !== 'video' || !sender.getParameters || !sender.setParameters) continue;
        try {
            const parameters = sender.getParameters();
            if (!parameters.encodings?.length) { results.push('deferred'); continue; }
            for (const encoding of parameters.encodings) {
                encoding.maxBitrate = Math.max(100000, Math.min(3000000, Number(bitrate) || 800000));
                encoding.maxFramerate = Math.max(5, Math.min(30, Number(fps) || 20));
            }
            await sender.setParameters(parameters);
            results.push('applied');
        } catch (error) { results.push(error?.name || 'unsupported'); }
    }
    return results;
}
export async function addIce(pc, candidate) {
    // End-of-candidates is advisory. Old CEFs reject addIceCandidate(null), while
    // actual (nonempty) invalid candidates must still surface as real errors.
    if (!candidate || candidate.candidate === '') return;
    await pc.addIceCandidate(candidate);
}
export function mediaError(error, stage = 'Video') {
    const text = error?.message || String(error || 'Unknown media error');
    if (error?.name === 'NotAllowedError') return 'Microphone permission was denied. Use game-voice audio or allow the microphone.';
    if (error?.name === 'NotSupportedError') return `${stage} is not supported by this FiveM browser. Update the FiveM client.`;
    return text;
}
