'use strict';
// coturn's TURN REST HMAC credentials. This file runs on FXServer, never in NUI.
const crypto = require('node:crypto');
function credentials(secret, urls, ttl, now = Math.floor(Date.now()/1000)) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Use a TURN shared secret of at least 32 characters.');
  if (!Array.isArray(urls) || !urls.length || urls.length > 8 || urls.some(u => typeof u !== 'string' || !/^turns?:[^\s@/]+(?::\d+)?(?:\?transport=(?:udp|tcp))?$/.test(u))) throw new Error('Invalid coturn relay URLs.');
  ttl = Math.max(120, Math.min(14400, Number(ttl) || 3720));
  const username = `${now + ttl}:${crypto.randomBytes(12).toString('hex')}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { iceServers: [{ urls, username, credential }], expiresAt: now + ttl };
}
if (typeof GetCurrentResourceName === 'function') {
  global.exports('PeakPhoneCoturnCredentials', ttl => {
    if (GetInvokingResource() !== GetCurrentResourceName()) throw new Error('Phone-internal export.');
    return credentials(GetConvar('phone_turn_shared_secret',''), JSON.parse(GetConvar('phone_turn_urls','[]')), ttl);
  });
} else module.exports={credentials};
