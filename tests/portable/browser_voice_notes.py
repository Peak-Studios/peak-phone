"""WebM recorder lifecycle using a synthetic Web Audio track, not a physical microphone."""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[2]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page();page.set_content('<html><body></body></html>');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_script_tag(content=(R/'web/public/duo/voice-notes.js').read_text())
 result=page.evaluate('''async()=>{
 const results=[];function check(name,ok){results.push({name,passed:!!ok});if(!ok)throw Error(name);}
 const context=new AudioContext();const oscillator=context.createOscillator();oscillator.frequency.value=440;
 const destination=context.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();await context.resume();
 const chunks=[];const recorder=PeakDuoVoiceNotes.recorder(destination.stream);recorder.addEventListener('dataavailable',e=>chunks.push(e.data));
 const stopped=new Promise(resolve=>recorder.addEventListener('stop',resolve));recorder.start();await new Promise(r=>setTimeout(r,300));
 check('Recorder uses audio-only synthetic track',destination.stream.getVideoTracks().length===0&&destination.stream.getAudioTracks().length===1);
 check('Recorder encodes Opus WebM',recorder.mimeType.includes('audio/webm')&&recorder.mimeType.includes('opus'));
 recorder.stop();await stopped;
 const encoded=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'audio/webm'}));});
 check('Voice-note data matches retained message format',/^data:audio\\/webm;base64,GkXf[A-Za-z0-9+/=]+$/.test(encoded));
 check('Normal stop releases microphone tracks',destination.stream.getTracks().every(t=>t.readyState==='ended'));
 const d2=context.createMediaStreamDestination();oscillator.connect(d2);const r2=PeakDuoVoiceNotes.recorder(d2.stream);let sent=false;r2.onstop=()=>{sent=true;};r2.start();PeakDuoVoiceNotes.cancel();await new Promise(r=>setTimeout(r,80));
 check('Cancellation prevents legacy onstop send callback',!sent);
 check('Cancellation releases audio tracks',d2.stream.getTracks().every(t=>t.readyState==='ended')&&r2.state==='inactive');
 PeakDuoVoiceNotes.cancel();check('Repeated cancellation is safe',true);
 oscillator.stop();await context.close();return {passed:results.length,results,physicalMicrophoneTested:false,liveFiveM:false};
 }''')
 result['pageErrors']=errors;assert not errors
 (R/'artifacts/portable/browser-voice-notes-results.json').parent.mkdir(parents=True,exist_ok=True);(R/'artifacts/portable/browser-voice-notes-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
