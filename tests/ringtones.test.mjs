import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRingtones,ringtoneId,resolveRingtone,settingsRingtoneOptions} from '../web/public/duo/ringtones.mjs';

test('Settings exposes the shipped ringtone catalog and validated configured tones',()=>{
 const options=settingsRingtoneOptions([
  {id:'studio-bell',label:'Studio Bell'},
  {id:'custom',label:'Unsafe generic option'},
  {id:'bad id',label:'Unsafe ID'},
  {id:'duplicate',label:'Duplicate'},
  {id:'duplicate',label:'Duplicate again'},
  {id:'duplicate-tone',label:'  '},
  {id:'tone-with-controls',label:'Safe\nlabel'},
  {id:'default',label:'Replacement Peak Classic'},
 ]);
 assert.deepEqual(options.map(tone=>tone.id),[...defaultRingtones.map(tone=>tone.id),'studio-bell','duplicate','tone-with-controls']);
 assert.equal(options.at(-1).label,'Safe label');
 assert.equal(options.some(tone=>tone.label==='Still D.R.E.'),false);
});

test('legacy ringtone preference values retain their shipped audio aliases',()=>{
 assert.equal(ringtoneId('phone.phoneRing'),'default');
 assert.equal(ringtoneId('ringtones.seaside'),'seaside');
 assert.equal(ringtoneId('ringtones.stilldre'),'pulse');
 assert.equal(resolveRingtone('ringtones.stilldre'),'ringtones/pulse.wav');
});
