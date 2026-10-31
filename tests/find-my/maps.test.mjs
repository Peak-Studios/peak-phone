import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const schema = read('sql/portable.sql');
const server = read('server/sv_findmy.lua');
const client = read('client/cl_maps.lua');
const maps = read('web/public/duo/maps-app.mjs');
const nativeRefresh = read('web/public/duo/native-refresh.css');
const preview = read('web/public/duo/preview.mjs');
const backup = read('server/sv_device_backup.lua');
const sharedrop = read('server/sv_sharedrop.lua');
const services = read('bridge/services.lua');
const mapCore = await import('../../web/public/duo/map-core.mjs');

test('durable shares store consent and identity, never coordinates', () => {
  const table = schema.match(/CREATE TABLE IF NOT EXISTS peak_phone_location_shares \(([\s\S]*?)\) ENGINE=/)?.[1];
  assert.ok(table, 'portable schema declares the durable share table');
  for (const field of ['owner_cid', 'owner_sim_id', 'owner_device_id', 'target_cid', 'target_sim_id', 'target_phone', 'duration', 'expires_at']) {
    assert.match(table, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(table, /\b(?:x|y|z|coords?|location|latitude|longitude)\b/i);
  assert.match(table, /UNIQUE KEY uq_location_share_pair \(owner_cid,owner_sim_id,target_cid,target_sim_id\)/);
});

test('start requires a saved contact and binds both registered SIM identities in SQL', () => {
  assert.match(server, /local DURATIONS = \{ one_hour = 3600000, one_day = 86400000, until_stopped = false \}/);
  assert.match(server, /FROM phone_contacts c\s+JOIN sim_cards o ON o\.sim_id=\? AND o\.owner_citizenid=\? AND o\.phone_number=\?\s+JOIN sim_cards t ON t\.sim_id=\? AND t\.owner_citizenid=\? AND t\.phone_number=\?/);
  assert.match(server, /WHERE c\.citizenid=\? AND c\.id=\? AND c\.phone=\? AND c\.name=\?/);
  assert.match(server, /target_cid=\? AND target_sim_cid=\? AND target_sim_id=\? AND target_phone=\?/);
});

test('coordinates are sampled only after the yielding batch and guarded by final session checks', () => {
  const finalSweep = server.indexOf('-- Every operation above can yield. Validate the whole batch after all');
  const sample = server.indexOf('GetEntityCoords(ownerPed)', finalSweep);
  assert.ok(finalSweep > 0 && sample > finalSweep);
  assert.ok(server.indexOf('PhoneDB.one([[SELECT share_id FROM peak_phone_location_shares WHERE share_id=?', 0) < finalSweep);
  assert.match(server.slice(finalSweep, sample), /finalActor\(ownerSource, row\.owner_cid, observation\.ownerEpoch\)/);
  assert.match(server.slice(finalSweep, sample), /M\.versions\[row\.share_id\].*observation\.version/);
  assert.match(server.slice(finalSweep, sample), /GetPlayerRoutingBucket\(ownerSource\)/);
  assert.match(server.slice(finalSweep, sample), /GetPlayerRoutingBucket\(src\) == recipientBucket/);
});

test('Maps asks for recipient confirmation and offers only the three supported durations', () => {
  assert.match(maps, /Maps\/ResolveRecipient/);
  assert.match(maps, /resolved\.Recipient\.Name/);
  assert.match(maps, /resolved\.Recipient\.Phone/);
  for (const duration of ['one_hour', 'one_day', 'until_stopped']) assert.ok(maps.includes(duration));
  assert.match(maps, /this\.scrollPeopleListIntoView\(\);this\.refreshPeople\(\)/);
  assert.match(maps, /Share live location','navigation'/);
  assert.match(maps, /Maps\/GetShareContacts/);
  assert.match(maps, /openShareContactPicker\(\)/);
  assert.match(maps, /u27-share-location/);
  assert.match(maps, /item\('Set Waypoint'/);
  assert.match(maps, /item\('Share with Nearby'/);
  assert.doesNotMatch(maps, /item\('Copy coordinates'/);
  assert.doesNotMatch(maps, /item\(this\.saved/);
  assert.match(maps, /duo:sharedrop-location/);
  assert.doesNotMatch(maps, /Messages\/SendMessage/);
  assert.match(maps, /They will no longer see your live location\./);
  assert.match(maps, /const live=p\.Available===true&&validPoint\(p\.Location\)/);
  assert.match(maps, /!e\.ctrlKey\)return;e\.preventDefault\(\)/);
  assert.match(maps, /openPinMenu\(/);
});

test('Maps fullscreen preserves app state, keyboard exit and phone-safe bounds', () => {
  const transition = maps.slice(maps.indexOf(' setFullscreen(value){'), maps.indexOf(' trapFullscreenTab(event){'));
  assert.match(maps, /this\.fullscreenButton=this\.button\('Full screen map'/);
  assert.match(maps, /this\.fullscreenExit=this\.button\('Exit map full screen','close'/);
  assert.doesNotMatch(maps, /Show whole island/);
  assert.match(maps, /this\.button\('Full screen map','expand'/);
  assert.match(maps, /this\.fullscreenReturnFocus=document\.activeElement/);
  assert.match(maps, /this\.fullscreenExit\.focus\(\{preventScroll:true\}\)/);
  assert.match(maps, /trapFullscreenTab\(event\)/);
  assert.match(maps, /handleEscape\(\).*this\.fullscreen/);
  assert.doesNotMatch(maps, /requestFullscreen\(|exitFullscreen\(/);
  assert.doesNotMatch(transition, /this\.(?:center|zoom|filter|query)\s*=/);
  assert.doesNotMatch(transition, /this\.render/);
  assert.match(nativeRefresh, /\.u27-maps\.u27-map-fullscreen\{position:absolute!important;inset:0!important/);
  assert.match(nativeRefresh, /\.u27-maps\.u27-map-fullscreen>\.gx-body[^}]*scrollbar-gutter:auto/);
  assert.match(nativeRefresh, /\.u27-maps\.u27-map-fullscreen \.u27-map-exit\{[^}]*top:3\.8vh/);
  assert.match(nativeRefresh, /\.u27-maps\.u27-map-fullscreen \.u27-map-controls\{[^}]*top:7\.8vh/);
});

test('typed and shared GTA coordinates use the same bounded world attachment range', () => {
  assert.deepEqual(mapCore.parseCoordinates('-10000, -10000'), { x: -10000, y: -10000 });
  assert.deepEqual(mapCore.parseCoordinates('10000, 15000'), { x: 10000, y: 15000 });
  assert.equal(mapCore.parseCoordinates('10000.01, 0'), null);
  assert.equal(mapCore.parseCoordinates('0, 15000.01'), null);
  assert.equal(mapCore.parseCoordinates('NaN, Infinity'), null);
  assert.match(services, /x< -10000 or x>10000 or y< -10000 or y>15000/);
});

test('ShareDrop reveals a location only after consent and writes it to Messages after both animations', () => {
  assert.match(sharedrop, /Location=s\.kind=='location' and s\.consented and s\.location or nil/);
  assert.match(sharedrop, /PhotoUrl=s\.kind~='location'/);
  assert.match(sharedrop, /s\.consented=true;s\.phase='approach'/);
  const locationPersist = sharedrop.indexOf("if s.kind=='location' then");
  const animationSave = sharedrop.indexOf('local function saveAfterBothAnimations');
  assert.ok(locationPersist > animationSave, 'location persistence is in the post-animation save phase');
  assert.match(sharedrop.slice(locationPersist, locationPersist + 800), /Phone\.sendMessage/);
  assert.match(sharedrop.slice(locationPersist, locationPersist + 800), /Attachments=\{attachment\}/);
});

test('optional GTA blips are default-on and invalid client sessions clear stale points', () => {
  assert.match(client, /GetResourceKvpString\([^)]*findmy:map-blips/);
  assert.match(client, /liveBlipsEnabled = .*~= '0'/);
  assert.match(client, /sessionSnapshot\(\)/);
  assert.match(client, /sameSession\(session\)/);
  assert.match(client, /local function requestPeopleState\(\)/);
  assert.match(client, /peak-phone:Server:FindMy:GetShareContacts/);
  assert.match(client, /Citizen\.Await\(peopleStateRequest\)/);
  assert.match(server, /local function getShareContacts\(src\)/);
  assert.match(server, /Resolvable = not not/);
  assert.match(client, /clearPeopleBlips\(\)/);
});

test('the preview exposes People read fixtures but refuses live permission writes', () => {
  assert.match(preview, /'Maps\/GetPeopleState':mapPeopleState/);
  assert.match(preview, /Maps\/StartSharing.*Maps\/StopSharing/);
  assert.match(preview, /Preview mode does not create or revoke shares/);
  assert.doesNotMatch(backup, /peak_phone_location_shares|FindMy/);
});
