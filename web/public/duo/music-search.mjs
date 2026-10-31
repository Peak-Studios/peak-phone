/** Catalog matching only. This module never fetches or extracts audio. */
export const MAX_QUERY_LENGTH = 120;
export const MIN_QUERY_LENGTH = 2;
const videoID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeID(value) {
  if (typeof value !== 'string') return null;
  if (videoID.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const id = host === 'youtu.be' ? url.pathname.slice(1).split('/')[0]
      : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
        ? (url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts)\//.test(url.pathname) ? url.pathname.split('/')[2] : '') : '';
    return videoID.test(id || '') ? id : null;
  } catch { return null; }
}

export function decodeTitle(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, entity) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? all;
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
  }).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

export function normalizeMusicText(value) {
  return decodeTitle(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    // Stylized letters inside a word, e.g. FE!N; standalone punctuation stays punctuation.
    .replace(/(\p{L})!(?=\p{L})/gu, '$1i')
    .replace(/['’`]/g, '').replace(/(\p{L})(\p{N})/gu, '$1 $2').replace(/(\p{N})(\p{L})/gu, '$1 $2').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}
function similarity(a, b) {
  if (a === b) return 1;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 2) return 0;
  const d = distance(a, b);
  return d <= 2 ? 1 - d / Math.max(a.length, b.length) : 0;
}

export function audiusID(value) {
  if (typeof value !== 'string') return null;
  if (/^[A-Za-z0-9]{1,32}$/.test(value)) return value;
  try { const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='api.audius.co'||url.port||url.username||url.password)return null;
    return /^\/v1\/tracks\/([A-Za-z0-9]{1,32})\/stream$/.exec(url.pathname)?.[1]||null;
  } catch { return null; }
}
export function normalizeTrack(value) {
  if (!value || value.provider!=='audius' || value.verified!==true) return null;
  const id=audiusID(value.providerId||value.id||value.url);if(!id)return null;
  const title=[...decodeTitle(value.title)].slice(0,255).join('');if(!title)return null;
  const channel=[...decodeTitle(value.channel||value.artist)].slice(0,160).join('');if(!channel)return null;
  let art='';try{const u=new URL(value.artwork);if(u.protocol==='https:'&&!u.username&&!u.password)art=u.href;}catch{}
  return {id,providerId:id,provider:'audius',verified:true,title,channel,url:`https://api.audius.co/v1/tracks/${id}/stream?app_name=PeakMusic`,artwork:art,duration:Math.max(0,Math.min(86400,Number(value.duration)||0))};
}

/** Relevance and close spelling dominate. Popularity is intentionally not a score:
 * an unrelated popular upload must never outrank the requested numbered song. */
export function rankTracks(query, rows) {
  const q = normalizeMusicText(query), tokens = q.split(' ').filter(Boolean);
  if (!q || !Array.isArray(rows)) return [];
  const variants = ['remix', 'cover', 'slowed', 'sped', 'instrumental', 'karaoke', 'reaction', 'tutorial', 'live'];
  const seen = new Set();
  return rows.slice(0, 50).map((raw, index) => {
    const track = normalizeTrack(raw);
    if (!track || seen.has(track.id)) return null;
    seen.add(track.id);
    const title = normalizeMusicText(track.title), channel = normalizeMusicText(track.channel);
    const words = (title + ' ' + channel).split(' ').filter(Boolean);
    let score = tokens.reduce((total, token) => total + Math.max(0, ...words.map(w => similarity(token, w))), 0) / tokens.length * 100;
    const compact = title.replaceAll(' ', ''), compactQuery = q.replaceAll(' ', '');
    if (title === q) score += 25;
    else if (compact.includes(compactQuery)) score += 15;
    // Keep issue/episode/track numbers exact, even when the rest is a near match.
    for (const token of tokens) if (/^\d+$/.test(token) && !words.includes(token)) score -= 100;
    for (const version of variants) if (words.includes(version) && !tokens.includes(version)) score -= 25;
    const artist = normalizeMusicText(track.title.split(/\s[-–—]\s/)[0]);
    if (artist && artist !== title && (channel.includes(artist) || artist.includes(channel) && channel.length > 2)) score += 8;
    score += Math.max(0, 6 - index * .2); // Provider relevance breaks otherwise similar matches.
    return { track, score, index };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.track);
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Debounced, latest-query-only requests. Re-rendering the view never re-queries. */
export class MusicSearch {
  constructor({ send, changed = () => {}, delay = 650 }) {
    this.send = send; this.changed = changed; this.delay = delay;
    this.generation = 0; this.destroyed = false;
    this.state = { query: '', loading: false, tracks: [], error: '', searched: false };
  }
  setQuery(value) {
    if (this.destroyed) return;
    clearTimeout(this.timer); ++this.generation;
    const query = String(value ?? '').trim().replace(/\s+/g, ' ');
    const count = [...query].length;
    this.state = { query, loading: false, tracks: [], error: '', searched: false };
    if (count > MAX_QUERY_LENGTH) this.state.error = `Use at most ${MAX_QUERY_LENGTH} characters.`;
    else if (count >= MIN_QUERY_LENGTH) {
      this.state.loading = true;
      this.timer = setTimeout(() => this.submit(), this.delay);
    }
    this.changed(this.state);
  }
  async submit() {
    if (this.destroyed) return;
    clearTimeout(this.timer);
    const query = this.state.query;
    if ([...query].length < MIN_QUERY_LENGTH || [...query].length > MAX_QUERY_LENGTH) return;
    const generation = ++this.generation;
    this.state = { ...this.state, loading: true, error: '', searched: false };
    this.changed(this.state);
    try {
      const response = await this.send('Peakify/Search', { Query: query });
      if (this.destroyed || generation !== this.generation) return;
      if (response?.Success !== true) throw Error(response?.Message || response?.error || 'Music search is unavailable. Try again shortly.');
      const rows = Array.isArray(response.Tracks) ? response.Tracks : response.Tracks && typeof response.Tracks === 'object' && Object.keys(response.Tracks).length === 0 ? [] : null;
      if (!rows) throw Error('The music catalog returned invalid results.');
      this.state = { query, loading: false, tracks: rankTracks(query, rows), error: '', searched: true };
    } catch (error) {
      if (this.destroyed || generation !== this.generation) return;
      this.state = { query, loading: false, tracks: [], error: error.message || 'Music search failed.', searched: true };
    }
    this.changed(this.state);
  }
  destroy() { this.destroyed = true; ++this.generation; clearTimeout(this.timer); }
}

/** Existing SaveTrack uses a 255-byte limit. Never split a multibyte character. */
export function savedTitle(value) {
  let result = '', size = 0; const encoder = new TextEncoder();
  for (const char of String(value || '')) {
    size += encoder.encode(char).length; if (size > 255) break; result += char;
  }
  return result;
}
