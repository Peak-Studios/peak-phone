import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exactNotificationTarget, notificationGesture, notificationLifetime } from '../../web/public/duo/notifications.mjs';

test('notification destinations retain exact direct, group, Mail and Y identities', () => {
  assert.deepEqual(exactNotificationTarget({ App: 'messages', Phone: '5550102002', Name: 'Jordan Lee', MessageId: 103 }), {
    App: 'messages', Phone: '5550102002', Name: 'Jordan Lee', MessageId: 103,
  });
  assert.deepEqual(exactNotificationTarget({ App: 'messages', GroupId: 'GRP20261005001', GroupName: 'Studio Crew' }), {
    App: 'messages', GroupId: 'GRP20261005001', GroupName: 'Studio Crew', MessageId: null,
  });
  assert.deepEqual(exactNotificationTarget({ App: 'mails', Id: 12 }), { App: 'mails', Id: '12' });
  assert.deepEqual(exactNotificationTarget({ App: 'y', PostId: '41' }), { App: 'y', PostId: 41 });
  assert.equal(exactNotificationTarget({ App: 'messages', Phone: '5550102002<script>' }), null);
  assert.equal(exactNotificationTarget({ App: 'mails', Id: '../12' }), null);
  assert.equal(exactNotificationTarget({ App: 'y', PostId: -1 }), null);
  assert.equal(exactNotificationTarget({ App: 'gallery', Id: 12 }), null);
});

test('upward ignore, tap, cancellation and other gestures stay separate from action intent', () => {
  assert.equal(notificationGesture(0, -72), 'dismiss');
  assert.equal(notificationGesture(0, -5), 'tap');
  assert.equal(notificationGesture(55, 2), 'suppress');
  assert.equal(notificationGesture(0, 0, true), 'suppress');
  assert.equal(notificationGesture(40, -50), 'suppress');
});

test('short notices, countdowns and persistent controls have bounded lifetimes', () => {
  assert.equal(notificationLifetime({}), 5000);
  assert.equal(notificationLifetime({ ShowCountdown: true }), 30000);
  assert.equal(notificationLifetime({ HasAccept: true }), 60 * 60 * 1000);
  assert.equal(notificationLifetime({ Data: { Sticky: true } }), 60 * 60 * 1000);
});

test('native banner styles load before NUI safety rules in the primary and physical screens', async () => {
  const root = new URL('../../', import.meta.url);
  const html = await readFile(new URL('web/public/index.html', root), 'utf8');
  const physical = await readFile(new URL('web/public/duo/physical-screen.mjs', root), 'utf8');
  const css = await readFile(new URL('web/public/duo/notifications.css', root), 'utf8');
  const staticOrder = html.indexOf('duo/notifications.css');
  const staticSafe = html.indexOf('duo/nui-safe.css');
  const styleList = physical.match(/const styles=\[[^\]]+\]/)?.[0] || '';
  const mirrorOrder = styleList.indexOf("'notifications'");
  const mirrorSafe = styleList.indexOf("'nui-safe'");
  assert.ok(staticOrder >= 0 && staticSafe > staticOrder, 'static notification style precedes nui-safe');
  assert.ok(mirrorOrder >= 0 && mirrorSafe > mirrorOrder, 'mirror notification style precedes nui-safe');
  assert.doesNotMatch(css, /backdrop-filter/i);
});
