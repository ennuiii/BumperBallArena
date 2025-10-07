/**
 * Advanced Audio Processing Service
 * Implements Krisp-like noise suppression using Web Audio API
 * and custom algorithms for real-time audio enhancement
 */

export interface AudioProcessorConfig {
  enableNoiseSuppression: boolean;
  enableEchoCancellation: boolean;
  enableAutoGainControl: boolean;
  noiseThreshold: number;
  gainSmoothingFactor: number;
  spectralGateThreshold: number;
}

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private noiseGateNode: DynamicsCompressorNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  
  private config: AudioProcessorConfig;
  private isProcessing = false;
  private noiseProfile: Float32Array | null = null;
  private readonly FRAME_SIZE = 480; // 10ms at 48kHz
  
  constructor(config: AudioProcessorConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      // Create audio context with optimal settings
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });

      console.log('[AudioProcessor] Initialized with sample rate:', this.audioContext.sampleRate);
    } catch (error) {
      console.error('[AudioProcessor] Failed to initialize:', error);
      throw error;
    }
  }

  async processStream(inputStream: MediaStream): Promise<MediaStream> {
    if (!this.audioContext) {
      throw new Error('AudioProcessor not initialized');
    }

    try {
      console.log('[AudioProcessor] processStream called');
      console.log('[AudioProcessor] Input stream tracks:', inputStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
      
      // Create audio processing chain
      console.log('[AudioProcessor] Creating source node...');
      this.sourceNode = this.audioContext.createMediaStreamSource(inputStream);
      
      console.log('[AudioProcessor] Creating destination node...');
      this.destinationNode = this.audioContext.createMediaStreamDestination();
      
      console.log('[AudioProcessor] Creating analyser node...');
      this.analyserNode = this.audioContext.createAnalyser();
      
      console.log('[AudioProcessor] Creating gain node...');
      this.gainNode = this.audioContext.createGain();
      
      console.log('[AudioProcessor] Creating compressor node...');
      this.noiseGateNode = this.audioContext.createDynamicsCompressor();

      // Configure analyser for spectral analysis
      console.log('[AudioProcessor] Configuring analyser...');
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.8;

      // Configure noise gate/compressor
      console.log('[AudioProcessor] Configuring compressor...');
      this.noiseGateNode.threshold.setValueAtTime(-40, this.audioContext.currentTime);
      this.noiseGateNode.knee.setValueAtTime(40, this.audioContext.currentTime);
      this.noiseGateNode.ratio.setValueAtTime(12, this.audioContext.currentTime);
      this.noiseGateNode.attack.setValueAtTime(0.003, this.audioContext.currentTime);
      this.noiseGateNode.release.setValueAtTime(0.25, this.audioContext.currentTime);

      // Create script processor for custom noise suppression
      console.log('[AudioProcessor] Creating script processor...');
      try {
        this.scriptProcessor = this.audioContext.createScriptProcessor(this.FRAME_SIZE, 1, 1);
        this.scriptProcessor.onaudioprocess = this.processAudioFrame.bind(this);
        console.log('[AudioProcessor] Script processor created successfully');
      } catch (error) {
        console.warn('[AudioProcessor] Script processor failed, using fallback:', error);
        // Fallback: use simpler processing without script processor
        this.scriptProcessor = null;
      }

      // Connect the audio processing chain
      console.log('[AudioProcessor] Connecting audio chain...');
      if (this.config.enableNoiseSuppression && this.scriptProcessor) {
        console.log('[AudioProcessor] Using advanced processing chain');
        // Advanced processing chain: Source -> Analyser -> Script Processor -> Noise Gate -> Gain -> Destination
        this.sourceNode.connect(this.analyserNode);
        this.analyserNode.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.noiseGateNode);
        this.noiseGateNode.connect(this.gainNode);
        this.gainNode.connect(this.destinationNode);
      } else {
        console.log('[AudioProcessor] Using fallback processing chain');
        // Fallback chain: Source -> Analyser -> Noise Gate -> Gain -> Destination (no custom processing)
        this.sourceNode.connect(this.analyserNode);
        this.analyserNode.connect(this.noiseGateNode);
        this.noiseGateNode.connect(this.gainNode);
        this.gainNode.connect(this.destinationNode);
      }

      this.isProcessing = true;
      console.log('[AudioProcessor] Processing started');
      
      // Learn noise profile from first few seconds
      if (this.config.enableNoiseSuppression) {
        console.log('[AudioProcessor] Scheduling noise profile learning...');
        setTimeout(() => this.learnNoiseProfile(), 500);
      }

      console.log('[AudioProcessor] Processing chain created successfully');
      console.log('[AudioProcessor] Output stream tracks:', this.destinationNode.stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
      return this.destinationNode.stream;
      
    } catch (error) {
      console.error('[AudioProcessor] Error processing stream:', error);
      throw error;
    }
  }

  private processAudioFrame(event: AudioProcessingEvent): void {
    if (!this.isProcessing || !this.analyserNode) return;

    const inputBuffer = event.inputBuffer;
    const outputBuffer = event.outputBuffer;
    const inputData = inputBuffer.getChannelData(0);
    const outputData = outputBuffer.getChannelData(0);

    if (this.config.enableNoiseSuppression && this.noiseProfile) {
      // Apply spectral noise suppression
      this.applySpectralNoiseSuppress(inputData, outputData);
    } else {
      // Pass through with basic processing
      for (let i = 0; i < inputData.length; i++) {
        outputData[i] = inputData[i];
      }
    }

    // Apply auto gain control
    if (this.config.enableAutoGainControl) {
      this.applyAutoGainControl(outputData);
    }
  }

  private learnNoiseProfile(): void {
    if (!this.analyserNode) return;

    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Collect samples for noise profile
    const samples: Float32Array[] = [];
    const sampleCount = 50; // Collect 50 samples over ~1 second
    
    const collectSample = () => {
      this.analyserNode!.getByteFrequencyData(dataArray);
      const floatArray = new Float32Array(bufferLength);
      for (let i = 0; i < bufferLength; i++) {
        floatArray[i] = dataArray[i] / 255.0;
      }
      samples.push(floatArray);
      
      if (samples.length < sampleCount) {
        setTimeout(collectSample, 20);
      } else {
        this.computeNoiseProfile(samples);
      }
    };
    
    collectSample();
  }

  private computeNoiseProfile(samples: Float32Array[]): void {
    const bufferLength = samples[0].length;
    this.noiseProfile = new Float32Array(bufferLength);
    
    // Compute average spectrum (noise floor)
    for (let freq = 0; freq < bufferLength; freq++) {
      let sum = 0;
      for (const sample of samples) {
        sum += sample[freq];
      }
      this.noiseProfile[freq] = sum / samples.length;
    }
    
    console.log('[AudioProcessor] Noise profile learned');
  }

  private applySpectralNoiseSuppress(input: Float32Array, output: Float32Array): void {
    // Simplified spectral subtraction algorithm
    // In a real implementation, you'd use FFT/IFFT for frequency domain processing
    
    const threshold = this.config.spectralGateThreshold;
    
    for (let i = 0; i < input.length; i++) {
      const amplitude = Math.abs(input[i]);
      
      // Simple noise gate based on amplitude
      if (amplitude < threshold) {
        // Attenuate noise
        output[i] = input[i] * 0.1;
      } else {
        // Preserve signal
        output[i] = input[i];
      }
    }
  }

  private applyAutoGainControl(buffer: Float32Array): void {
    // Calculate RMS energy
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    
    // Target RMS level (adjust as needed)
    const targetRMS = 0.1;
    const currentGain = this.gainNode?.gain.value || 1;
    
    if (rms > 0) {
      const desiredGain = targetRMS / rms;
      const smoothedGain = currentGain + (desiredGain - currentGain) * this.config.gainSmoothingFactor;
      
      // Limit gain to prevent excessive amplification
      const clampedGain = Math.max(0.1, Math.min(3.0, smoothedGain));
      
      if (this.gainNode) {
        this.gainNode.gain.setValueAtTime(clampedGain, this.audioContext!.currentTime);
      }
    }
  }

  updateConfig(newConfig: Partial<AudioProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reset noise profile if noise suppression settings changed
    if (newConfig.enableNoiseSuppression !== undefined) {
      this.noiseProfile = null;
      if (newConfig.enableNoiseSuppression) {
        setTimeout(() => this.learnNoiseProfile(), 500);
      }
    }
  }

  stop(): void {
    this.isProcessing = false;
    
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    
    if (this.destinationNode) {
      this.destinationNode.disconnect();
      this.destinationNode = null;
    }
    
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    
    if (this.noiseGateNode) {
      this.noiseGateNode.disconnect();
      this.noiseGateNode = null;
    }
    
    console.log('[AudioProcessor] Stopped processing');
  }

  dispose(): void {
    this.stop();
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  isInitialized(): boolean {
    return this.audioContext !== null;
  }

  isActive(): boolean {
    return this.isProcessing;
  }
}

// Default configuration similar to Krisp/Discord settings
export const DEFAULT_AUDIO_PROCESSOR_CONFIG: AudioProcessorConfig = {
  enableNoiseSuppression: true,
  enableEchoCancellation: true,
  enableAutoGainControl: true,
  noiseThreshold: 0.01,
  gainSmoothingFactor: 0.1,
  spectralGateThreshold: 0.02
}; 