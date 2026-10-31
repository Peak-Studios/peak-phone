/* Bounded microphone recordings for the retained Messages UI. No webcam capture. */
(()=>{'use strict';let current=null;
 function cancel(){const v=current;current=null;if(!v)return;clearTimeout(v.timer);v.recorder.onstop=null;if(v.recorder.state!=='inactive')v.recorder.stop();v.stream.getTracks().forEach(t=>t.stop());}
 function recorder(stream){cancel();const mime='audio/webm;codecs=opus';if(!MediaRecorder.isTypeSupported(mime)){stream.getTracks().forEach(t=>t.stop());throw Error('WebM/Opus voice notes are not available in this FiveM browser.');}
  const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:24000});const entry=current={recorder,stream};
  recorder.addEventListener('start',()=>{entry.timer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},15000);});
  recorder.addEventListener('stop',()=>{clearTimeout(entry.timer);stream.getTracks().forEach(t=>t.stop());if(current===entry)current=null;});
  return recorder;
 }
 Object.defineProperty(window,'PeakDuoVoiceNotes',{value:Object.freeze({recorder,cancel}),writable:false});
})();
