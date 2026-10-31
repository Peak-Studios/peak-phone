import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const physicalIdentityChanges=new Set(['server/sv_contacts.lua','client/cl_devices.lua','client/cl_simcard.lua','server/sv_devices.lua','server/sv_simcard.lua','shared/settings.lua','web/public/duo/settings-app.mjs','web/public/duo/native-refresh.css','web/public/duo/preview.mjs','web/public/duo/physical-screen.html','web/public/duo/physical-screen.mjs','web/public/duo/screen-capture.mjs']);
const foldDisplayChanges=new Set(['web/public/duo/continuous.css','web/public/duo/fold-motion.mjs','web/public/duo/recording-service.mjs']);
const nextFiveChanges=['client/cl_groups.lua','client/cl_messages.lua','client/cl_media.lua','client/cl_y.lua','client/cl_wenmo.lua','server/sv_groups.lua','server/sv_messages.lua','server/sv_wenmo.lua','server/sv_media.lua','server/sv_social.lua','server/sv_y.lua','web/public/duo/community-apps.mjs','web/public/duo/glass-kit.mjs','web/public/duo/maps-app.mjs','web/public/duo/media-gallery.mjs','web/public/duo/media-upload.mjs','web/public/duo/messages-app.mjs','web/public/duo/messages-app.css','web/public/duo/recording-store.mjs','web/public/duo/social-app.mjs'];
const controlCenterChanges=['web/public/duo/glass-bars.css','web/public/duo/frosted-surface.mjs','web/public/duo/presentation.mjs','web/public/duo/fullscreen-apps.css','web/public/duo/settings-dock.css','client/cl_control_center.lua','client/cl_peakify.lua','server/sv_peakify.lua','web/public/duo/control-center.mjs','web/public/duo/control-center.css','web/public/duo/icons.mjs','web/public/duo/music-overlay.mjs','web/public/duo/music-preview.mjs'];
controlCenterChanges.push('client/cl_hardware.lua','web/public/duo/media-output.mjs','web/public/duo/hardware-controls.css','web/public/duo/voice-memos-app.mjs');
controlCenterChanges.push('web/public/duo/music-app.mjs','web/public/duo/music.css','web/public/duo/music-search.mjs','web/public/duo/music-youtube.mjs','client/cl_music_search.lua','server/sv_music_search.lua');
controlCenterChanges.push('client/cl_ringtones.lua','web/public/duo/ringtones.mjs');
const allowedRuntimeChanges=new Set(['client/cl_mails.lua','client/cl_social.lua','web/public/duo/mail-app.mjs','web/public/duo/mail.css','web/public/duo/kilogram.css','web/public/duo/assets/gift-icon.png','client/cl_camera.lua','server/sv_gallery.lua','web/public/duo/camera-ui.mjs','web/public/duo/recording.css','client/cl_anim.lua','client/cl_gallery.lua','client/cl_sharedrop.lua','server/sv_sharedrop.lua','web/public/duo/sharedrop.mjs','web/public/duo/sharedrop.css','web/public/build/duo-legacy.js',...controlCenterChanges,'client/_cl_main.lua','client/cl_call_ui.lua','client/cl_contacts.lua','client/cl_facetime.lua','client/cl_duo_hand.lua','client/cl_duo_prop.lua','client/cl_sim_gesture.lua','fxmanifest.lua','package.json','server/duo_prop.lua','server/sv_calls.lua','server/sv_facetime.lua','server/sv_kilogram_live.lua','server/owner_config.lua','shared/duo_prop.lua','shared/portable.lua','web/public/index.html','web/public/duo/call-ui.mjs','web/public/duo/call.css','web/public/duo/ios.css','web/public/duo/kilogram-app.mjs','web/public/duo/kilogram-live-capture.mjs','web/public/duo/kilogram-live.mjs','web/public/duo/rtc-utils.mjs','web/public/duo/shell.mjs','web/public/duo/upgrade-preview.mjs','web/public/duo/video-app.mjs','web/public/duo/phone-app.mjs','web/public/duo/video-service.mjs','web/public/duo/video.css','web/public/duo/foldable-orientation.css',...physicalIdentityChanges,...foldDisplayChanges,...nextFiveChanges]);
allowedRuntimeChanges.add('web/public/duo/app-transition.mjs');
// Performance scope: defer break-only audio without changing its playback assets.
allowedRuntimeChanges.add('web/public/duo/broken-phone.mjs');
allowedRuntimeChanges.add('web/public/duo/legacy-icons.css');
allowedRuntimeChanges.add('web/public/duo/app-switcher.mjs');
allowedRuntimeChanges.add('web/public/duo/upgrade.css');
// Clock alarms, timers and their shell-owned alert surface are an isolated feature scope.
for(const file of ['web/public/duo/clock-app.mjs','web/public/duo/clock-alert.mjs','web/public/duo/clock-cities.mjs','web/public/duo/clock-service.mjs','web/public/duo/native-kit.mjs'])allowedRuntimeChanges.add(file);
// Find My's map adapter and private consent service are declared integration scope.
allowedRuntimeChanges.add('web/public/duo/notifications.css');allowedRuntimeChanges.add('web/public/duo/notifications.mjs');allowedRuntimeChanges.add('client/cl_maps.lua');allowedRuntimeChanges.add('server/sv_findmy.lua');
// Notes document write verification is explicitly authorized; unrelated modules remain guarded.
allowedRuntimeChanges.add('server/sv_document.lua');allowedRuntimeChanges.add('client/cl_documents.lua');
allowedRuntimeChanges.add('web/public/duo/notes.css');allowedRuntimeChanges.add('web/public/duo/notes-app.mjs');allowedRuntimeChanges.add('web/public/duo/ios-icons.mjs');
// Align icon cache revisions in all importers after the Notes icon change.
allowedRuntimeChanges.add('web/public/duo/home-editor-app.mjs');allowedRuntimeChanges.add('web/public/duo/store-app.mjs');allowedRuntimeChanges.add('web/public/duo/utilities-apps.mjs');
// Deterministic build emits the explicit CEF-safe legacy CSS declaration.
allowedRuntimeChanges.add('web/public/build/bundle.css');
// Reviewed Services/Crypto restoration and transaction-status integration.
for(const file of ['client/cl_crypto.lua','client/cl_services.lua','server/sv_crypto.lua','server/sv_services.lua','web/public/duo/catalog.mjs','web/public/duo/services-app.mjs','web/public/duo/crypto-app.mjs','web/public/duo/restored-apps.css','web/public/index.html','web/public/duo/physical-screen.html','web/public/duo/physical-screen.mjs','web/public/duo/presentation.mjs','web/public/duo/preview.mjs','web/public/duo/shell.mjs','web/public/duo/store-app.mjs','web/public/duo/utilities-apps.mjs'])allowedRuntimeChanges.add(file);
for(const file of ['web/public/duo/appearance.css','web/public/duo/appearance-semantic.css','web/public/duo/photos.css','web/public/duo/wallpaper-ink.mjs','web/public/duo/daily-apps.mjs','tools/generate-appearance.py'])allowedRuntimeChanges.add(file);
// Reviewed phone-contained feedback layout and generation-scoped transport errors.
allowedRuntimeChanges.add('web/public/duo/duo.css');allowedRuntimeChanges.add('web/public/duo/transport.mjs');
// Reviewed Calculator expression, layout and history changes.
for(const file of ['web/public/duo/calculator-app.mjs','web/public/duo/calculator-core.mjs','web/public/duo/social-refresh.css'])allowedRuntimeChanges.add(file);
// The native Weather feature is reviewed runtime scope, including its callback and display assets.
for(const file of ['client/cl_weather.lua','web/public/duo/icons.mjs','web/public/duo/weather-app.mjs','web/public/duo/weather-core.mjs','web/public/duo/weather.css','web/public/images/ios/weather.svg'])allowedRuntimeChanges.add(file);
allowedRuntimeChanges.add('web/public/duo/calendar-app.mjs');
for(const file of ['web/public/duo/call-ui.mjs','web/public/duo/camera-controls.mjs','web/public/duo/camera-ui.mjs','web/public/duo/catalog.mjs','web/public/duo/control-center.mjs','web/public/duo/home-editor-app.mjs','web/public/duo/icons.mjs','web/public/duo/ios-icons.mjs','web/public/duo/kilogram-app.mjs','web/public/duo/legacy-app-sheets.mjs','web/public/duo/maps-app.mjs','web/public/duo/media-gallery.mjs','web/public/duo/music-app.mjs','web/public/duo/music-overlay.mjs','web/public/duo/native-kit.mjs','web/public/duo/notes-app.mjs','web/public/duo/owner-config.mjs','web/public/duo/photos-library.mjs','web/public/duo/presentation.mjs','web/public/duo/preview.mjs','web/public/duo/services-app.mjs','web/public/duo/shell.mjs','web/public/duo/store-app.mjs','web/public/duo/ui-kit.mjs','web/public/duo/utilities-apps.mjs','web/public/duo/settings-app.mjs','web/public/duo/crypto-app.mjs','web/public/duo/glass-kit.mjs','web/public/duo/phone-app.mjs','web/public/duo/social-app.mjs','web/public/duo/vehicle-app.mjs','web/public/duo/video-app.mjs','web/public/duo/calculator-app.mjs','web/public/duo/calendar-app.mjs','web/public/duo/clock-app.mjs','web/public/duo/community-apps.mjs','web/public/duo/daily-apps.mjs','web/public/duo/mail-app.mjs','web/public/duo/messages-app.mjs','web/public/duo/voice-memos-app.mjs','web/public/duo/weather-app.mjs'])allowedRuntimeChanges.add(file);
test('Call UI modules are shipped and registered once, with safety CSS last',()=>{const index=read('web/public/index.html'),shell=read('web/public/duo/shell.mjs');assert.equal((shell.match(/new CallUI\(/g)||[]).length,1);assert(index.includes('./duo/call.css'));assert(shell.includes("import { CallUI }"));assert.equal([...index.matchAll(/<link[^>]*href="([^"]+)"/g)].at(-1)[1],'./duo/nui-safe.css');});
test('Mail stylesheet precedes final safety overrides in the physical-screen mirror',()=>{const source=read('web/public/duo/physical-screen.mjs'),styles=source.match(/const styles=\[(.*?)\];/s)?.[1]||'';assert(styles.indexOf("'mail'")>=0);assert(styles.indexOf("'mail'")<styles.indexOf("'nui-safe'"));});
test('Notes and compact utility cache keys agree in NUI and physical-screen graphs while the preview stays singleton and Clock integration is retained',()=>{const source=read('web/public/duo/physical-screen.mjs'),styles=source.match(/const styles=\[(.*?)\];/s)?.[1]||'',entry=read('web/public/duo/physical-screen.html'),clientDui=read('client/cl_duo_prop.lua'),index=read('web/public/index.html'),shell=read('web/public/duo/shell.mjs'),preview=read('tools/build-preview.cjs'),utilities=read('web/public/duo/utilities-apps.mjs');assert(styles.indexOf("'notes'")>=0);assert(styles.indexOf("'notes'")<styles.indexOf("'nui-safe'"));assert(styles.includes("s==='notes'?'?rev=ios-notes-scalable-read-20261011a'"));assert(styles.includes("s==='native-refresh'?'?rev=phone-f35-compact-20261015d'"));assert(styles.includes("s==='photos'?'?rev=photos-theme-20261015'"));assert(styles.includes("s==='app-editor-families'?'?rev=app-editor-families-theme-20261015'"));assert(index.includes('./duo/native-refresh.css?rev=phone-f35-compact-20261015d'));assert(index.includes('./duo/notes.css?rev=ios-notes-scalable-read-20261011a'));assert(shell.includes("./notes-app.mjs?rev=owner-config-20261015"));assert(index.includes("./duo/shell.mjs?rev=calculator-owner-config-20261016a"));assert(entry.includes('physical-screen.mjs?rev=phone-f05-calculator-safe-area-photos-notes-20261016c'));assert(clientDui.includes('physical-screen.html?slot=%d&rev=phone-f05-calculator-safe-area-photos-notes-20261016c'));assert(shell.includes("./utilities-apps.mjs?rev=owner-config-20261015"));assert(utilities.includes("./clock-app.mjs?rev=owner-config-20261015"));assert(preview.includes("import(build('shell.mjs'))"));assert.doesNotMatch(preview,/shell\.mjs\?rev=/);});
test('Owner-config cache revisions cover catalog consumers in both shipped graphs',()=>{const index=read('web/public/index.html'),source=read('web/public/duo/physical-screen.mjs'),entry=read('web/public/duo/physical-screen.html'),shell=read('web/public/duo/shell.mjs'),previewModule=read('web/public/duo/preview.mjs'),previewBuild=read('tools/build-preview.cjs'),utility=read('web/public/duo/utilities-apps.mjs');const graph=[index,source,entry,shell,previewModule,utility,read('web/public/duo/home-editor-app.mjs'),read('web/public/duo/presentation.mjs'),read('web/public/duo/store-app.mjs')].join('\n');assert.doesNotMatch(graph,/ios-restored-quality-20261010b|restored-apps-20261010(?:['"])/);assert(index.includes('./duo/restored-apps.css?rev=ios-restored-quality-20261010c'));assert(source.includes("s==='restored-apps'?'?rev=ios-restored-quality-20261010c'"));assert(shell.includes("./services-app.mjs?rev=owner-config-20261015"));assert(shell.includes("./crypto-app.mjs?rev=owner-config-20261015"));assert(previewModule.includes("./catalog.mjs?rev=owner-config-20261015"));assert(previewBuild.includes("import(build('shell.mjs'))"));assert.doesNotMatch(previewBuild,/shell\.mjs\?rev=/);});
test('New release versions agree between resource, client/server helper and maintenance package',()=>{assert.match(read('fxmanifest.lua'),/version '3\.0\.0'/);assert.match(read('shared/portable.lua'),/Version = '3\.0\.0'/);assert.equal(JSON.parse(read('package.json')).version,'3.0.0');});
test('Contained feedback invalidates changed CSS, transport and mirror entry without duplicating the preview catalog',()=>{
 const revision='ios-contained-feedback-20261011a',index=read('web/public/index.html'),mirror=read('web/public/duo/physical-screen.mjs'),shell=read('web/public/duo/shell.mjs');
 assert(index.includes('./duo/duo.css?rev=ios-contained-feedback-20261011b'));
 for(const stylesheet of ['ios','call','appearance'])assert(index.includes(`./duo/${stylesheet}.css?rev=${revision}`),stylesheet);
 assert(mirror.includes("s==='duo'?'?rev=ios-contained-feedback-20261011b'"));
 assert(mirror.includes(`['ios','call'].includes(s)?'?rev=${revision}'`));
 assert(mirror.includes(`s==='appearance'?'?rev=${revision}'`));
 assert(shell.includes(`./transport.mjs?rev=${revision}`));
 assert(index.includes('./duo/shell.mjs?rev=calculator-owner-config-20261016a'));
 assert(read('web/public/duo/physical-screen.html').includes('physical-screen.mjs?rev=phone-f05-calculator-safe-area-photos-notes-20261016c'));
 for(const importer of ['shell','preview','presentation','store-app'])assert(read(`web/public/duo/${importer}.mjs`).includes('./catalog.mjs?rev=owner-config-20261015'),importer);
});
test('Livestream error screen links retry to its validated session ID',()=>{const s=read('web/public/duo/kilogram-app.mjs');assert(s.includes("ended.error ? 'Couldn’t connect.'"));assert(s.includes('this.watchLive(ended.retryId)'));assert(!s.includes('this.joinLive(ended.retryId)'));});


test('Fold clock invalidation advances independently while unchanged leaf assets retain their revisions',()=>{
 const revision='ios-fold-motion-quality-20261011b',entryRevision='phone-f05-calculator-safe-area-photos-notes-20261016c',weatherRevision='ios-weather-native-20261011e',index=read('web/public/index.html'),mirror=read('web/public/duo/physical-screen.mjs'),entry=read('web/public/duo/physical-screen.html'),shell=read('web/public/duo/shell.mjs');
 assert(index.includes('./duo/continuous.css?rev='+revision));
 for(const stylesheet of ['foldable-orientation','hardware-controls'])assert(index.includes('./duo/'+stylesheet+'.css?rev=ios-quarter-turn-20261011a'),stylesheet);
 assert(mirror.includes("['foldable-orientation','hardware-controls'].includes(s)?'?rev=ios-quarter-turn-20261011a'"));
 assert(shell.includes('./fold-motion.mjs?rev=phone-performance-clock-20261011c'));assert(shell.includes('./recording-service.mjs?rev='+revision));
 assert(mirror.includes("s==='continuous'?'?rev="+revision+"'"));
 assert(index.includes('./duo/weather.css?rev='+weatherRevision));
 assert(mirror.includes("s==='weather'?'?rev="+weatherRevision+"'"));
 assert(shell.includes('./weather-app.mjs?rev=owner-config-20261015'));
 assert(index.includes('./duo/shell.mjs?rev=calculator-owner-config-20261016a'));
 assert(entry.includes('physical-screen.mjs?rev='+entryRevision));
 assert(shell.includes('./notes-app.mjs?rev=owner-config-20261015'));
 assert(shell.includes('./utilities-apps.mjs?rev=owner-config-20261015'));
 assert(read('web/public/duo/utilities-apps.mjs').includes('./clock-app.mjs?rev=owner-config-20261015'));
});test('Weather catalog and icons reach Home editing and Store through current parent imports',()=>{
 const revision='owner-config-20261015';
 for(const importer of ['shell','home-editor-app','store-app'])assert(read(`web/public/duo/${importer}.mjs`).includes(`./ios-icons.mjs?rev=${revision}`),importer);
 assert(read('web/public/duo/shell.mjs').includes('./utilities-apps.mjs?rev=owner-config-20261015'));
 for(const module of ['presentation','store-app'])assert(read('web/public/duo/shell.mjs').includes(`./${module}.mjs?rev=${revision}`),module);
 assert(read('web/public/duo/utilities-apps.mjs').includes(`./home-editor-app.mjs?rev=${revision}`));
 assert(read('web/public/duo/shell.mjs').includes('./notes-app.mjs?rev=owner-config-20261015'));
 assert(read('web/public/duo/utilities-apps.mjs').includes('./clock-app.mjs?rev=owner-config-20261015'));
});
