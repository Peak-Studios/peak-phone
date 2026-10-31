import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterMailRows,
  formatMailTime,
  groupMailRows,
  mailId,
  mailIsRead,
  mailPreviewText,
  mailTimestamp,
} from '../../web/public/duo/mail-app.mjs';

test('mail row readers accept the server field names and normalize second timestamps', () => {
  assert.equal(mailId({ MailId: 42 }), '42');
  assert.equal(mailIsRead({ Read: '1' }), true);
  assert.equal(mailIsRead({ read: 0 }), false);
  assert.equal(mailTimestamp({ Timestamp: 1_700_000_000 }), 1_700_000_000_000);
  assert.equal(mailTimestamp({ timestamp: Infinity }), 0);
});

test('inbox search covers sender, saved contact name, subject, and plain text from HTML', () => {
  const mails = [
    { id: 1, sender: '(555) 010-2002', subject: 'Plans', message: '<p>See you at the studio</p>' },
    { id: 2, sender: 'City Services', subject: 'Appointment', message: 'Friday at 10:30' },
  ];
  const contacts = [{ phone: '5550102002', name: 'Jordan Lee' }];
  assert.deepEqual(filterMailRows(mails, 'jordan', 'all', contacts).map(mailId), ['1']);
  assert.deepEqual(filterMailRows(mails, 'studio').map(mailId), ['1']);
  assert.deepEqual(filterMailRows(mails, 'city').map(mailId), ['2']);
  assert.deepEqual(filterMailRows(mails, '', 'unread').map(mailId), ['1', '2']);
  assert.equal(mailPreviewText('<p>Keep   spaces</p>'), 'Keep spaces');
});

test('mail groups follow local calendar boundaries across a daylight-saving transition', () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const springNow = Date.parse('2026-03-09T12:00:00-07:00');
    const springYesterday = Date.parse('2026-03-08T08:30:00Z');
    const springBeforeYesterday = Date.parse('2026-03-08T07:30:00Z');
    const springGroups = groupMailRows([
      { id: 'yesterday', timestamp: springYesterday },
      { id: 'earlier', timestamp: springBeforeYesterday },
    ], springNow);
    assert.deepEqual([...springGroups.keys()], ['Yesterday', 'Earlier']);
    assert.deepEqual(springGroups.get('Yesterday').map(mailId), ['yesterday']);
    assert.deepEqual(springGroups.get('Earlier').map(mailId), ['earlier']);

    const fallNow = Date.parse('2026-11-02T12:00:00-08:00');
    const fallYesterday = Date.parse('2026-11-01T07:30:00Z');
    const fallGroups = groupMailRows([{ id: 'fall-yesterday', timestamp: fallYesterday }], fallNow);
    assert.deepEqual([...fallGroups.keys()], ['Yesterday']);
  } finally {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  }
});

test('mail dates display a useful fallback for missing timestamps', () => {
  assert.equal(formatMailTime({ timestamp: 0 }), 'Time unavailable');
});
