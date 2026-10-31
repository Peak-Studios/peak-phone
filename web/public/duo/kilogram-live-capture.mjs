import { GameCapture } from './game-capture.mjs';

/** Preserve the game viewport's aspect ratio, then center-crop for portrait live video. */
export class KilogramLiveCapture {
    constructor({ width = 360, height = 640, fps = 20, onError = () => {} } = {}) {
        this.stopped = false; this.onError = onError;
        this.fps = Math.max(5, Math.min(30, fps));
        try {
            const aspect = Math.max(.5, Math.min(4, window.innerWidth / Math.max(1, window.innerHeight)));
            const sourceHeight = Math.min(720, Math.round(960 / aspect));
            // The FiveM game texture is already oriented for this live path. The
            // shared GameCapture default is retained for the legacy video-call
            // adapter, but would turn KiloGram broadcasts upside down.
            this.raw = new GameCapture({ width: Math.round(sourceHeight * aspect), height: sourceHeight,
                fps: this.fps, invertTextureY: false, onError: error => { this.stop(); onError(error); } });
            this.canvas = document.createElement('canvas');
            this.canvas.width = width; this.canvas.height = height;
            const context = this.canvas.getContext('2d', { alpha: false });
            if (!context) throw new Error('Portrait game capture is unavailable.');
            this.context = context;
            this.last = 0;
            this.draw(performance.now());
            this.stream = this.canvas.captureStream(this.fps);
            if (!this.stream.getVideoTracks().length) throw new Error('Game video capture is unavailable.');
        } catch (error) { this.stop(); throw error; }
    }
    draw = now => {
        if (this.stopped) return;
        try {
        if (now - this.last >= 1000 / this.fps) {
            this.last = now;
            const source = this.raw.canvas;
            const ratio = this.canvas.width / this.canvas.height;
            const cropWidth = Math.min(source.width, source.height * ratio);
            const cropHeight = cropWidth / ratio;
            this.context.drawImage(source, (source.width - cropWidth) / 2, (source.height - cropHeight) / 2,
                cropWidth, cropHeight, 0, 0, this.canvas.width, this.canvas.height);
        }
        this.frame = requestAnimationFrame(this.draw);
        } catch (error) { this.stop(); this.onError(error); }
    };
    stop() {
        if (this.stopped) return;
        this.stopped = true;
        cancelAnimationFrame(this.frame);
        this.stream?.getTracks().forEach(track => track.stop());
        this.raw?.stop();
        this.canvas?.remove();
    }
}
