/** FiveM's shared game render texture -> WebGL canvas -> real MediaStream.
 * Hook ABI: citizenfx/fivem GameView.utils.ts, 0d8a2a6f78a9922445d8930305af82a7b1826980.
 * No screenshots over net events, desktop chooser, webcam, or video of another player's ped.
 */
export function gameCaptureUV(invertTextureY=true) {
  return invertTextureY?[0,1,1,1,0,0,1,0]:[0,0,1,0,0,1,1,1];
}
export class GameCapture {
  constructor({width=640,height=360,fps=20,invertTextureY=true,onError=()=>{}}={}) {
    if(typeof globalThis.GetParentResourceName!=='function') throw Error('Game capture is available only inside FiveM.');
    this.onError=onError;this.stopped=false;this.enabled=true;this.started=performance.now();this.last=0;this.samples=0;this.validated=false;
    this.width=Math.min(1280,Math.max(160,Number(width)||640));this.height=Math.min(720,Math.max(90,Number(height)||360));this.fps=Math.min(30,Math.max(5,Number(fps)||20));this.invertTextureY=!!invertTextureY;
    this.canvas=document.createElement('canvas');this.canvas.width=this.width;this.canvas.height=this.height;
    this.canvas.setAttribute('aria-hidden','true');this.canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';document.body.append(this.canvas);
    this.contextLost=e=>{e.preventDefault();this.fail(Error('The game capture graphics context was lost.'));};
    this.canvas.addEventListener('webglcontextlost',this.contextLost);
    try {this.initialize();this.stream=this.canvas.captureStream(this.fps);if(!this.stream.getVideoTracks().length)throw Error('This FiveM browser does not support canvas video capture.');this.tick(performance.now());}
    catch(error){this.stop();throw error;}
  }
  initialize(){
    const gl=this.gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    if(!gl||typeof this.canvas.captureStream!=='function')throw Error('WebGL / canvas.captureStream is unavailable in this FiveM client.');
    this.shaders=[];this.buffers=[];
    const shader=(type,source)=>{const s=gl.createShader(type);this.shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Game capture shader compilation failed.');return s;};
    const program=this.program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p; attribute vec2 uv; varying vec2 v; void main(){gl_Position=vec4(p,0.,1.);v=uv;}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float; varying vec2 v; uniform sampler2D frame; void main(){gl_FragColor=texture2D(frame,v);}'));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Game capture shader link failed.');gl.useProgram(program);
    const attribute=(name,values)=>{const b=gl.createBuffer();this.buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);};
    attribute('p',[-1,-1,1,-1,-1,1,1,1]);attribute('uv',gameCaptureUV(this.invertTextureY));
    this.texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,255,255]));
    gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    for(const mode of [gl.CLAMP_TO_EDGE,gl.MIRRORED_REPEAT,gl.REPEAT,gl.CLAMP_TO_EDGE])gl.texParameterf(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,mode);
    gl.uniform1i(gl.getUniformLocation(program,'frame'),0);gl.viewport(0,0,this.width,this.height);
  }
  tick=(now)=>{
    if(this.stopped)return;
    try {
      if(now-this.last>=1000/this.fps){this.last=now;if(this.enabled){
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP,0,4);this.gl.flush();
        // Fail closed if the native texture hook did not replace our diagnostic 1x1 blue texture.
        if(!this.validated&&now-this.started>700){const pixel=new Uint8Array(4);this.gl.readPixels(this.width>>1,this.height>>1,1,1,this.gl.RGBA,this.gl.UNSIGNED_BYTE,pixel);
          if(pixel[0]!==0||pixel[1]!==0||pixel[2]!==255)this.validated=true;
          else if(++this.samples>this.fps*3)throw Error('FiveM game texture is unavailable. Update the client/artifact and verify GPU capture.');}
      }else {this.gl.clearColor(0,0,0,1);this.gl.clear(this.gl.COLOR_BUFFER_BIT);}}
      this.animationFrame=requestAnimationFrame(this.tick);
    }catch(error){this.fail(error);}
  };
  setEnabled(value){this.enabled=!!value;if(this.stream)for(const track of this.stream.getVideoTracks())track.enabled=this.enabled;}
  fail(error){if(this.stopped)return;this.stop();this.onError(error);}
  stop(){if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.animationFrame);this.stream?.getTracks().forEach(t=>t.stop());
    this.canvas?.removeEventListener('webglcontextlost',this.contextLost);
    if(this.gl){this.buffers?.forEach(b=>this.gl.deleteBuffer(b));this.shaders?.forEach(s=>this.gl.deleteShader(s));if(this.program)this.gl.deleteProgram(this.program);if(this.texture)this.gl.deleteTexture(this.texture);}
    this.canvas?.remove();
  }
}
