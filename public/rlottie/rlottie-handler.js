class RLottieHandler {
  constructor(canvasIdForModule) {
    this.rafId = 0;
    this.rlottieModule = [];
    this.curFrame = 0;
    this.playing = false; // Start paused by default
    this.playSpeed = 1;

    if (canvasIdForModule) {
      // Assumes RLottieModule is globally available
      this.rlottieModule.push(new RLottieModule(canvasIdForModule));
    } else {
      console.error("RLottieHandler Error: A valid canvasIdForModule must be provided to the constructor.");
      // Handle error case, perhaps by not pushing to rlottieModule or throwing
    }
    this.totalFrame = this.rlottieModule.length > 0 && this.rlottieModule[0] ? this.rlottieModule[0].totalFrame : 0;

    // this.relayoutCanvas(); // Canvas size should be managed by CSS or Vue component
  }

  render() {
    if (!this.playing) return; // Only render if playing

    for(let i = 0; i < this.rlottieModule.length; i++) {
      let rm = this.rlottieModule[i];
      rm.render(this.playSpeed); // RLottieModule's render should handle frame progression
      if(rm.curFrame >= rm.totalFrame && rm.totalFrame > 0) rm.curFrame = 0; // Loop
    }
    if (this.rlottieModule.length > 0) {
        this.curFrame = this.rlottieModule[0].curFrame;
    }
    // DOM updates for frame number and slider removed
  }

  reload(jsString) {
    this.pause(); // Pause before reloading
    this.rlottieModule.forEach(rm => {
      rm.lottieHandle.load(jsString)
      rm.totalFrame = rm.lottieHandle.frames();
      rm.curFrame = 0;
    });

    this.jsString = jsString;
    this.totalFrame = this.rlottieModule.length > 0 ? this.rlottieModule[0].totalFrame : 0;
    this.curFrame = 0;
    this.playing = false; // Stay paused after reload, let user initiate play
    
    // DOM updates for frame count, slider, and play button removed
    // Call a single render to show the first frame
    if (this.rlottieModule.length > 0) {
        this.rlottieModule.forEach(rm => rm.render(this.playSpeed));
    }
  }

  play() {
    if(this.playing || !this.rlottieModule || this.rlottieModule.length === 0) return;
    this.playing = true;
    // Ensure all modules are at the current frame before starting animation loop
    this.rlottieModule.forEach(rm => rm.curFrame = this.curFrame);
    // The main `updater` function in index.js will call this.render() via requestAnimationFrame
    // So, no need to directly call window.requestAnimationFrame here if `updater` is running.
    // If `updater` in index.js is stopped/started based on play/pause, that's fine.
    // For now, let's assume `updater` in `index.js` is always running and `this.render` respects `this.playing`.
  }

  pause() {
    // window.cancelAnimationFrame(this.rafId); // rafId is managed by global updater in index.js
    this.playing = false;
  }

  // update() method was for manual frame stepping, not essential for basic playback
  // and could conflict with render loop. Removing for simplification.
  // update() {
  //   this.curFrame -= this.playSpeed;
  //   this.rlottieModule.forEach(rm => rm.curFrame = this.curFrame);
  //   this.render(); // This would be a single frame render
  // }

  seek(value) {
    value = Number(value);
    if (value < 0) value = 0;
    if (value >= this.totalFrame && this.totalFrame > 0) value = this.totalFrame - 1;
    
    this.curFrame = value;
    this.rlottieModule.forEach(rm => {
      rm.curFrame = value;
      // Render the single frame after seeking
      rm.render(0); // Pass 0 for playspeed to render current frame without advancing
    });
    // DOM update for current frame removed
  }

  // relayoutCanvas is simplified as canvas size should be controlled externally (CSS/Vue)
  // This method could be used if the WASM module needs to be explicitly told about canvas size changes.
  // For now, it's a no-op or minimal.
  relayoutCanvas() {
    // const canvas = document.getElementById('myCanvas1');
    // if (canvas && this.rlottieModule && this.rlottieModule[0]) {
    //   this.rlottieModule[0].lottieHandle.resize(canvas.width, canvas.height);
    // }
    // Actual resizing logic removed as it depended on non-existent 'player' element
    // and external CSS/component should manage canvas dimensions.
  }

  resize(width, height) {
    if (!this.rlottieModule || this.rlottieModule.length === 0) {
      console.warn("RLottieHandler: No rlottie modules available to resize.");
      return;
    }
    // Assuming all modules should be resized to the same dimensions for now,
    // as we are primarily dealing with a single canvas setup ('myCanvas1').
    this.rlottieModule.forEach(rm => {
      if (rm.canvas) {
        rm.canvas.width = width;
        rm.canvas.height = height;
      }
      // The RlottieWasm instance (rm.lottieHandle) does not have a .resize() method.
      // Canvas dimensions are updated on rm.canvas and used by rm.lottieHandle.render().
    });
    // After resizing, it's good to render the current frame immediately
    // if an animation is loaded, to reflect the new size.
    if (this.totalFrame > 0 && this.rlottieModule.length > 0 && this.rlottieModule[0].lottieHandle) {
        // Ensure curFrame is valid before seeking
        const currentFrame = Math.max(0, Math.min(this.curFrame, this.totalFrame -1));
        this.seek(currentFrame); // Re-render current frame at new size
    } else {
        console.log("RLottieHandler.resize: No animation loaded or lottieHandle not ready, skipping seek/render.");
    }
  }

  // Method to get current animation properties, useful for the API
  getAnimationProperties() {
    return {
      currentTime: this.curFrame,
      totalTime: this.totalFrame,
      isPlaying: this.playing,
      playSpeed: this.playSpeed
    };
  }

  setPlaySpeed(speed) {
    this.playSpeed = Number(speed);
    if (this.playSpeed <= 0) this.playSpeed = 1; // Ensure positive speed
  }
}
window.RLottieHandler = RLottieHandler;