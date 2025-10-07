// Virtual Background Service - MediaPipe Implementation

import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

// Type declarations for MediaStreamTrackProcessor API
declare global {
  interface Window {
    MediaStreamTrackProcessor: typeof MediaStreamTrackProcessor;
    MediaStreamTrackGenerator: typeof MediaStreamTrackGenerator;
  }
}

interface MediaStreamTrackProcessor<T = VideoFrame> {
  readable: ReadableStream<T>;
}

interface MediaStreamTrackProcessorInit {
  track: MediaStreamTrack;
}

interface MediaStreamTrackGenerator<T = VideoFrame> extends MediaStreamTrack {
  writable: WritableStream<T>;
}

interface MediaStreamTrackGeneratorInit {
  kind: 'video' | 'audio';
}

declare const MediaStreamTrackProcessor: {
  prototype: MediaStreamTrackProcessor;
  new (init: MediaStreamTrackProcessorInit): MediaStreamTrackProcessor;
};

declare const MediaStreamTrackGenerator: {
  prototype: MediaStreamTrackGenerator;
  new (init: MediaStreamTrackGeneratorInit): MediaStreamTrackGenerator;
};

export interface VirtualBackgroundConfig {
  model: string;
  segmentationThreshold: number;
  backgroundImageUrl?: string;
  blurAmount?: number;
  useBlur?: boolean;
  edgeSmoothing?: number; // Edge smoothing amount (0-20)
  temporalSmoothing?: number; // Temporal smoothing factor (0-1)
  maskBlur?: number; // Mask blur amount (0-10)
  erosionSize?: number; // Erosion for removing noise (0-5)
  dilationSize?: number; // Dilation for filling gaps (0-5)
  adaptiveThreshold?: boolean; // Use adaptive thresholding
  hairRefinement?: boolean; // Special processing for hair edges
  minContourArea?: number; // Minimum area for person detection
}

export const DEFAULT_BACKGROUNDS = [
  { name: 'Office', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&h=720&fit=crop&crop=center' },
  { name: 'Nature', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1280&h=720&fit=crop&crop=center' },
  { name: 'Library', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1280&h=720&fit=crop&crop=center' },
  { name: 'Coffee Shop', url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1280&h=720&fit=crop&crop=center' },
];

export class VirtualBackgroundService {
  private config: VirtualBackgroundConfig;
  private isActive = false;
  private trackProcessor: MediaStreamTrackProcessor<VideoFrame> | null = null;
  private trackGenerator: MediaStreamTrackGenerator<VideoFrame> | null = null;
  private processingController: AbortController | null = null;
  private trackWriter: WritableStreamDefaultWriter<VideoFrame> | null = null;
  
  // MediaPipe components
  private imageSegmenter: ImageSegmenter | null = null;
  private isInitialized = false;
  
  // Canvas elements for processing
  private tempCanvas: OffscreenCanvas | null = null;
  private tempCtx: OffscreenCanvasRenderingContext2D | null = null;
  private outputCanvas: OffscreenCanvas | null = null;
  private outputCtx: OffscreenCanvasRenderingContext2D | null = null;
  private backgroundImage: ImageBitmap | null = null;
  
  // Processing state
  private isProcessing = false;
  
  // Edge improvement
  private previousMask: ImageData | null = null;
  private maskCanvas: OffscreenCanvas | null = null;
  private maskCtx: OffscreenCanvasRenderingContext2D | null = null;

  constructor(config: VirtualBackgroundConfig) {
    this.config = config;
  }

  public async initialize(): Promise<void> {
    console.log('[Service] ========== INITIALIZING VIRTUAL BACKGROUND SERVICE ==========');
    console.log('[Service] Step 1: Initializing MediaPipe...');
    
    try {
      // Initialize MediaPipe FilesetResolver
      console.log('[Service] Creating FilesetResolver...');
      const vision = await FilesetResolver.forVisionTasks(import.meta.env.BASE_URL + 'wasm');
      console.log('[Service] FilesetResolver created successfully');

      // Create ImageSegmenter
      console.log('[Service] Creating ImageSegmenter...');
      this.imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: import.meta.env.BASE_URL + 'models/selfie_segmenter.tflite',
          delegate: 'GPU' // Use GPU acceleration if available
        },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: true // Enable confidence masks for better edge quality
      });
      
      console.log('[Service] ImageSegmenter created successfully');
      
      // Load background image if specified
      if (this.config.backgroundImageUrl) {
        await this.loadBackgroundImage(this.config.backgroundImageUrl);
      }
      
      this.isInitialized = true;
      console.log('[Service] ========== INITIALIZATION COMPLETE ==========');
      
    } catch (error) {
      console.error('[Service] ========== INITIALIZATION FAILED ==========');
      console.error('[Service] Error:', error);
      throw error;
    }
  }

  public async setupAndStart(inputStream: MediaStream): Promise<MediaStream> {
    console.log('[Service] Setting up virtual background...');
    
    if (!this.isInitialized || !this.imageSegmenter) {
      throw new Error('Service not initialized');
    }

    // Check for MediaStreamTrackProcessor support
    if (!('MediaStreamTrackProcessor' in window) || !('MediaStreamTrackGenerator' in window)) {
      console.warn('[Service] MediaStreamTrackProcessor not supported');
      throw new Error('Browser does not support required APIs for virtual background');
    }

    // Get video track
    const videoTrack = inputStream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error('No video track found');
    }

    // Create processor and generator
    this.trackProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
    this.trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });
    
    // Get writer for the generator
    this.trackWriter = this.trackGenerator.writable.getWriter();
    
    // Start processing
    this.isActive = true;
    this.startStreamProcessing();
    
    // Create output stream with processed video and original audio
    const audioTracks = inputStream.getAudioTracks();
    const outputStream = new MediaStream([this.trackGenerator, ...audioTracks]);
    
    console.log('[Service] Virtual background setup complete');
    return outputStream;
  }

  private async startStreamProcessing(): Promise<void> {
    if (!this.trackProcessor) return;

    this.processingController = new AbortController();
    const reader = this.trackProcessor.readable.getReader();

    try {
      while (this.isActive && !this.processingController.signal.aborted) {
        const { done, value: videoFrame } = await reader.read();
        
        if (done) break;
        
        // Process frame directly
        await this.processVideoFrame(videoFrame);
      }
    } catch (error) {
      if (!this.processingController.signal.aborted) {
        console.error('[Service] Stream processing error:', error);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private preprocessFrame(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
    try {
      // Get image data
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      // Apply slight contrast enhancement to improve segmentation
      const contrast = 1.1; // Slight contrast boost
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      
      for (let i = 0; i < data.length; i += 4) {
        // Apply contrast to RGB channels
        data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));     // R
        data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128)); // G
        data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128)); // B
      }
      
      // Put the processed data back
      ctx.putImageData(imageData, 0, 0);
      
    } catch (error) {
      console.error('[Service] Error preprocessing frame:', error);
    }
  }

  private async processVideoFrame(videoFrame: VideoFrame): Promise<void> {
    if (!this.imageSegmenter || this.isProcessing) {
      videoFrame.close();
      return;
    }

    try {
      this.isProcessing = true;

      // Use higher resolution for better quality (up to 1280x720)
      // codedWidth/codedHeight is the actual encoded resolution, often higher than displayWidth/displayHeight
      const width = Math.min(videoFrame.codedWidth || videoFrame.displayWidth, 1280);
      const height = Math.min(videoFrame.codedHeight || videoFrame.displayHeight, 720);

      if (!this.tempCanvas || this.tempCanvas.width !== width || this.tempCanvas.height !== height) {
        this.tempCanvas = new OffscreenCanvas(width, height);
        this.tempCtx = this.tempCanvas.getContext('2d');
        this.outputCanvas = new OffscreenCanvas(width, height);
        this.outputCtx = this.outputCanvas.getContext('2d');
        this.maskCanvas = new OffscreenCanvas(width, height);
        this.maskCtx = this.maskCanvas.getContext('2d');
      }

      if (!this.tempCtx || !this.outputCtx) {
        throw new Error('Failed to get 2D context');
      }

      // Draw video frame to temporary canvas
      this.tempCtx.drawImage(videoFrame, 0, 0, width, height);

      // Pre-process the frame for better segmentation
      this.preprocessFrame(this.tempCtx, width, height);

      // Run segmentation
      const result = this.imageSegmenter.segment(this.tempCanvas);
      
      // Process the results
      this.processSegmentationResults(result, width, height);

      // Create VideoFrame from the processed canvas
      if (!this.outputCanvas) {
        throw new Error('Output canvas not available');
      }
      
      const processedFrame = new VideoFrame(this.outputCanvas, {
        timestamp: videoFrame.timestamp,
        alpha: 'discard'
      });

      // Send the processed frame
      await this.handleProcessedFrame(processedFrame);

    } catch (error) {
      console.error('[Service] Error processing video frame:', error);
    } finally {
      this.isProcessing = false;
      videoFrame.close();
    }
  }

  private processSegmentationResults(result: any, width: number, height: number): void {
    if (!this.outputCtx || !this.tempCanvas || !this.maskCtx || !this.maskCanvas) {
      console.error('[Service] Missing required resources for processing results');
      return;
    }

    try {
      // Clear canvases
      this.outputCtx.clearRect(0, 0, width, height);
      this.maskCtx.clearRect(0, 0, width, height);

      // Create enhanced mask using both category and confidence masks
      const enhancedMask = this.createEnhancedMask(result, width, height);
      if (!enhancedMask) return;

      // Apply temporal smoothing to reduce flickering
      const smoothedMask = this.applyTemporalSmoothing(enhancedMask, width, height);

      // Apply the smoothed mask to create the final composite
      this.applyMaskComposite(smoothedMask, width, height);

    } catch (error) {
      console.error('[Service] Error processing segmentation results:', error);
    }
  }

  private createEnhancedMask(result: any, width: number, height: number): ImageData | null {
    if (!this.maskCtx || !this.maskCanvas) return null;

    try {
      // Get masks from MediaPipe
      const categoryMask = result.categoryMask;
      const confidenceMasks = result.confidenceMasks;

      if (!categoryMask) {
        console.error('[Service] No category mask in results');
        return null;
      }

      // Create base mask from category data
      const categoryData = categoryMask.getAsUint8Array();
      const maskImageData = this.maskCtx.createImageData(width, height);

      // Use adaptive thresholding if enabled
      const useAdaptive = this.config.adaptiveThreshold ?? true;
      const baseThreshold = this.config.segmentationThreshold || 0.6;

      // Use confidence mask if available for better edge quality
      if (confidenceMasks && confidenceMasks.length > 0) {
        const confidenceData = confidenceMasks[0].getAsFloat32Array();
        
        // Calculate adaptive threshold based on confidence distribution
        let avgConfidence = 0;
        let personPixelCount = 0;
        
        if (useAdaptive) {
          for (let i = 0; i < categoryData.length; i++) {
            if (categoryData[i] === 0) { // Person pixel
              avgConfidence += confidenceData[i];
              personPixelCount++;
            }
          }
          avgConfidence = personPixelCount > 0 ? avgConfidence / personPixelCount : baseThreshold;
        }
        
        const adaptiveThreshold = useAdaptive ? avgConfidence * 0.7 : baseThreshold;
        
        for (let i = 0; i < categoryData.length; i++) {
          const isPerson = categoryData[i] === 0; // 0 = person, >0 = background
          const confidence = confidenceData[i] || 0;
          const pixelIndex = i * 4;
          
          // Enhanced alpha calculation with adaptive thresholding
          let alpha = 0;
          if (isPerson) {
            if (confidence > adaptiveThreshold) {
              // Strong person pixel
              alpha = 255;
            } else if (confidence > adaptiveThreshold * 0.5) {
              // Edge pixel - use smooth transition
              const normalizedConf = (confidence - adaptiveThreshold * 0.5) / (adaptiveThreshold * 0.5);
              alpha = Math.round(normalizedConf * 255);
            }
            // else alpha remains 0 (background)
          }
          
          maskImageData.data[pixelIndex] = 255;     // R
          maskImageData.data[pixelIndex + 1] = 255; // G  
          maskImageData.data[pixelIndex + 2] = 255; // B
          maskImageData.data[pixelIndex + 3] = alpha; // A
        }
      } else {
        // Fallback to category mask only
        for (let i = 0; i < categoryData.length; i++) {
          const isPerson = categoryData[i] === 0;
          const pixelIndex = i * 4;
          
          maskImageData.data[pixelIndex] = 255;     // R
          maskImageData.data[pixelIndex + 1] = 255; // G
          maskImageData.data[pixelIndex + 2] = 255; // B
          maskImageData.data[pixelIndex + 3] = isPerson ? 255 : 0; // A
        }
      }

      // Put the initial mask on the mask canvas
      this.maskCtx.putImageData(maskImageData, 0, 0);

      // Apply morphological operations for better segmentation
      this.applyMorphologicalOperations(width, height);

      // Apply hair refinement if enabled
      if (this.config.hairRefinement ?? true) {
        this.refineHairEdges(width, height);
      }

      // Apply edge smoothing if configured
      const edgeSmoothing = this.config.edgeSmoothing || 2;
      const maskBlur = this.config.maskBlur || 1.5; // Slightly increased for better quality

      if (edgeSmoothing > 0 || maskBlur > 0) {
        // Use canvas filter for performance (GPU-accelerated)
        this.maskCtx.filter = `blur(${maskBlur}px)`;
        this.maskCtx.drawImage(this.maskCanvas, 0, 0);
        this.maskCtx.filter = 'none';
      }

      return this.maskCtx.getImageData(0, 0, width, height);

    } catch (error) {
      console.error('[Service] Error creating enhanced mask:', error);
      return null;
    }
  }

  private applyMorphologicalOperations(width: number, height: number): void {
    if (!this.maskCtx || !this.maskCanvas) return;

    const erosionSize = this.config.erosionSize || 1;
    const dilationSize = this.config.dilationSize || 1;

    // Get current mask data
    const imageData = this.maskCtx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Apply erosion to remove noise
    if (erosionSize > 0) {
      const erodedData = new Uint8ClampedArray(data);
      
      for (let y = erosionSize; y < height - erosionSize; y++) {
        for (let x = erosionSize; x < width - erosionSize; x++) {
          const idx = (y * width + x) * 4 + 3; // Alpha channel
          
          // Check if any neighbor is background
          let hasBackgroundNeighbor = false;
          for (let dy = -erosionSize; dy <= erosionSize; dy++) {
            for (let dx = -erosionSize; dx <= erosionSize; dx++) {
              const neighborIdx = ((y + dy) * width + (x + dx)) * 4 + 3;
              if (data[neighborIdx] < 128) {
                hasBackgroundNeighbor = true;
                break;
              }
            }
            if (hasBackgroundNeighbor) break;
          }
          
          if (hasBackgroundNeighbor) {
            erodedData[idx] = 0;
          }
        }
      }
      
      // Copy eroded data back
      for (let i = 3; i < data.length; i += 4) {
        data[i] = erodedData[i];
      }
    }

    // Apply dilation to fill gaps
    if (dilationSize > 0) {
      const dilatedData = new Uint8ClampedArray(data);
      
      for (let y = dilationSize; y < height - dilationSize; y++) {
        for (let x = dilationSize; x < width - dilationSize; x++) {
          const idx = (y * width + x) * 4 + 3; // Alpha channel
          
          // Check if any neighbor is person
          let hasPersonNeighbor = false;
          for (let dy = -dilationSize; dy <= dilationSize; dy++) {
            for (let dx = -dilationSize; dx <= dilationSize; dx++) {
              const neighborIdx = ((y + dy) * width + (x + dx)) * 4 + 3;
              if (data[neighborIdx] > 128) {
                hasPersonNeighbor = true;
                break;
              }
            }
            if (hasPersonNeighbor) break;
          }
          
          if (hasPersonNeighbor) {
            dilatedData[idx] = 255;
          }
        }
      }
      
      // Copy dilated data back
      for (let i = 3; i < data.length; i += 4) {
        data[i] = dilatedData[i];
      }
    }

    // Put the processed data back
    this.maskCtx.putImageData(imageData, 0, 0);
  }

  private refineHairEdges(width: number, height: number): void {
    if (!this.maskCtx || !this.maskCanvas || !this.tempCtx) return;

    try {
      // Get mask and original image data
      const maskData = this.maskCtx.getImageData(0, 0, width, height);
      const originalData = this.tempCtx.getImageData(0, 0, width, height);

      // Optimized single-pass edge detection
      for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
          const idx = (y * width + x) * 4;
          const alphaIdx = idx + 3;

          // Only process edge pixels
          if (maskData.data[alphaIdx] > 50 && maskData.data[alphaIdx] < 200) {
            // Get pixel color
            const r = originalData.data[idx];
            const g = originalData.data[idx + 1];
            const b = originalData.data[idx + 2];

            // Fast hair color detection
            const isDarkHair = r < 80 && g < 80 && b < 80;
            const isLightHair = r > 150 && g > 130 && b > 100 && Math.abs(r - g) < 30;

            // Quick variance check in 2x2 neighborhood (much faster)
            let colorVariance = 0;
            let avgR = 0, avgG = 0, avgB = 0;

            // Only check immediate neighbors for speed
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
                avgR += originalData.data[neighborIdx];
                avgG += originalData.data[neighborIdx + 1];
                avgB += originalData.data[neighborIdx + 2];
              }
            }

            avgR /= 9;
            avgG /= 9;
            avgB /= 9;

            // Calculate variance
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
                const dr = originalData.data[neighborIdx] - avgR;
                const dg = originalData.data[neighborIdx + 1] - avgG;
                const db = originalData.data[neighborIdx + 2] - avgB;
                colorVariance += dr * dr + dg * dg + db * db;
              }
            }

            colorVariance /= 9;

            // Adaptive threshold based on hair color
            const varianceThreshold = (isDarkHair || isLightHair) ? 400 : 600;

            // High variance suggests hair or fine details
            if (colorVariance > varianceThreshold) {
              // Enhance alpha for hair-like regions
              const enhancementFactor = isDarkHair ? 1.3 : 1.2;
              maskData.data[alphaIdx] = Math.min(255, maskData.data[alphaIdx] * enhancementFactor);
            }
          }
        }
      }

      // Put refined mask back
      this.maskCtx.putImageData(maskData, 0, 0);

    } catch (error) {
      console.error('[Service] Error refining hair edges:', error);
    }
  }

  private applyTemporalSmoothing(currentMask: ImageData, width: number, height: number): ImageData {
    const temporalSmoothing = this.config.temporalSmoothing || 0.4; // Reduced from 0.7 to 0.4 for less motion blur

    if (!this.previousMask || temporalSmoothing === 0) {
      this.previousMask = new ImageData(
        new Uint8ClampedArray(currentMask.data),
        width,
        height
      );
      return currentMask;
    }

    // Motion-adaptive temporal smoothing - detect movement and reduce smoothing during motion
    const smoothedData = new Uint8ClampedArray(currentMask.data.length);

    // Calculate overall motion (difference between frames)
    let totalDiff = 0;
    let pixelCount = 0;

    for (let i = 3; i < currentMask.data.length; i += 4) {
      const currentAlpha = currentMask.data[i];
      const previousAlpha = this.previousMask.data[i];
      totalDiff += Math.abs(currentAlpha - previousAlpha);
      pixelCount++;
    }

    const avgDiff = totalDiff / pixelCount;

    // Reduce smoothing during motion (higher diff = more motion = less smoothing)
    // Motion threshold: if avgDiff > 10, we're moving significantly
    const motionFactor = Math.min(1, avgDiff / 20); // 0-1 scale
    const adaptiveSmoothing = temporalSmoothing * (1 - motionFactor * 0.6); // Reduce up to 60% during motion

    for (let i = 0; i < currentMask.data.length; i += 4) {
      // Only smooth the alpha channel (mask data)
      smoothedData[i] = currentMask.data[i];         // R
      smoothedData[i + 1] = currentMask.data[i + 1]; // G
      smoothedData[i + 2] = currentMask.data[i + 2]; // B

      // Temporal smoothing on alpha channel with motion adaptation
      const currentAlpha = currentMask.data[i + 3];
      const previousAlpha = this.previousMask.data[i + 3];
      smoothedData[i + 3] = Math.round(
        previousAlpha * adaptiveSmoothing + currentAlpha * (1 - adaptiveSmoothing)
      );
    }

    const smoothedMask = new ImageData(smoothedData, width, height);

    // Update previous mask for next frame
    this.previousMask = new ImageData(
      new Uint8ClampedArray(smoothedMask.data),
      width,
      height
    );

    return smoothedMask;
  }

  private applyMaskComposite(mask: ImageData, width: number, height: number): void {
    if (!this.outputCtx || !this.tempCanvas) return;

    try {
      // Put the smoothed mask on output canvas
      this.outputCtx.putImageData(mask, 0, 0);

      // Apply person layer with mask
      this.outputCtx.globalCompositeOperation = 'source-in';
      this.outputCtx.drawImage(this.tempCanvas, 0, 0, width, height);

      // Apply background layer
      this.outputCtx.globalCompositeOperation = 'destination-over';

      if (this.config.useBlur && this.tempCanvas) {
        // Apply blur effect to background
        this.outputCtx.filter = `blur(${this.config.blurAmount || 10}px)`;
        this.outputCtx.drawImage(this.tempCanvas, 0, 0, width, height);
        this.outputCtx.filter = 'none';
      } else if (this.backgroundImage) {
        // Use custom background image
        this.outputCtx.drawImage(this.backgroundImage, 0, 0, width, height);
      } else {
        // Use solid color background
        this.outputCtx.fillStyle = '#1a1a1a';
        this.outputCtx.fillRect(0, 0, width, height);
      }

      // Reset composite operation
      this.outputCtx.globalCompositeOperation = 'source-over';

    } catch (error) {
      console.error('[Service] Error applying mask composite:', error);
    }
  }

  private async loadBackgroundImage(url: string): Promise<void> {
    try {
      console.log('[Service] Loading background image:', url);
      
      let blob: Blob;
      if (url.startsWith('data:image/')) {
        // Handle data URL
        const response = await fetch(url);
        blob = await response.blob();
      } else {
        // Handle regular URL
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        blob = await response.blob();
      }
      
      this.backgroundImage = await createImageBitmap(blob);
      console.log('[Service] Background image loaded successfully');
    } catch (error) {
      console.error('[Service] Failed to load background image:', error);
      this.backgroundImage = null;
    }
  }

  private async handleProcessedFrame(videoFrame: VideoFrame): Promise<void> {
    if (this.trackWriter && this.isActive) {
      try {
        await this.trackWriter.write(videoFrame);
      } catch (error) {
        console.error('[Service] Error writing frame:', error);
        videoFrame.close();
      }
    } else {
      videoFrame.close();
    }
  }

  public async updateConfig(newConfig: Partial<VirtualBackgroundConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Load new background image if URL changed
    if (newConfig.backgroundImageUrl !== undefined) {
      if (newConfig.backgroundImageUrl) {
        await this.loadBackgroundImage(newConfig.backgroundImageUrl);
      } else {
        this.backgroundImage = null;
      }
    }
  }

  public dispose(): void {
    console.log('[Service] Disposing virtual background service...');
    
    this.isActive = false;
    
    if (this.processingController) {
      this.processingController.abort();
      this.processingController = null;
    }
    
    if (this.trackWriter) {
      try {
        this.trackWriter.releaseLock();
      } catch (error) {
        console.warn('[Service] Error releasing track writer:', error);
      }
      this.trackWriter = null;
    }
    
    this.trackProcessor = null;
    this.trackGenerator = null;
    
    // Clean up MediaPipe resources
    if (this.imageSegmenter) {
      this.imageSegmenter.close();
      this.imageSegmenter = null;
    }
    
    // Clean up background image
    if (this.backgroundImage) {
      this.backgroundImage.close();
      this.backgroundImage = null;
    }
    
    // Clean up edge improvement resources
    this.previousMask = null;
    this.maskCanvas = null;
    this.maskCtx = null;
    
    this.isInitialized = false;
  }

  public isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  public stopVirtualBackground(): void {
    console.log('[Service] Stopping virtual background...');
    
    this.isActive = false;
    
    if (this.processingController) {
      this.processingController.abort();
      this.processingController = null;
    }
    
    if (this.trackWriter) {
      try {
        this.trackWriter.releaseLock();
      } catch (error) {
        console.warn('[Service] Error releasing track writer:', error);
      }
      this.trackWriter = null;
    }
  }
}
