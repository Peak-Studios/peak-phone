import { youtubeID } from './music-search.mjs';
import { phoneMedia } from './media-output.mjs';

let apiPromise;
function loadAPI() {
  if (globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = globalThis.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    let timer;
    const finish = error => {
      clearTimeout(timer);
      if (globalThis.onYouTubeIframeAPIReady === ready) globalThis.onYouTubeIframeAPIReady = previous;
      script.onerror = null;
      if (error) { script.remove(); apiPromise = null; reject(error); }
      else resolve(globalThis.YT);
    };
    const ready = () => {
      try { previous?.(); } finally {
        finish(globalThis.YT?.Player ? null : Error('YouTube did not initialize its player.'));
      }
    };
    globalThis.onYouTubeIframeAPIReady = ready;
    script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.onerror = () => finish(Error('Could not load YouTube. Check the connection and try again.'));
    timer = setTimeout(() => finish(Error('YouTube player loading timed out. Try again.')), 12000);
    document.head.append(script);
  });
  return apiPromise;
}
const errors = {
  2: 'This video ID is invalid. Search again.',
  5: 'This FiveM browser cannot play this video format.',
  100: 'This video is unavailable or private. Choose another result.',
  101: 'The owner does not allow embedded playback. Choose another result.',
  150: 'The owner does not allow embedded playback. Choose another result.',
  153: 'YouTube could not identify this FiveM browser (153). The server owner must check the NUI origin and referrer; audio extraction is not a fallback.'
};

/** A visible, official player, deliberately separate from world-speaker audio.
 * No stream extraction, hidden playback, autoplay queue, or provider-control overlays. */
export class YouTubeMusicPlayer {
  constructor({ host, track, visible = () => true, status = () => {}, media = phoneMedia }) {
    this.host = host; this.track = track; this.visible = visible; this.status = status; this.media = media;
    this.destroyed = false; this.ready = false; this.playing = false;
    this.changed = () => { this.applyVolume(); this.enforceVisibility(); };
    media.addEventListener('change', this.changed);
    document.addEventListener('visibilitychange', this.changed);
    this.observer = new MutationObserver(() => this.enforceVisibility());
    // Observe ancestors only: status text/player mutations must not trigger feedback loops.
    for (let node = host; node; node = node.parentElement) this.observer.observe(node, {
      attributes: true, attributeFilter: ['hidden', 'inert', 'style', 'class', 'data-visible', 'data-home', 'data-powered']
    });
    this.check = setInterval(() => this.enforceVisibility(), 200);
    this.open();
  }
  isVisible() {
    if (this.destroyed || !this.media.powered || document.hidden || !this.host.isConnected || !this.visible()) return false;
    if (this.host.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    for (let node = this.host; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    const frame = this.frame, rect = frame?.getBoundingClientRect();
    if (!rect || rect.width < 200 || rect.height < 200) return false;
    // All four inset corners must be visible, not clipped by a sheet or obscured by an overlay.
    return [[rect.left + 2, rect.top + 2], [rect.right - 2, rect.top + 2],
      [rect.left + 2, rect.bottom - 2], [rect.right - 2, rect.bottom - 2]].every(([x, y]) => {
      const top = document.elementFromPoint(x, y);
      return top === frame || frame.contains(top);
    });
  }
  async open() {
    const id = youtubeID(this.track.providerId || this.track.url || this.track.id);
    if (!id) { this.status('This song has an invalid YouTube ID.', true); return; }
    this.status('Loading YouTube player…');
    try {
      const YT = await loadAPI();
      if (this.destroyed) return;
      const frame = document.createElement('iframe'); this.frame = frame;
      frame.title = this.track.title || 'YouTube music player';
      frame.width = '100%'; frame.height = '220'; frame.className = 'pm-youtube-frame';
      frame.allow = 'autoplay; encrypted-media';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      const params = new URLSearchParams({ enablejsapi: '1', origin: location.origin, playsinline: '1', controls: '1', autoplay: '0', fs: '0' });
      frame.src = `https://www.youtube.com/embed/${id}?${params}`;
      this.host.replaceChildren(frame);
      this.player = new YT.Player(frame, { events: {
        onReady: event => {
          if (this.destroyed) { event.target.destroy(); return; }
          this.player = event.target; this.ready = true; clearTimeout(this.readyTimer); this.applyVolume();
          this.status('Ready. Use the YouTube play button. Keep the player visible.');
          // Starting in the native player preserves user activation and avoids autoplay races.
          this.enforceVisibility();
        },
        onStateChange: event => {
          if (this.destroyed) return;
          this.playing = event.data === 1;
          if (this.playing && !this.isVisible()) { this.enforceVisibility(); return; }
          if (event.data === 1) this.status('Playing on this phone · YouTube');
          else if (event.data === 2) this.status('Paused · YouTube');
          else if (event.data === 0) this.status('Finished · YouTube');
        },
        onError: event => { if (!this.destroyed) { clearTimeout(this.readyTimer); this.playing = false; this.status(errors[event.data] || 'YouTube playback failed. Choose another result.', true); } },
        onAutoplayBlocked: () => { if (!this.destroyed) this.status('Playback was blocked. Press play inside the YouTube player.'); }
      } });
      this.readyTimer = setTimeout(() => { if (!this.destroyed && !this.ready) this.status('The embedded player did not respond. Check the connection or NUI referrer configuration.', true); }, 15000);
    } catch (error) { if (!this.destroyed) this.status(error.message || 'YouTube could not be opened.', true); }
  }
  applyVolume() {
    if (!this.ready || this.destroyed) return;
    this.player.setVolume(Math.round((this.media.powered ? this.media.volume : 0) * 100));
  }
  enforceVisibility() {
    if (this.destroyed || !this.ready || this.isVisible()) return;
    if (this.playing || this.player.getPlayerState?.() === 1 || this.player.getPlayerState?.() === 3) {
      this.playing = false; this.player.pauseVideo();
      this.status('Paused. Keep the full player visible to listen.');
    }
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; clearInterval(this.check); clearTimeout(this.readyTimer);
    this.observer.disconnect(); this.media.removeEventListener('change', this.changed);
    document.removeEventListener('visibilitychange', this.changed);
    try { this.player?.destroy(); } finally { this.host.replaceChildren(); }
  }
}
