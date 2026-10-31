import { KilogramApp as OriginalKilogram } from './community-apps.mjs?rev=owner-config-20261015';
import { el, avatar, field, rows, nonce, relativeTime, safeImage } from './glass-kit.mjs?rev=owner-config-20261015';
import { icon } from './icons.mjs?rev=owner-config-20261015';
import { KilogramLive } from './kilogram-live.mjs';
import { createFrostedSurface } from './frosted-surface.mjs';

const paths = {
    send: '<path d="m21 3-7 18-4-8-8-4 19-6Z"/><path d="m10 13 11-10"/>',
    live: '<circle cx="12" cy="12" r="2"/><path d="M7.1 7.1a7 7 0 0 0 0 9.8m9.8-9.8a7 7 0 0 1 0 9.8M4.3 4.3a11 11 0 0 0 0 15.4m15.4-15.4a11 11 0 0 1 0 15.4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
    'mic-off': '<path d="m2 2 20 20M9 9v3a3 3 0 0 0 5 2M9 5V4a3 3 0 0 1 6 0v7M5 10v2a7 7 0 0 0 12 5m2-5v-2m-7 9v3m-4 0h8"/>',
    flip: '<path d="M3 10a9 9 0 0 1 16-5l2 3m0-6v6h-6M21 14a9 9 0 0 1-16 5l-2-3m0 6v-6h6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    pin: '<path d="m8 3 8 0-1 6 4 4v2H5v-2l4-4-1-6Zm4 12v7"/>',
    mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>',
    'message-circle': '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/>',
    'id-card': '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.8-2 5.2-2 6 0m3-6h3m-3 4h3"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-4 5h1"/>',
    gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8H7.5a2.5 2.5 0 1 1 2.5-2.5V8Zm0 0h4.5a2.5 2.5 0 1 0-2.5-2.5V8Z"/>'
};
function glyph(name) {
    if (!paths[name]) return icon(name);
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
}
const formatCount = value => new Intl.NumberFormat(undefined, { notation: Number(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(Number(value) || 0);
const liveLink = id => 'kilogram://live/' + id;
const bytes = text => new TextEncoder().encode(text).length;

/** KiloGram-only presentation layer. The original social data model and Binge remain intact. */
export class KilogramApp extends OriginalKilogram {
    constructor(options) {
        super(options);
        this.element.classList.add('kg-app');
        this.live = new KilogramLive({ send: this.send });
        this.liveChanged = () => { if (this.liveScreen) this.updateLive(); };
        this.live.addEventListener('change', this.liveChanged);
        this.messages(data => {
            if (data.Action === 'KiloLive/Directory' && !this.liveScreen) {
                clearTimeout(this.directoryTimer);
                this.directoryTimer = setTimeout(() => this.refreshDirectory(), 750);
            }
        });
        this.liveClock = setInterval(() => {
            if (this.liveScreen && this.liveUI && this.live.session) this.updateLiveClock();
        }, 1000);
    }
    frame(title, subtitle = '', actions = []) {
        this.dockBlur?.destroy();
        this.element.classList.add('kg-app');
        return super.frame(title, subtitle, actions);
    }
    control(label, name, callback, className = '') {
        const button = this.button(label, '', callback, 'kg-icon ' + className);
        button.innerHTML = glyph(name); // Only local, constant SVG paths; never user HTML.
        button.title = label;
        return button;
    }
    navigate(nav) {
        if (this.liveScreen && (this.live.session || this.live.connecting)) return this.askLeave(() => this.navigate(nav));
        this.liveScreen = false; this.liveUI = null;
        this.nav = nav; this.viewQuery = ''; this.loadView();
    }
    scaffold(title, subtitle = '', actions = []) {
        this.dockBlur?.destroy();
        this.currentChat = null; this.clearMedia(); this.closeSheet();
        this.element.classList.add('kg-app');
        this.element.dataset.view = this.nav;
        this.element.replaceChildren();
        const header = el('header', 'nx-header kg-header');
        if (title === 'KiloGram') {
            const brand = this.surfaceButton('Choose feed', () => this.feedMenu(), 'kg-brand');
            brand.append(el('span', '', 'KiloGram'));
            const chevron = el('span', 'kg-small-icon'); chevron.innerHTML = glyph('chevron'); brand.append(chevron);
            header.append(brand);
        } else header.append(el('h1', 'kg-title', title));
        const tools = el('div', 'kg-header-tools');
        tools.append(...actions); header.append(tools);
        const body = el('main', 'gx-body gx-community-body kg-body');
        this.body = body;
        const bottom = el('nav', 'kg-nav'); bottom.setAttribute('aria-label', 'KiloGram navigation');
        for (const [key, label, name] of [['home', 'Home', 'home'], ['reels', 'Reels', 'video'], ['inbox', 'Messages', 'send'], ['search', 'Explore', 'search'], ['me', 'Your profile', 'id-card']]) {
            const button = this.control(label, name, () => key === 'create' ? this.createMenu() : this.navigate(key), key === 'create' ? 'kg-create-tab' : '');
            if (key === this.nav) button.setAttribute('aria-current', 'page');
            if (key === 'me' && this.me) { button.replaceChildren(avatar(this.me.name, this.me.avatar)); button.classList.add('kg-profile-tab'); }
            bottom.append(button);
        }
        this.element.append(header, body, bottom);
        this.dockBlur = createFrostedSurface({ bar: bottom, source: body });
        return body;
    }
    async loadView() {
        if (this.liveScreen && (this.live?.session || this.live?.connecting)) return;
        this.liveScreen = false; this.liveUI = null;
        return this.guarded(async epoch => {
            if (!this.me) return this.welcome();
            const title = { home: 'KiloGram', search: 'Explore', reels: 'Reels', activity: 'Activity', me: this.me.handle,
                saved: 'Saved', inbox: 'Messages', live: 'Live now' }[this.nav] || 'KiloGram';
            const actions = this.nav === 'home' ? [
                this.control('Create', 'plus', () => this.createMenu()),
                this.control('Live broadcasts', 'live', () => this.navigate('live'), 'kg-live-entry'),
                this.control('Activity', 'heart', () => this.navigate('activity')),
                this.control('Messages', 'send', () => this.navigate('inbox'))
            ] : this.nav === 'me' ? [this.control('Gift wallet', 'wallet', () => this.liveWallet()),
                this.control('Profile settings', 'more', () => this.settings())] : [this.control('Back to feed', 'back', () => this.navigate('home')),
                this.control(this.nav === 'me' ? 'Profile settings' : 'Create', this.nav === 'me' ? 'more' : 'plus', () => this.nav === 'me' ? this.settings() : this.createMenu())];
            const body = this.scaffold(title, '', actions);
            if (this.nav === 'home') {
                if (this.following) body.append(el('p', 'kg-feed-label', 'Following'));
                const strip = el('div', 'kg-stories'); strip.setAttribute('aria-label', 'Live broadcasts and stories');
                const own = this.surfaceButton('Add your story', () => this.compose('story'), 'kg-story kg-own-story');
                const ring = el('span', 'kg-story-circle'); ring.append(avatar(this.me.name, this.me.avatar), el('b', 'kg-story-add', '+'));
                own.append(ring, el('span', 'kg-story-label', 'Your story')); strip.append(own);
                this.liveRingHost = el('div', 'kg-live-rings'); strip.append(this.liveRingHost);
                body.append(strip);
                this.storiesInto(strip, epoch).catch(error => { if (this.valid(epoch, strip)) this.status(strip, error.message, 'error'); });
                this.refreshDirectory();
                await this.feedInto(body, { Following: this.following }, epoch);
            } else if (this.nav === 'live') {
                const intro = el('section', 'kg-live-intro');
                const mark = el('div', 'kg-live-mark'); mark.innerHTML = glyph('live');
                intro.append(mark, el('h2', '', 'Your city. Right now.'), el('p', '', 'Drop into a live, say hello, or share your own point of view.'));
                intro.append(this.textButton('Start a live', 'plus', () => this.goLiveSheet(), 'nx-primary kg-go-live'));
                body.append(intro, el('h2', 'kg-section-title', 'On air'));
                this.liveListHost = el('div', 'kg-live-list'); body.append(this.liveListHost);
                this.status(this.liveListHost, 'Looking for live broadcasts…');
                await this.refreshDirectory();
            } else if (this.nav === 'reels') {
                body.classList.add('kg-reels-body'); await this.feedInto(body, { Kind: 'reel' }, epoch);
            } else if (this.nav === 'search') {
                const results = el('div', 'kg-search-results');
                const search = this.search('Search people and handles', value => {
                    this.viewQuery = value; clearTimeout(this.searchTimer);
                    this.searchTimer = setTimeout(() => this.peopleInto(results, epoch), 250);
                }, this.viewQuery || '');
                body.append(search, el('h2', 'kg-section-title', 'People in your city'), results);
                await this.peopleInto(results, epoch);
                if (this.valid(epoch, body)) {
                    body.append(el('h2', 'kg-section-title', 'Explore moments'));
                    await this.exploreGrid(body, epoch);
                }
            } else if (this.nav === 'activity') await this.activityInto(body, epoch);
            else if (this.nav === 'inbox') await this.conversations(body, epoch);
            else if (this.nav === 'saved') await this.feedInto(body, { Saved: true }, epoch);
            else if (this.nav === 'me') {
                const result = await this.rpc('GetProfile');
                if (!this.valid(epoch, body)) return;
                this.me = result.profile; this.profileHero(this.me, body, true);
                await this.profilePosts(this.me, body, epoch);
            }
        });
    }
    feedMenu() {
        const panel = this.openSheet('Your feed');
        for (const [following, label, name] of [[false, 'For you', 'globe'], [true, 'Following', 'users']]) {
            const button = this.textButton(label, name, () => { this.following = following; this.navigate('home'); }, 'gx-list-button');
            button.setAttribute('aria-pressed', String(this.following === following)); panel.append(button);
        }
        panel.append(this.textButton('Saved posts', 'bookmark', () => this.navigate('saved'), 'gx-list-button'));
    }
    createMenu() {
        const panel = this.openSheet('Create something');
        panel.append(el('p', 'kg-sheet-copy', 'A little moment. A new story. A live connection.'));
        for (const [label, subtitle, name, fn] of [
            ['Post', 'Photos from your city', 'image', () => this.compose('image')],
            ['Story', 'A moment that lasts 24 hours', 'plus', () => this.compose('story')],
            ['Reel', 'Share a video from your gallery or a supported URL', 'video', () => this.compose('reel')],
            ['Go live', 'Broadcast your in-game camera', 'live', () => this.goLiveSheet()]
        ]) {
            const button = this.surfaceButton(label, fn, 'kg-create-option');
            const symbol = el('span', 'kg-option-icon'); symbol.innerHTML = glyph(name);
            const copy = el('span'); copy.append(el('strong', '', label), el('small', '', subtitle)); button.append(symbol, copy); panel.append(button);
        }
    }
    settings() {
        super.settings();
        this.sheet.panel.append(this.textButton('Story archive', 'history', () => this.storyArchive(), 'gx-list-button'));
    }
    async conversations(body, epoch) {
        const heading = el('div', 'kg-inbox-heading'); heading.append(el('h2', '', 'Messages'), this.control('New message', 'edit', () => this.newMessage()));
        const search = this.search('Search messages', query => {
            for (const row of body.querySelectorAll('.gx-conversation-list>.gx-person')) row.hidden = !row.textContent.toLowerCase().includes(query.toLowerCase());
        });
        body.append(search, heading); await super.conversations(body, epoch);
    }
    newMessage() {
        const panel = this.openSheet('New message'); const list = el('div');
        const epoch = this.readEpoch;
        panel.append(this.search('Search people', query => { this.viewQuery = query; clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.peopleInto(list, epoch), 250); }), list);
        this.viewQuery = ''; this.peopleInto(list, epoch);
    }
    profileHero(person, body, own = false) {
        const hero = el('section', 'kg-profile-hero');
        const top = el('div', 'kg-profile-top');
        const photo = this.surfaceButton(own ? 'Add your story' : 'Profile photo', () => own ? this.compose('story') : this.showProfile(person.id), 'kg-profile-photo');
        photo.append(avatar(person.name, person.avatar));
        if (own) photo.append(el('span', 'kg-story-add', '+'));
        const identity = el('div', 'kg-profile-identity'); identity.append(el('h2', '', person.name), el('p', 'kg-profile-handle', '@' + person.handle));
        const stats = el('div', 'kg-profile-stats');
        for (const [count, label] of [[person.posts, 'posts'], [person.followers, 'followers'], [person.following, 'following']]) {
            const stat = el('span'); stat.append(el('strong', '', formatCount(count)), el('small', '', label)); stats.append(stat);
        }
        identity.append(stats); top.append(photo, identity); hero.append(top);
        if (person.bio) hero.append(el('p', 'kg-profile-bio', person.bio));
        const actions = el('div', 'kg-profile-actions');
        if (own) actions.append(this.textButton('Edit profile', '', () => this.editProfile()), this.textButton('Share profile', '', () => this.copy('KiloGram · @' + person.handle)), this.control('Create', 'plus', () => this.createMenu()));
        else {
            const follow = this.textButton(person.followed ? 'Following' : 'Follow', '', () => this.submit(follow, async () => {
                await this.rpc('SetFollow', { Id: person.id, Enabled: !person.followed }); await this.showProfile(person.id);
            }, hero), person.followed ? '' : 'nx-primary'); actions.append(follow);
            if (person.can_message) actions.append(this.textButton('Message', '', () => this.chat(person)));
            actions.append(this.control('Profile options', 'more', () => this.personMenu(person)));
        }
        hero.append(actions); body.append(hero);
        const highlights = el('div', 'kg-highlights'); highlights.setAttribute('aria-label', 'Story highlights'); body.append(highlights);
        this.highlightsInto(highlights, person, own, this.readEpoch);
    }
    async highlightsInto(host, person, own, epoch) {
        try {
            const result = await this.rpc('GetHighlights', { ProfileId: person.id });
            if (!this.valid(epoch, host)) return;
            if (own) {
                const add = this.surfaceButton('New highlight', () => this.editHighlight(), 'kg-highlight');
                const circle = el('span', 'kg-highlight-circle'); circle.innerHTML = glyph('plus'); add.append(circle, el('span', '', 'New')); host.append(add);
            }
            for (const highlight of rows(result.highlights)) {
                const button = this.surfaceButton('Open highlight ' + highlight.title, () => this.highlightMenu(highlight), 'kg-highlight');
                const circle = el('span', 'kg-highlight-circle'); const media = rows(highlight.posts[0]?.media)[0];
                if (media?.type === 'image' && safeImage(media.url)) { const img = el('img'); img.src = safeImage(media.url); img.alt = ''; img.referrerPolicy = 'no-referrer'; circle.append(img); }
                else circle.innerHTML = glyph('image');
                button.append(circle, el('span', '', highlight.title)); host.append(button);
            }
        } catch (error) { if (this.valid(epoch, host)) this.status(host, error.message, 'error'); }
    }
    highlightMenu(highlight) {
        if (!highlight.own) return this.story(highlight.posts);
        const panel = this.openSheet(highlight.title);
        panel.append(this.textButton('View highlight', 'play', () => this.story(highlight.posts), 'gx-list-button'),
            this.textButton('Edit highlight', 'edit', () => this.editHighlight(highlight), 'gx-list-button'),
            this.textButton('Delete highlight', 'trash', () => this.confirm('Delete highlight?', 'The stories remain in your private archive.', 'Delete highlight', async () => {
                await this.rpc('DeleteHighlight', { Id: highlight.id }); this.navigate('me');
            }, true), 'gx-danger'));
    }
    async editHighlight(highlight = null) {
        const panel = this.openSheet(highlight?.id ? 'Edit highlight' : 'New highlight');
        const title = field('Highlight name', { value: highlight?.title || '', maxLength: 48, placeholder: 'Favourite moments' });
        const chosen = new Map(rows(highlight?.posts).map(post => [post.id, post]));
        const note = el('p', 'kg-sheet-copy', 'Choose stories from your archive. The first selected story is the cover.');
        const count = el('p', 'kg-selection-count'); const grid = el('div', 'kg-archive-grid');
        const update = () => { count.textContent = chosen.size + ' / 50 selected'; };
        panel.append(title.wrapper, note, count, grid); update();
        const save = this.textButton('Save highlight', 'check', () => this.submit(save, async () => {
            if (!title.input.value.trim() || !chosen.size) throw Error('Enter a name and choose at least one story.');
            await this.rpc('SaveHighlight', { ...(highlight?.id ? { Id: highlight.id } : {}), Title: title.input.value.trim(), StoryIds: [...chosen.keys()] });
            this.navigate('me');
        }, panel), 'nx-primary'); panel.append(save);
        const load = async before => {
            const result = await this.rpc('GetStoryArchive', { Before: before });
            if (this.sheet?.panel !== panel) return;
            grid.querySelector('.gx-load-more')?.remove();
            if (!result.posts?.length && !before) grid.append(el('p', 'kg-sheet-copy', 'Share a story first. Your stories will stay here after they expire.'));
            for (const post of rows(result.posts)) {
                const button = this.archiveTile(post, () => {
                    if (chosen.has(post.id)) chosen.delete(post.id);
                    else if (chosen.size < 50) chosen.set(post.id, post);
                    else { this.notify('Choose up to 50 stories.'); return; }
                    button.setAttribute('aria-pressed', String(chosen.has(post.id))); update();
                }); button.setAttribute('aria-pressed', String(chosen.has(post.id))); grid.append(button);
            }
            if (result.next) { const more = this.textButton('Older stories', 'chevron', () => this.submit(more, () => load(result.next), panel), 'gx-load-more'); grid.append(more); }
        };
        try { await load(); } catch (error) { if (this.sheet?.panel === panel) this.status(panel, error.message, 'error'); }
    }
    archiveTile(post, callback) {
        const button = this.surfaceButton('Story from ' + new Date(post.created_at).toLocaleDateString(), callback, 'kg-archive-tile');
        const media = rows(post.media)[0];
        if (media?.type === 'image' && safeImage(media.url)) { const img = el('img'); img.src = safeImage(media.url); img.alt = post.caption || 'Archived story'; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy'; button.append(img); }
        else { const symbol = el('span'); symbol.innerHTML = glyph('video'); button.append(symbol); }
        button.append(el('small', '', new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))); return button;
    }
    async storyArchive() {
        const panel = this.openSheet('Story archive'); const grid = el('div', 'kg-archive-grid');
        panel.append(el('p', 'kg-sheet-copy', 'Only you can see these stories. Add them to a highlight to share them on your profile.'), this.textButton('New highlight', 'plus', () => this.editHighlight(), 'nx-primary'), grid);
        const posts = [];
        const load = async before => {
            const result = await this.rpc('GetStoryArchive', { Before: before }); if (this.sheet?.panel !== panel) return;
            grid.querySelector('.gx-load-more')?.remove();
            for (const post of rows(result.posts)) { post.archive = true; const index = posts.length; posts.push(post); grid.append(this.archiveTile(post, () => this.story(posts, index))); }
            if (!posts.length) grid.append(el('p', 'kg-sheet-copy', 'Your shared stories will appear here.'));
            if (result.next) { const more = this.textButton('Older stories', 'chevron', () => this.submit(more, () => load(result.next), panel), 'gx-load-more'); grid.append(more); }
        };
        try { await load(); } catch (error) { if (this.sheet?.panel === panel) this.status(panel, error.message, 'error'); }
    }
    async showProfile(id) {
        this.closeSheet(); const epoch = ++this.readEpoch;
        const body = this.scaffold('Profile', '', [this.control('Back', 'back', () => this.loadView()), this.control('Create', 'plus', () => this.createMenu())]);
        try { const result = await this.rpc('GetProfile', { Id: id }); if (!this.valid(epoch, body)) return;
            this.element.querySelector('.kg-title').textContent = result.profile.handle;
            this.profileHero(result.profile, body, result.profile.id === this.me.id); await this.profilePosts(result.profile, body, epoch);
        } catch (error) { if (this.valid(epoch, body)) this.status(body, error.message, 'error'); }
    }
    async profilePosts(person, body, epoch) {
        const tabs = el('div', 'kg-profile-tabs'); const host = el('div', 'kg-profile-content'); body.append(tabs, host);
        const buttons = [];
        const show = async kind => {
            const sequence = this.profileGridSequence = (this.profileGridSequence || 0) + 1;
            host.replaceChildren(); buttons.forEach(([key, button]) => button.setAttribute('aria-selected', String(key === kind)));
            await this.exploreGrid(host, epoch, { ProfileId: person.id, ...(kind === 'reel' ? { Kind: 'reel' } : {}) }, sequence);
        };
        tabs.setAttribute('role', 'tablist');
        for (const [kind, label, symbol] of [['all', 'Posts', 'grid'], ['reel', 'Reels', 'video']]) {
            const button = this.control(label, symbol, () => show(kind)); button.setAttribute('role', 'tab'); buttons.push([kind, button]); tabs.append(button);
        }
        await show('all');
    }
    postCard(post) {
        const card = el('article', 'gx-post kg-post'); card.dataset.postId = post.id;
        const header = el('header', 'kg-post-header');
        const person = this.surfaceButton('View ' + post.author.name, () => this.showProfile(post.author.id), 'kg-author');
        const name = el('span', 'kg-author-copy'); name.append(el('strong', '', post.author.handle), el('small', '', relativeTime(post.created_at)));
        person.append(avatar(post.author.name, post.author.avatar), name);
        header.append(person, this.control('Post options', 'more', () => this.personMenu(post.author, post)));
        const carousel = el('div', 'gx-media-carousel kg-media');
        const media = rows(post.media); carousel.setAttribute('aria-label', 'Post media');
        for (const [index, item] of media.entries()) carousel.append(this.media(item, post.caption || 'Shared media ' + (index + 1)));
        const visual = el('div', 'kg-post-visual'); visual.append(carousel);
        const counter = el('span', 'kg-carousel-count', '1 / ' + media.length);
        const dots = el('div', 'kg-carousel-dots');
        if (media.length > 1) {
            visual.append(counter);
            media.forEach((_, index) => {
                const dot = this.surfaceButton('Show media ' + (index + 1), () => carousel.scrollTo({ left: index * carousel.clientWidth, behavior: 'smooth' }), 'kg-dot');
                dot.setAttribute('aria-pressed', String(index === 0)); dots.append(dot);
            });
            carousel.addEventListener('scroll', () => {
                const index = Math.round(carousel.scrollLeft / Math.max(1, carousel.clientWidth));
                counter.textContent = (index + 1) + ' / ' + media.length;
                [...dots.children].forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === index)));
            }, { passive: true });
        }
        const actions = el('div', 'kg-post-actions');
        const count = el('strong', 'kg-post-count', formatCount(post.likes) + ' likes');
        const like = this.control(post.liked ? 'Unlike' : 'Like', 'heart', () => toggleLike(), 'kg-like');
        like.setAttribute('aria-pressed', String(!!post.liked));
        const toggleLike = () => this.submit(like, async () => {
            const result = await this.rpc('SetLike', { Id: post.id, Enabled: !post.liked });
            post.liked = result.liked; post.likes = result.count;
            like.setAttribute('aria-pressed', String(post.liked)); like.setAttribute('aria-label', post.liked ? 'Unlike' : 'Like');
            count.textContent = formatCount(post.likes) + ' likes';
        }, card);
        carousel.addEventListener('dblclick', event => {
            if (event.target.closest('video') || this.writeBusy) return;
            visual.classList.remove('kg-liked-flash'); void visual.offsetWidth; visual.classList.add('kg-liked-flash');
            if (!post.liked) toggleLike();
        });
        const flash = el('span', 'kg-heart-flash'); flash.innerHTML = glyph('heart'); flash.setAttribute('aria-hidden', 'true'); visual.append(flash);
        const save = this.control(post.saved ? 'Unsave post' : 'Save post', 'bookmark', () => this.submit(save, async () => {
            const result = await this.rpc('SetSave', { Id: post.id, Enabled: !post.saved });
            post.saved = result.saved; save.setAttribute('aria-pressed', String(post.saved));
            save.setAttribute('aria-label', post.saved ? 'Unsave post' : 'Save post');
        }, card), 'kg-save'); save.setAttribute('aria-pressed', String(!!post.saved));
        actions.append(like, this.control('Comments', 'message-circle', () => this.comments(post)),
            this.control('Share post', 'send', () => this.shareSheet({ text: `KiloGram · @${post.author.handle} · post #${post.id}\n${post.caption || ''}`, title: 'Share post' })), dots, save);
        card.append(header, visual, actions, count);
        if (post.caption) {
            const caption = el('p', 'kg-caption'); caption.append(el('strong', '', post.author.handle + ' '), document.createTextNode(post.caption));
            if (post.caption.length > 170) {
                caption.classList.add('kg-caption-collapsed');
                const expand = this.textButton('more', '', () => { caption.classList.remove('kg-caption-collapsed'); expand.remove(); }, 'kg-caption-more');
                card.append(caption, expand);
            } else card.append(caption);
        }
        card.append(this.textButton(post.comments ? 'View all ' + formatCount(post.comments) + ' comments' : 'Be the first to comment…', '', () => this.comments(post), 'kg-comments-link'));
        return card;
    }
    async comments(post) {
        const panel = this.openSheet('Comments'); panel.classList.add('kg-comments-sheet');
        const updateCount = () => { for (const card of this.element.querySelectorAll('.kg-post')) if (card.dataset.postId === String(post.id)) {
            const link = card.querySelector('.kg-comments-link'); if (link) link.textContent = post.comments ? 'View all ' + formatCount(post.comments) + ' comments' : 'Be the first to comment…';
        } };
        const author = post.author || {};
        const context = el('div', 'kg-comments-context');
        context.append(avatar(author.name || 'Post', author.avatar), el('div', 'kg-comments-context-copy'));
        const copy = context.lastElementChild;
        copy.append(el('strong', '', author.handle ? '@' + author.handle : 'Post'));
        if (post.caption) copy.append(el('p', '', post.caption));
        panel.append(context);
        const list = el('div', 'kg-comments-list'); list.setAttribute('role', 'feed'); list.setAttribute('aria-label', 'Post comments'); panel.append(list);
        const renderComment = comment => {
            const row = el('article', 'kg-comment'); row.dataset.commentId = String(comment.id);
            row.append(avatar(comment.author?.name || 'Member', comment.author?.avatar));
            const content = el('div', 'kg-comment-copy');
            const byline = el('div', 'kg-comment-byline');
            byline.append(this.textButton(comment.author?.handle || comment.author?.name || 'Member', '', () => this.showProfile(comment.author?.id), 'kg-comment-author'), el('span', '', relativeTime(comment.created_at)));
            content.append(byline, el('p', '', comment.body || '')); row.append(content);
            if (comment.can_delete) row.append(this.control('Delete comment', 'more', () => this.confirm('Delete comment', 'Remove this comment from the post?', 'Delete comment', async () => {
                await this.rpc('DeleteComment', { Id: comment.id });
                post.comments = Math.max(0, Number(post.comments || 0) - 1);
                updateCount();
                this.comments(post);
            }, true), 'kg-comment-more'));
            return row;
        };
        const load = async after => {
            const result = await this.rpc('GetComments', { Id: post.id, After: after });
            if (this.sheet?.panel !== panel) return;
            list.querySelector('.kg-comments-more')?.remove();
            if (!after) list.replaceChildren();
            const comments = rows(result.comments);
            if (!after && !comments.length) list.append(el('p', 'kg-comments-empty', 'Start the conversation.'));
            for (const comment of comments) list.append(renderComment(comment));
            if (result.next) {
                const more = this.textButton('Load more comments', 'chevron', () => this.submit(more, () => load(result.next), list), 'kg-comments-more');
                list.append(more);
            }
        };
        const compose = el('div', 'kg-comments-compose');
        compose.append(avatar(this.me?.name || 'You', this.me?.avatar));
        const input = el('textarea'); input.rows = 1; input.maxLength = 1000; input.placeholder = 'Add a comment…'; input.setAttribute('aria-label', 'Add a comment');
        let draftNonce = nonce(), lastAttempt = '';
        input.addEventListener('input', () => { if (input.value.trim() !== lastAttempt) draftNonce = nonce(); });
        const send = this.control('Post comment', 'send', () => this.submit(send, async () => {
            const body = input.value.trim(); if (!body || bytes(body) > 1000) throw Error('Enter a comment of up to 1,000 bytes.');
            lastAttempt = body;
            const result = await this.rpc('CreateComment', { Id: post.id, Body: body, Nonce: draftNonce });
            if (this.sheet?.panel !== panel) return;
            post.comments = Number(post.comments || 0) + 1;
            updateCount();
            list.querySelector('.kg-comments-empty')?.remove();
            list.append(renderComment({ id: result.id, body, created_at: Date.now(), can_delete: true, author: this.me }));
            input.value = ''; lastAttempt = ''; draftNonce = nonce(); list.scrollTop = list.scrollHeight;
        }, list), 'kg-comments-send');
        input.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send.click(); } });
        compose.append(input, send); panel.append(compose);
        try { await load(); } catch (error) { if (this.sheet?.panel === panel) this.status(list, error.message, 'error'); }
    }
    async exploreGrid(body, epoch, query = {}, sequence = null) {
        const grid = el('div', 'kg-explore-grid'); body.append(grid);
        const load = async before => {
            const result = await this.rpc('GetFeed', { ...query, Before: before });
            if (!this.valid(epoch, grid) || (sequence !== null && sequence !== this.profileGridSequence)) return;
            if (!result.posts?.length && !before) {
                grid.append(this.empty(query.ProfileId ? 'Share your first moment' : 'No moments yet', query.ProfileId ? 'Photos and reels appear here.' : 'New posts from your city will appear here.', 'image'));
            }
            grid.querySelector('.gx-load-more')?.remove();
            for (const post of rows(result.posts)) {
                const preview = this.surfaceButton('Open post by ' + post.author.handle, () => {
                    const panel = this.openSheet('Post'); panel.classList.add('kg-post-sheet'); panel.append(this.postCard(post));
                }, 'kg-grid-item');
                const item = rows(post.media)[0];
                if (item?.type === 'image' && safeImage(item.url)) {
                    const img = el('img'); img.src = safeImage(item.url); img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.alt = post.caption || 'Post by ' + post.author.handle;
                    img.addEventListener('error', () => { img.remove(); preview.append(el('span', '', 'Image unavailable')); }, { once: true }); preview.append(img);
                } else { const symbol = el('span', 'kg-grid-video'); symbol.innerHTML = glyph('video'); preview.append(symbol, el('small', '', post.author.handle)); }
                grid.append(preview);
            }
            if (result.next) {
                const more = this.textButton('More moments', 'chevron', () => this.submit(more, () => load(result.next), grid), 'gx-load-more'); grid.append(more);
            }
        };
        await load();
    }
    async storiesInto(strip, epoch) {
        const stories = [], groups = new Map();
        const load = async before => {
            const result = await this.rpc('GetStories', { Following: this.following, Before: before });
            if (!this.valid(epoch, strip)) return;
            strip.querySelector('.kg-more-stories')?.remove();
            this.serverOffset = (result.server_time || Date.now()) - Date.now();
            for (const post of rows(result.posts)) {
                if (post.expires_at <= result.server_time) continue;
                stories.push(post);
                if (!groups.has(post.author.id)) {
                    const button = this.surfaceButton('Stories by ' + post.author.name, () => {
                        const ordered = [...groups.keys()].flatMap(id => stories.filter(story => story.author.id === id).sort((a, b) => a.created_at - b.created_at));
                        this.story(ordered, ordered.findIndex(story => story.author.id === post.author.id));
                        button.classList.add('kg-story-seen');
                    }, 'kg-story');
                    const circle = el('span', 'kg-story-circle'); circle.append(avatar(post.author.name, post.author.avatar));
                    button.append(circle, el('span', 'kg-story-label', post.author.handle)); strip.append(button); groups.set(post.author.id, button);
                }
            }
            if (result.next) {
                const more = this.control('More stories', 'chevron', () => this.submit(more, () => load(result.next), strip), 'kg-more-stories'); strip.append(more);
            }
        };
        await load();
    }
    story(stories, index = 0) {
        const post = stories[index];
        if (!post) return this.closeSheet();
        if (!post.highlight && !post.archive && post.expires_at <= Date.now() + (this.serverOffset || 0)) return this.story(stories, index + 1);
        let frame, video, paused = false, elapsed = 0, last = performance.now(), failed = false;
        const panel = this.openSheet('Story by ' + post.author.name, { onClose: () => {
            cancelAnimationFrame(frame); video?.pause(); if (video) { video.removeAttribute('src'); video.load(); }
        } });
        this.sheet.layer.classList.add('kg-story-modal'); panel.classList.add('kg-story-stage');
        const authorStories = stories.filter(story => story.author.id === post.author.id);
        const progress = el('div', 'kg-story-progress');
        let bar;
        authorStories.forEach(story => {
            const track = el('span'), fill = el('i');
            fill.style.width = story.id === post.id ? '0%' : stories.indexOf(story) < index ? '100%' : '0%';
            if (story.id === post.id) bar = fill;
            track.append(fill); progress.append(track);
        });
        const media = this.media(rows(post.media)[0] || {}, post.caption || 'Story', 'kg-story-media');
        video = media.querySelector('video');
        const header = el('div', 'kg-story-header');
        const author = el('div', 'kg-author');
        author.append(avatar(post.author.name, post.author.avatar), el('strong', '', post.author.handle), el('small', '', relativeTime(post.created_at)));
        const play = this.control('Pause story', 'pause', () => {
            paused = !paused; play.innerHTML = glyph(paused ? 'play' : 'pause'); play.setAttribute('aria-label', paused ? 'Resume story' : 'Pause story');
            if (video) paused ? video.pause() : video.play().catch(() => {});
        });
        header.append(author, play, this.control('Close story', 'close', () => this.closeSheet()));
        const zones = el('div', 'kg-story-zones');
        zones.append(this.surfaceButton('Previous story', () => this.story(stories, Math.max(0, index - 1)), 'kg-story-previous'),
            this.surfaceButton('Next story', () => this.story(stories, index + 1), 'kg-story-next'));
        const footer = el('div', 'kg-story-footer');
        if (post.caption) footer.append(el('p', '', post.caption));
        const tools = el('div', 'kg-story-tools'); tools.append(el('span', '', post.highlight ? 'Story highlight' : post.archive ? 'Private story archive' : 'Story · available for ' + (this.session?.story_hours || 24) + ' hours'));
        if (post.author.id === this.me.id) tools.append(this.control('Add to highlight', 'plus', () => this.editHighlight({ title: '', posts: [post] })));
        if (video) {
            video.controls = false; video.autoplay = true; video.muted = true; video.playsInline = true;
            const sound = this.control('Unmute story', 'mute', () => { video.muted = !video.muted; sound.innerHTML = glyph(video.muted ? 'mute' : 'speaker'); sound.setAttribute('aria-label', video.muted ? 'Unmute story' : 'Mute story'); video.play().catch(() => {}); });
            tools.append(sound);
            video.addEventListener('error', () => { failed = true; footer.prepend(el('p', '', 'This video is unavailable. Tap Next to continue.')); }, { once: true });
            video.play().catch(() => { paused = true; play.innerHTML = glyph('play'); play.setAttribute('aria-label', 'Play story'); });
        }
        tools.append(this.control('Story options', 'more', () => this.personMenu(post.author, post)));
        footer.append(tools); panel.append(media, zones, progress, header, footer);
        const tick = now => {
            if (this.sheet?.panel !== panel) return;
            const delta = Math.min(150, now - last); last = now;
            if (!this.active() || paused) { video?.pause(); }
            else {
                if (!post.highlight && !post.archive && post.expires_at <= Date.now() + (this.serverOffset || 0)) return this.story(stories, index + 1);
                if (video) {
                    if (!failed && video.paused && !video.ended) video.play().catch(() => {});
                    if (video.ended) return this.story(stories, index + 1);
                    if (bar && Number.isFinite(video.duration) && video.duration > 0) bar.style.width = Math.min(100, video.currentTime / video.duration * 100) + '%';
                } else {
                    elapsed += delta;
                    if (bar) bar.style.width = Math.min(100, elapsed / 7000 * 100) + '%';
                    if (elapsed >= 7000) return this.story(stories, index + 1);
                }
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
    }
    async refreshDirectory() {
        if (!this.me || this.liveScreen || !['home', 'live'].includes(this.nav)) return;
        const epoch = this.readEpoch, nav = this.nav;
        try {
            const result = await this.live.rpc('List');
            if (!this.valid(epoch) || this.liveScreen || nav !== this.nav) return;
            this.liveDirectory = result;
            if (nav === 'home' && this.liveRingHost?.isConnected) {
                this.liveRingHost.replaceChildren();
                for (const stream of rows(result.streams)) {
                    const button = this.surfaceButton('Watch ' + stream.author.handle + ' live', () => this.watchLive(stream.id), 'kg-story kg-live-story');
                    const circle = el('span', 'kg-story-circle'); circle.append(avatar(stream.author.name, stream.author.avatar), el('b', 'kg-live-badge', 'LIVE'));
                    button.append(circle, el('span', 'kg-story-label', stream.author.handle)); this.liveRingHost.append(button);
                }
                this.element.querySelector('.kg-live-entry')?.classList.toggle('kg-has-live', result.streams?.length > 0);
            } else if (nav === 'live' && this.liveListHost?.isConnected) {
                this.liveListHost.replaceChildren();
                if (!result.streams?.length) this.liveListHost.append(this.empty('The city is quiet', 'No one is live right now. Be the first to go on air.', 'live'));
                for (const stream of rows(result.streams)) {
                    const card = this.surfaceButton('Watch ' + stream.author.handle, () => this.watchLive(stream.id), 'kg-live-card');
                    const art = el('span', 'kg-live-card-art'); art.append(avatar(stream.author.name, stream.author.avatar), el('span', 'kg-live-badge', 'LIVE'));
                    const copy = el('span', 'kg-live-card-copy'); copy.append(el('strong', '', stream.title), el('span', '', '@' + stream.author.handle), el('small', '', formatCount(stream.viewers) + ' watching'));
                    const arrow = el('span', 'kg-card-play'); arrow.innerHTML = glyph('play'); card.append(art, copy, arrow); this.liveListHost.append(card);
                }
                if (!result.relay_ready) this.status(this.liveListHost, 'Live video is not configured yet. Ask a server administrator to configure TURN and run phone_doctor.', 'error');
            }
        } catch (error) {
            if (nav === 'live' && this.valid(epoch, this.liveListHost)) {
                this.liveListHost.replaceChildren(this.empty('Live is unavailable', error.message, 'refresh', () => this.refreshDirectory()));
            }
        }
    }
    async goLiveSheet() {
        const panel = this.openSheet('Go live');
        const art = el('div', 'kg-broadcast-intro'); art.append(avatar(this.me.name, this.me.avatar), el('h2', '', 'Let the city in.'), el('p', '', 'Share your in-game point of view, in real time.'));
        panel.append(art);
        const title = field('Live title', { maxLength: 80, placeholder: 'What’s happening in your city?' });
        panel.append(title.wrapper);
        const micLabel = el('label', 'kg-mic-choice'); const mic = el('input'); mic.type = 'checkbox'; mic.checked = false;
        const micCopy = el('span'); micCopy.append(el('strong', '', 'Include my microphone'), el('small', '', 'Optional. Uses your microphone, not game or proximity audio.'));
        micLabel.append(mic, micCopy); panel.append(micLabel);
        panel.append(el('p', 'kg-sheet-copy', 'Only your in-game camera is broadcast—never your webcam or desktop. Keep KiloGram open to stay live. Leaving or closing your phone ends the broadcast.'));
        const capacity = el('p', 'kg-sheet-note', 'Checking live availability…'); panel.append(capacity);
        const start = this.textButton('Go live', 'video', () => {
            const text = title.input.value.trim();
            if (!text || bytes(text) > 80 || /[\r\n]/.test(text)) { this.status(panel, 'Enter a single-line title of up to 80 bytes.', 'error'); return; }
            this.beginLive(() => this.live.start(text, mic.checked));
        }, 'nx-primary kg-go-live'); start.disabled = true; panel.append(start);
        try {
            const result = await this.live.rpc('List');
            if (this.sheet?.panel !== panel) return;
            const settings = result.settings;
            capacity.textContent = `Up to ${settings.maxViewers} viewers · ${Math.floor(settings.maxSeconds / 60)} minutes · Live comments and sharing`;
            mic.disabled = !settings.allowMicrophone;
            start.disabled = !result.relay_ready;
            if (!result.relay_ready) this.status(panel, 'The server’s video relay is not configured. Ask an administrator to run phone_doctor.', 'error');
        } catch (error) { if (this.sheet?.panel === panel) { capacity.remove(); this.status(panel, error.message, 'error'); } }
    }
    watchLive(id) {
        if (!/^kg-[a-z0-9-]{8,76}$/i.test(id)) { this.notify('This live reference is invalid.'); return; }
        return this.beginLive(() => this.live.join(id));
    }
    async beginLive(connect) {
        if (this.live.session || this.live.connecting) return;
        this.closeSheet(); this.currentChat = null; this.clearMedia(); ++this.readEpoch;
        this.liveScreen = true; this.liveUI = null;
        try { await connect(); }
        catch (error) { if (this.alive && this.liveScreen) this.updateLive(); }
    }
    buildLiveUI() {
        this.dockBlur?.destroy();
        this.closeSheet(); this.element.replaceChildren(); this.element.dataset.view = 'broadcast';
        const stage = el('section', 'kg-live-stage'); stage.setAttribute('aria-label', 'KiloGram live broadcast');
        const video = el('video', 'kg-live-video'); video.autoplay = true; video.playsInline = true; video.muted = true;
        const backdrop = el('div', 'kg-live-backdrop'); const shimmer = el('div', 'kg-live-shimmer');
        const header = el('header', 'kg-live-header'); const author = el('div', 'kg-live-author');
        const badge = el('span', 'kg-live-badge', 'LIVE');
        const viewers = this.surfaceButton('Viewers', () => this.livePeople(), 'kg-viewer-count');
        const eye = el('span'); eye.innerHTML = glyph('eye'); const viewerNumber = el('span', '', '0'); viewers.append(eye, viewerNumber);
        header.append(author, badge, viewers, this.control('Leave live', 'close', () => this.askLeave()));
        const status = el('div', 'kg-live-connection'); status.setAttribute('role', 'status');
        status.append(el('span', 'kg-spinner'), el('strong', '', 'Connecting…'));
        const top = el('div', 'kg-live-meta'); const title = el('span', 'kg-live-title'); const time = el('span', 'kg-live-time'); top.append(title, time);
        const notice = el('p', 'kg-live-notice'); notice.hidden = true; notice.setAttribute('role', 'status');
        const footer = el('div', 'kg-live-footer'); const pinned = el('div', 'kg-live-pinned'); pinned.hidden = true;
        const comments = el('div', 'kg-live-comments'); comments.setAttribute('role', 'log'); comments.setAttribute('aria-label', 'Live comments'); comments.setAttribute('aria-live', 'polite'); comments.setAttribute('aria-relevant', 'additions');
        const empty = el('p', 'kg-live-hello', 'You’re here. Say hello.'); comments.append(empty);
        const form = el('form', 'kg-live-compose'); const input = el('input'); input.placeholder = 'Add a comment…'; input.maxLength = 240; input.setAttribute('aria-label', 'Live comment'); input.autocomplete = 'off';
        const send = this.control('Send comment', 'send', () => {}); send.type = 'submit';
        const heart = this.control('Send a heart', 'heart', async () => {
            await this.live.action('React'); stage.classList.remove('kg-heart-pop'); void stage.offsetWidth; stage.classList.add('kg-heart-pop');
        }, 'kg-live-heart');
        form.append(input, send, heart);
        const tools = el('div', 'kg-live-tools');
        const share = this.control('Share this live', 'send', () => this.shareLive());
        const flip = this.control('Flip game camera', 'flip', () => this.live.flip());
        const microphone = this.control('Mute microphone', 'mic', () => this.live.muteMicrophone());
        const sound = this.textButton('Tap for sound', 'speaker', async () => {
            video.muted = !video.muted;
            try { await video.play(); } catch { video.muted = true; }
            sound.querySelector('span')?.replaceChildren(document.createTextNode(video.muted ? 'Tap for sound' : 'Sound on'));
            sound.setAttribute('aria-pressed', String(!video.muted));
        }, 'kg-live-sound');
        const likes = el('span', 'kg-live-likes', '0 hearts');
        const gift = this.control('Send a gift', 'gift', () => this.liveWallet(), 'kg-live-gift-button');
        const wallet = this.control('Creator gift wallet', 'wallet', () => this.liveWallet(), 'kg-live-wallet-button');
        tools.append(likes, gift, wallet, sound, microphone, flip, share, this.control('Live options', 'more', () => this.liveOptions()));
        footer.append(pinned, comments, form, tools);
        const reaction = el('span', 'kg-live-reaction'); reaction.innerHTML = glyph('heart'); reaction.setAttribute('aria-hidden', 'true');
        const giftEffect = el('div', 'kg-live-gift-effect'); giftEffect.setAttribute('aria-live', 'polite');
        stage.append(video, backdrop, shimmer, header, top, notice, status, footer, reaction, giftEffect); this.element.append(stage);
        let draftNonce = nonce(), lastBody = '';
        form.addEventListener('submit', event => {
            event.preventDefault();
            this.submit(send, async () => {
                const body = input.value.trim();
                if (!body || /[\r\n]/.test(body) || bytes(body) > (this.live.session?.options.commentBytes || 240)) throw new Error('Keep your comment to one short line.');
                if (lastBody && lastBody !== body) draftNonce = nonce(); lastBody = body;
                await this.live.action('Comment', { Body: body, Nonce: draftNonce });
                input.value = ''; draftNonce = nonce(); lastBody = ''; input.focus();
            });
        });
        this.liveUI = { stage, video, author, badge, viewers: viewerNumber, title, time, status, notice, comments, empty, pinned,
            input, send, heart, flip, microphone, sound, likes, gift, wallet, giftEffect, giftSequence: 0, backdrop, nodes: new Map() };
    }
    async liveWallet() {
        let blur;
        const viewing = this.live.session?.role === 'viewer';
        const panel = this.openSheet(viewing ? 'Send a gift' : 'KiloGram Coins', { onClose: () => blur?.destroy() });
        panel.classList.add('kg-wallet-sheet');
        const source = this.element.querySelector('.kg-live-stage, .kg-body');
        if (source) blur = createFrostedSurface({ bar: panel, source });
        const body = el('div', 'kg-wallet-body'); panel.append(body);
        const request = (route, data) => route === 'Gift' ? this.live.action(route, data) : this.live.rpc(route, data);
        let state, mode = viewing ? 'gifts' : 'coins', selectedPack, selectedGift;
        let packKey = nonce(), giftKey = nonce(), cashoutKey = nonce();
        const render = () => {
            if (this.sheet?.panel !== panel || !state) return;
            body.replaceChildren();
            const coinsAvailable = Math.max(0, Number(state.coins) || 0);
            const canGift = !state.host && state.giftsEnabled && this.live.session?.role === 'viewer';
            if (mode === 'gifts' && !canGift) mode = 'coins';
            if (mode === 'coins' && !state.giftsEnabled) mode = 'withdraw';
            const balance = el('div', 'kg-wallet-balance');
            balance.append(el('span', 'kg-wallet-mark', 'K'), el('span', 'kg-wallet-label', 'YOUR BALANCE'),
                el('strong', '', formatCount(coinsAvailable)), el('span', 'kg-wallet-unit', 'coins'));
            body.append(balance);
            const tabs = el('nav', 'kg-wallet-tabs'); tabs.setAttribute('aria-label', 'Wallet sections');
            for (const [id, label] of [...(canGift ? [['gifts', 'Gifts']] : []), ...(state.giftsEnabled ? [['coins', 'Buy coins']] : []), ['withdraw', 'Withdraw']]) {
                const button = this.textButton(label, '', () => { mode = id; render(); }, 'kg-wallet-tab');
                button.setAttribute('aria-current', String(mode === id)); tabs.append(button);
            }
            body.append(tabs);
            const content = el('div', 'kg-wallet-content'); body.append(content);
            if (mode === 'gifts') {
                const gifts = Object.entries(state.gifts || {}).sort((a, b) => Number(a[1].coins) - Number(b[1].coins));
                content.append(el('p', 'kg-wallet-intro', 'Send a gift to ' + (this.live.session?.info?.author?.name || this.live.session?.author?.name || 'the creator') + '. Coins are deducted when you send.'));
                if (!gifts.length) content.append(el('p', 'kg-wallet-empty', 'No gifts are available for this live.'));
                else {
                    if (!gifts.some(([id]) => id === selectedGift)) selectedGift = gifts[0][0];
                    const grid = el('div', 'kg-gift-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Choose a gift');
                    for (const [id, gift] of gifts) {
                        const button = el('button', 'kg-gift-choice'); button.type = 'button';
                        button.setAttribute('aria-pressed', String(id === selectedGift));
                        button.setAttribute('aria-label', `${gift.name} · ${formatCount(gift.coins)} coins`);
                        button.append(el('span', 'kg-gift-emoji', gift.emoji), el('strong', '', gift.name), el('small', '', '🪙 ' + formatCount(gift.coins)));
                        button.addEventListener('click', () => { if (selectedGift !== id) { selectedGift = id; giftKey = nonce(); render(); } });
                        grid.append(button);
                    }
                    content.append(grid);
                    const gift = state.gifts[selectedGift], price = Number(gift?.coins) || 0;
                    const send = this.textButton('Send ' + gift.name + ' · ' + formatCount(price) + ' coins', '', () => this.submit(send, async () => {
                        const result = await request('Gift', { GiftId: selectedGift, OperationId: giftKey });
                        giftKey = nonce(); this.notify(`${gift.name} sent. ${formatCount(result.coins)} coins remain.`); this.closeSheet();
                    }, content), 'nx-primary kg-wallet-submit');
                    send.disabled = price < 1 || coinsAvailable < price; content.append(send);
                    if (coinsAvailable < price) content.append(this.textButton('Get more coins', '', () => { mode = 'coins'; render(); }, 'kg-wallet-link'));
                }
            } else if (mode === 'coins') {
                const packs = rows(state.coinPacks).filter(pack => pack.Id != null && Number(pack.Coins) > 0 && Number(pack.BankCost) >= 0);
                content.append(el('p', 'kg-wallet-intro', 'Choose a coin pack. Prices use your in-game bank balance.'));
                if (!packs.length) content.append(el('p', 'kg-wallet-empty', 'Coin packs are unavailable right now.'));
                else {
                    if (!packs.some(pack => String(pack.Id) === selectedPack)) selectedPack = String(packs[0].Id);
                    const options = el('div', 'kg-coin-options'); options.setAttribute('role', 'radiogroup'); options.setAttribute('aria-label', 'Coin packs');
                    packs.forEach((pack, index) => {
                        const id = String(pack.Id), button = el('button', 'kg-coin-option'); button.type = 'button'; button.setAttribute('role', 'radio');
                        button.setAttribute('aria-checked', String(selectedPack === id)); button.setAttribute('aria-label', `${pack.Label} · $${formatCount(pack.BankCost)} in-game`);
                        button.append(el('span', '', pack.Label), el('small', '', '$' + formatCount(pack.BankCost) + ' in-game'), el('i', 'kg-coin-radio'));
                        button.addEventListener('click', () => { if (selectedPack !== id) { selectedPack = id; packKey = nonce(); render(); } });
                        button.addEventListener('keydown', event => { if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
                            event.preventDefault(); const shift = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
                            selectedPack = String(packs[(index + shift + packs.length) % packs.length].Id); packKey = nonce(); render();
                            content.querySelector('.kg-coin-options [aria-checked="true"]')?.focus(); });
                        options.append(button);
                    });
                    content.append(options);
                    const pack = packs.find(item => String(item.Id) === selectedPack);
                    const buy = this.textButton('Buy ' + pack.Label + ' · $' + formatCount(pack.BankCost) + ' in-game', '', () => this.submit(buy, async () => {
                        const result = await request('PurchaseCoins', { PackId: pack.Id, OperationId: packKey });
                        packKey = nonce(); this.notify(`${formatCount(result.added)} coins added to your wallet.`); await refresh();
                    }, content), 'nx-primary kg-wallet-submit'); content.append(buy);
                }
            } else {
                const rate = Math.max(1, Number(state.cashoutRate) || 1);
                content.append(el('p', 'kg-wallet-intro', `${formatCount(rate)} ${rate === 1 ? 'coin' : 'coins'} = $1 in your in-game bank.`));
                if (coinsAvailable < rate) content.append(el('p', 'kg-wallet-empty', coinsAvailable ? `You need at least ${formatCount(rate)} coins to withdraw.` : 'No coins to withdraw yet. Gifts you receive will appear here.'));
                else {
                    const wrap = el('div', 'kg-wallet-cashout');
                    const amount = el('div', 'kg-wallet-amount');
                    const input = el('input'); input.type = 'number'; input.min = String(rate); input.step = String(rate); input.max = String(Math.floor(coinsAvailable / rate) * rate);
                    input.inputMode = 'numeric'; input.placeholder = 'Coin amount'; input.setAttribute('aria-label', 'Coins to withdraw');
                    const max = this.textButton('Withdraw all', '', () => { input.value = input.max; cashoutKey = nonce(); update(); }, 'kg-wallet-max'); amount.append(input, max);
                    const preview = el('p', 'kg-wallet-preview'); preview.setAttribute('aria-live', 'polite');
                    const valid = coins => Number.isSafeInteger(coins) && coins >= rate && coins <= coinsAvailable && coins % rate === 0;
                    const button = this.textButton('Withdraw to bank', '', () => this.submit(button, async () => {
                        const coins = Number(input.value); if (!valid(coins)) throw Error('Enter a whole coin amount within your balance and the displayed exchange rate.');
                        const result = await request('CashOut', { Coins: coins, OperationId: cashoutKey });
                        cashoutKey = nonce(); this.notify(formatCount(result.bankAmount) + ' deposited to your bank.'); await refresh();
                    }, wrap), 'nx-primary kg-wallet-submit');
                    const update = () => { const coins = Number(input.value); button.disabled = !valid(coins);
                        preview.textContent = valid(coins) ? `You receive $${formatCount(coins / rate)} · ${formatCount(coinsAvailable - coins)} coins remain` : 'Enter a whole amount in steps of ' + formatCount(rate) + (rate === 1 ? ' coin.' : ' coins.'); };
                    input.addEventListener('input', () => { cashoutKey = nonce(); update(); }); wrap.append(amount, preview, button); content.append(wrap); update();
                }
            }
        };
        const refresh = async () => { state = await request('Wallet'); render(); };
        try { await refresh(); }
        catch (error) { if (this.sheet?.panel === panel) this.status(panel, error.message, 'error'); }
    }
    updateLive() {
        if (!this.alive || !this.liveScreen) return;
        const snapshot = this.live.snapshot();
        if (snapshot.ended && !snapshot.session && !snapshot.connecting) return this.renderLiveEnded(snapshot.ended);
        if (!this.liveUI?.stage?.isConnected) this.buildLiveUI();
        const ui = this.liveUI, info = snapshot.session, host = snapshot.role === 'host';
        if (snapshot.stream && ui.video.srcObject !== snapshot.stream) { ui.video.srcObject = snapshot.stream; ui.video.play().catch(() => {}); }
        const author = info?.author;
        if (author && ui.author.dataset.profile !== String(author.id)) {
            ui.author.dataset.profile = author.id; ui.author.replaceChildren(avatar(author.name, author.avatar), el('strong', '', author.handle));
        }
        ui.viewers.textContent = formatCount(info?.viewers || 0);
        ui.title.textContent = info?.title || 'Opening live…'; ui.badge.textContent = snapshot.connecting ? 'CONNECTING' : 'LIVE';
        ui.badge.classList.toggle('kg-connecting-badge', snapshot.connecting);
        ui.status.hidden = snapshot.connected;
        ui.status.querySelector('strong').textContent = snapshot.connecting ? 'Preparing your live…' : 'Connecting to broadcast…';
        ui.backdrop.hidden = snapshot.connected;
        ui.stage.classList.toggle('kg-is-host', host);
        ui.flip.hidden = !host; ui.microphone.hidden = !host || !snapshot.microphone;
        ui.gift.hidden = host; ui.wallet.hidden = !host;
        ui.microphone.innerHTML = glyph(snapshot.micEnabled ? 'mic' : 'mic-off');
        ui.microphone.setAttribute('aria-label', snapshot.micEnabled ? 'Mute microphone' : 'Unmute microphone');
        ui.microphone.setAttribute('aria-pressed', String(snapshot.micEnabled));
        ui.sound.hidden = host || !info?.has_audio;
        ui.likes.textContent = formatCount(info?.likes || 0) + ' hearts';
        ui.notice.textContent = snapshot.notice; ui.notice.hidden = !snapshot.notice;
        const canComment = info?.status === 'live' && info.comments_enabled && !snapshot.muted && !snapshot.connecting;
        ui.input.disabled = ui.send.disabled = !canComment;
        ui.input.placeholder = snapshot.muted ? 'You’re muted in this live' : info?.comments_enabled === false ? 'Comments are off' : 'Add a comment…';
        ui.heart.disabled = snapshot.connecting || !info;
        if (snapshot.giftSequence !== ui.giftSequence && snapshot.lastGift) {
            ui.giftSequence = snapshot.giftSequence;
            const sent = snapshot.lastGift;
            ui.giftEffect.replaceChildren(el('span', 'kg-live-gift-emoji', sent.gift?.emoji || '🎁'),
                el('strong', '', `@${sent.sender?.handle || 'Someone'} sent ${sent.gift?.name || 'a gift'}`));
            ui.giftEffect.classList.remove('kg-gift-pop'); void ui.giftEffect.offsetWidth; ui.giftEffect.classList.add('kg-gift-pop');
        }
        ui.pinned.hidden = !snapshot.pinned;
        if (snapshot.pinned) {
            const pin = el('span'); pin.innerHTML = glyph('pin');
            ui.pinned.replaceChildren(pin, el('p', '', '@' + snapshot.pinned.author.handle + ' · ' + snapshot.pinned.body));
        }
        const nearBottom = ui.comments.scrollHeight - ui.comments.scrollTop - ui.comments.clientHeight < 65;
        const keep = new Set(snapshot.comments.map(comment => comment.id));
        for (const [id, node] of ui.nodes) if (!keep.has(id)) { node.remove(); ui.nodes.delete(id); }
        ui.empty.hidden = snapshot.comments.length > 0;
        for (const comment of snapshot.comments) if (!ui.nodes.has(comment.id)) {
            const node = this.surfaceButton('Comment from ' + comment.author.handle, () => this.liveCommentMenu(comment), 'kg-live-comment');
            const copy = el('span'); copy.append(el('strong', '', comment.author.handle), el('span', '', comment.body));
            node.append(avatar(comment.author.name, comment.author.avatar), copy); ui.comments.append(node); ui.nodes.set(comment.id, node);
        }
        if (nearBottom) ui.comments.scrollTop = ui.comments.scrollHeight;
        this.updateLiveClock();
    }
    updateLiveClock() {
        const info = this.live.session?.info;
        if (!info || !this.liveUI) return;
        const seconds = Math.max(0, Math.floor((Date.now() + (this.serverOffset || 0) - info.started_at) / 1000));
        this.liveUI.time.textContent = Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
    }
    askLeave(after) {
        const snapshot = this.live.snapshot();
        if (!snapshot.session && !snapshot.connecting) { this.live.leave(); this.liveScreen = false; return after ? after() : this.navigate('live'); }
        const host = snapshot.role === 'host';
        const panel = this.openSheet(host ? 'End your live?' : 'Leave this live?');
        panel.append(el('p', 'kg-sheet-copy', host ? 'The broadcast will end for everyone watching. Live comments are not saved as a replay.' : 'You can return from Live now while the broadcast is still on air.'));
        panel.append(this.textButton(host ? 'End live' : 'Leave live', 'close', async () => {
            this.closeSheet(); await this.live.leave(host ? 'Your live has ended.' : 'You left the live.');
            if (after) { this.liveScreen = false; after(); }
        }, 'gx-danger'), this.textButton('Keep watching', '', () => this.closeSheet(), 'gx-list-button'));
    }
    renderLiveEnded(ended) {
        if (this.liveUI?.ended === ended && this.liveUI.stage?.isConnected) return;
        this.closeSheet(); this.liveUI?.video?.pause();
        this.element.replaceChildren();
        const stage = el('section', 'kg-live-ended');
        const mark = el('div', 'kg-live-mark'); mark.innerHTML = glyph('live');
        stage.append(mark, el('span', 'kg-ended-eyebrow', 'KILOGRAM LIVE'), el('h1', '', ended.error ? 'Couldn’t connect.' : ended.role === 'host' ? 'Thanks for going live.' : 'That’s a wrap.'), el('p', '', ended.reason));
        if (!ended.error && ended.session && ended.role === 'host') {
            const stats = el('div', 'kg-ended-stats');
            for (const [value, label] of [[ended.session.unique_viewers, 'Unique viewers'], [ended.session.likes, 'Hearts']]) {
                const stat = el('div'); stat.append(el('strong', '', formatCount(value)), el('small', '', label)); stats.append(stat);
            }
            stage.append(stats);
        }
        if (ended.retryId) stage.append(this.textButton('Try joining again', 'live', () => this.watchLive(ended.retryId), 'nx-primary'));
        stage.append(this.textButton('Back to live broadcasts', 'back', () => this.navigate('live'), ended.retryId ? 'gx-list-button' : 'nx-primary'));
        this.element.append(stage); this.liveUI = { stage, ended };
    }
    async livePeople() {
        const panel = this.openSheet('In this live');
        const loading = this.status(panel, 'Loading viewers…');
        try {
            const result = await this.live.action('State');
            if (this.sheet?.panel !== panel) return;
            loading.remove();
            for (const member of rows(result.people)) {
                const row = this.surfaceButton(member.profile.handle, () => this.livePersonMenu(member), 'kg-live-person-row');
                const text = el('span'); text.append(el('strong', '', member.profile.handle), el('small', '', member.role === 'host' ? 'Broadcaster' : member.connected ? 'Watching' : 'Connecting'));
                row.append(avatar(member.profile.name, member.profile.avatar), text); panel.append(row);
            }
        } catch (error) { if (this.sheet?.panel === panel) { loading.remove(); this.status(panel, error.message, 'error'); } }
    }
    livePersonMenu(member) {
        const panel = this.openSheet('@' + member.profile.handle);
        if (this.live.session?.role === 'host' && member.role === 'viewer') {
            panel.append(this.textButton(member.muted ? 'Allow comments' : 'Mute comments', 'message-circle', async () => {
                await this.live.action('Moderate', { Mode: 'mute', ProfileId: member.profile.id, Enabled: !member.muted }); this.closeSheet();
            }, 'gx-list-button'), this.textButton('Remove from this live', 'close', async () => {
                await this.live.action('Moderate', { Mode: 'kick', ProfileId: member.profile.id }); this.closeSheet();
            }, 'gx-danger'));
        }
        panel.append(this.textButton('Report profile', 'flag', () => this.report(member.profile), 'gx-list-button'));
    }
    liveCommentMenu(comment) {
        const panel = this.openSheet('Live comment'); panel.append(el('p', 'kg-sheet-copy', comment.body));
        const host = this.live.session?.role === 'host';
        if (host) panel.append(this.textButton('Pin comment', 'bookmark', async () => { await this.live.action('Moderate', { Mode: 'pin', Id: comment.id }); this.closeSheet(); }, 'gx-list-button'));
        if (host || comment.author.id === this.me.id) panel.append(this.textButton('Delete comment', 'trash', async () => { await this.live.action('Moderate', { Mode: 'delete-comment', Id: comment.id }); this.closeSheet(); }, 'gx-danger'));
        if (comment.author.id !== this.me.id) panel.append(this.textButton('Report profile', 'flag', () => this.report(comment.author), 'gx-list-button'));
    }
    liveOptions() {
        const snapshot = this.live.snapshot();
        const panel = this.openSheet('Live options');
        panel.append(this.textButton('Share live', 'share', () => this.shareLive(), 'gx-list-button'));
        if (snapshot.role === 'host') {
            panel.append(this.textButton(snapshot.session.comments_enabled ? 'Turn comments off' : 'Turn comments on', 'message-circle', async () => {
                await this.live.action('Moderate', { Mode: 'comments', Enabled: !snapshot.session.comments_enabled }); this.closeSheet();
            }, 'gx-list-button'));
            if (snapshot.pinned) panel.append(this.textButton('Unpin comment', 'bookmark', async () => { await this.live.action('Moderate', { Mode: 'pin' }); this.closeSheet(); }, 'gx-list-button'));
        } else if (snapshot.session) panel.append(this.textButton('Report broadcaster', 'flag', () => this.report(snapshot.session.author), 'gx-list-button'));
        panel.append(this.textButton(snapshot.role === 'host' ? 'End live' : 'Leave live', 'close', () => this.askLeave(), 'gx-danger'));
    }
    shareLive() {
        const info = this.live.session?.info;
        if (!info) return;
        return this.shareSheet({ title: 'Share live', stream: info,
            text: `KiloGram live · @${info.author.handle}\n${info.title}\n${liveLink(info.id)}` });
    }
    async shareSheet({ title, text, stream }) {
        const panel = this.openSheet(title);
        if (stream) {
            const preview = el('div', 'kg-share-preview');
            preview.append(avatar(stream.author.name, stream.author.avatar), el('strong', '', stream.title), el('span', 'kg-live-badge', 'LIVE')); panel.append(preview);
        }
        panel.append(el('p', 'kg-sheet-copy', 'Send to a mutual follower in KiloGram messages. Live links open only on this server and expire when the broadcast ends.'));
        panel.append(this.textButton('Copy ' + (stream ? 'live link' : 'post reference'), 'share', () => this.copy(stream ? liveLink(stream.id) : text), 'gx-list-button'));
        const list = el('div', 'kg-share-people'); panel.append(list);
        const requestNonces = new Map(), sent = new Set();
        const load = async after => {
            const result = await this.live.rpc('Recipients', { After: after });
            if (this.sheet?.panel !== panel) return;
            list.querySelector('.gx-load-more')?.remove();
            if (!after && !result.profiles?.length) list.append(this.empty('No mutual followers yet', 'Follow each other to share directly. You can still copy the reference.', 'users'));
            for (const profile of rows(result.profiles)) {
                const button = this.surfaceButton('Send to ' + profile.handle, async () => {
                    if (sent.has(profile.id) || button.disabled) return;
                    button.disabled = true;
                    try {
                        const key = requestNonces.get(profile.id) || nonce(); requestNonces.set(profile.id, key);
                        await this.rpc('SendMessage', { Id: profile.id, Body: text, Nonce: key });
                        sent.add(profile.id); label.textContent = 'Sent'; button.setAttribute('aria-label', 'Sent to ' + profile.handle);
                    } catch (error) { this.notify(error.message); }
                    finally { button.disabled = sent.has(profile.id); }
                }, 'kg-share-recipient');
                const copy = el('span'); copy.append(el('strong', '', profile.name), el('small', '', '@' + profile.handle));
                const label = el('b', '', 'Send'); button.append(avatar(profile.name, profile.avatar), copy, label); list.append(button);
            }
            if (result.next) {
                const more = this.textButton('More people', 'chevron', () => this.submit(more, () => load(result.next), list), 'gx-load-more'); list.append(more);
            }
        };
        try { await load(); } catch (error) { if (this.sheet?.panel === panel) this.status(list, error.message, 'error'); }
    }
    renderChat(scroll = false) {
        super.renderChat(scroll);
        if (!this.currentChat) return;
        for (const message of this.currentChat.list.querySelectorAll('.gx-message')) {
            const match = message.querySelector('p')?.textContent.match(/(?:^|\s)kilogram:\/\/live\/(kg-[a-z0-9-]{8,76})(?=\s|$)/i);
            if (match) {
                const card = this.textButton('Watch live', 'video', () => this.watchLive(match[1]), 'kg-dm-live-link'); message.append(card);
            }
        }
        if (scroll) this.currentChat.list.scrollTop = this.currentChat.list.scrollHeight;
    }
    handleEscape() {
        if (this.sheet) return super.handleEscape();
        if (this.liveScreen && (this.live.session || this.live.connecting)) { this.askLeave(); return true; }
        return super.handleEscape();
    }
    $destroy() {
        this.dockBlur?.destroy();
        clearTimeout(this.directoryTimer); clearInterval(this.liveClock);
        this.live?.removeEventListener('change', this.liveChanged);
        this.live?.destroy(); this.liveUI?.video?.pause();
        super.$destroy();
    }
}
