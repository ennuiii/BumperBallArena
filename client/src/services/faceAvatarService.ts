// Face Avatar Service - MediaPipe Face Landmarker + Three.js Implementation

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Type declarations for MediaStreamTrackProcessor API
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
  kind: string;
}

declare const MediaStreamTrackProcessor: {
  prototype: MediaStreamTrackProcessor;
  new (init: MediaStreamTrackProcessorInit): MediaStreamTrackProcessor;
};

declare const MediaStreamTrackGenerator: {
  prototype: MediaStreamTrackGenerator;
  new (init: MediaStreamTrackGeneratorInit): MediaStreamTrackGenerator;
};

export interface FaceAvatarConfig {
  avatarType: 'raccoon' | 'robot' | 'alien' | 'cat' | 'custom' | 'sphere' | 'cube' | 'ring' | 'triangle';
  avatarColor: string;
  avatarSize: number;
  trackingSmoothing: number;
  enableBlendshapes: boolean;
  expressionIntensity: number;
  customModelUrl?: string; // For loading custom GLB models
}

export const DEFAULT_AVATAR_CONFIG: FaceAvatarConfig = {
  avatarType: 'raccoon',
  avatarColor: '#4F46E5',
  avatarSize: 40, // Scale factor for the avatar
  trackingSmoothing: 0.8,
  enableBlendshapes: true,
  expressionIntensity: 1.2
};

export class FaceAvatarService {
  private config: FaceAvatarConfig;
  private isActive = false;
  private trackProcessor: MediaStreamTrackProcessor<VideoFrame> | null = null;
  private trackGenerator: MediaStreamTrackGenerator<VideoFrame> | null = null;
  private processingController: AbortController | null = null;
  private trackWriter: WritableStreamDefaultWriter<VideoFrame> | null = null;
  
  // MediaPipe components
  private faceLandmarker: FaceLandmarker | null = null;
  private isInitialized = false;
  
  // Three.js components
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private gltfLoader: GLTFLoader | null = null;
  
  // Avatar components
  private avatarModel: GLTF | null = null;
  private morphTargetMeshes: THREE.Mesh[] = [];
  private geometricAvatar: THREE.Mesh | null = null;
  
  // Canvas elements for processing
  private tempCanvas: OffscreenCanvas | null = null;
  private tempCtx: OffscreenCanvasRenderingContext2D | null = null;
  private outputCanvas: OffscreenCanvas | null = null;
  private outputCtx: OffscreenCanvasRenderingContext2D | null = null;
  private threeCanvas: OffscreenCanvas | null = null;
  
  // Processing state
  private isProcessing = false;

  constructor(config: FaceAvatarConfig = DEFAULT_AVATAR_CONFIG) {
    this.config = config;
  }

  public async initialize(): Promise<void> {
    console.log('[FaceAvatar] Initializing Face Avatar Service...');
    
    try {
      // Initialize MediaPipe
      const vision = await FilesetResolver.forVisionTasks(import.meta.env.BASE_URL + 'wasm');
      
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: import.meta.env.BASE_URL + 'models/face_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
      });
      
      console.log('[FaceAvatar] Face Landmarker initialized');
      
      // Initialize Three.js
      await this.initializeThreeJS();
      
      // Load avatar model
      await this.loadAvatar();
      
      this.isInitialized = true;
      console.log('[FaceAvatar] Initialization complete');
      
    } catch (error) {
      console.error('[FaceAvatar] Initialization failed:', error);
      throw error;
    }
  }

  private async initializeThreeJS(): Promise<void> {
    // Create scene
    this.scene = new THREE.Scene();
    
    // Create perspective camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 5000);
    this.camera.position.set(0, 0, 0);
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 0);
    this.scene.add(directionalLight);
    
    // Initialize GLTF loader
    this.gltfLoader = new GLTFLoader();
    
    console.log('[FaceAvatar] Three.js initialized');
  }

  private async loadAvatar(): Promise<void> {
    // Check if it's a GLB avatar type
    const glbAvatarTypes = ['raccoon', 'robot', 'alien', 'cat', 'custom'];
    
    if (glbAvatarTypes.includes(this.config.avatarType)) {
      await this.loadGLTFAvatar();
    } else {
      this.createGeometricAvatar();
    }
  }

  private async loadGLTFAvatar(): Promise<void> {
    if (!this.gltfLoader || !this.scene) return;
    
    // Determine model URL based on avatar type
    let modelUrl: string;
    const baseUrl = import.meta.env.BASE_URL;
    switch (this.config.avatarType) {
      case 'raccoon':
        modelUrl = baseUrl + 'models/raccoon_head.glb';
        break;
      case 'robot':
        modelUrl = baseUrl + 'models/robot_head.glb';
        break;
      case 'alien':
        modelUrl = baseUrl + 'models/alien_head.glb';
        break;
      case 'cat':
        modelUrl = baseUrl + 'models/cat_head.glb';
        break;
      case 'custom':
        modelUrl = this.config.customModelUrl || baseUrl + 'models/raccoon_head.glb';
        break;
      default:
        modelUrl = baseUrl + 'models/raccoon_head.glb';
    }
    
    console.log('[FaceAvatar] Loading model:', modelUrl);
    
    try {
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        this.gltfLoader!.load(
          modelUrl,
          resolve,
          (progress) => {
            console.log('[FaceAvatar] Loading model...', 
              100.0 * (progress.loaded / progress.total), '%');
          },
          reject
        );
      });
      
      this.avatarModel = gltf;
      
      // Process the model
      gltf.scene.traverse((object: any) => {
        if (object.isMesh) {
          object.frustumCulled = false;
          
          // Collect morph target meshes
          if (object.morphTargetDictionary && object.morphTargetInfluences) {
            this.morphTargetMeshes.push(object);
            console.log('[FaceAvatar] Found morph targets:', 
              Object.keys(object.morphTargetDictionary));
          }
        }
      });
      
      // Set up the model for matrix transformations
      gltf.scene.matrixAutoUpdate = false;
      gltf.scene.visible = false;
      
      this.scene.add(gltf.scene);
      console.log('[FaceAvatar] Avatar model loaded');
      
    } catch (error) {
      console.error('[FaceAvatar] Error loading avatar:', error);
      this.createGeometricAvatar();
    }
  }

  private createGeometricAvatar(): void {
    if (!this.scene) return;
    
    let geometry: THREE.BufferGeometry;
    
    switch (this.config.avatarType) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        break;
      case 'cube':
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case 'ring':
        geometry = new THREE.RingGeometry(0.3, 0.5, 32);
        break;
      case 'triangle':
        geometry = new THREE.ConeGeometry(0.5, 1, 3);
        break;
      default:
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
    }
    
    const material = new THREE.MeshBasicMaterial({ 
      color: this.config.avatarColor,
      transparent: true,
      opacity: 0.8
    });
    
    this.geometricAvatar = new THREE.Mesh(geometry, material);
    this.geometricAvatar.visible = false;
    
    this.scene.add(this.geometricAvatar);
    console.log('[FaceAvatar] Geometric avatar created');
  }

  public async setupAndStart(inputStream: MediaStream): Promise<MediaStream> {
    if (!this.isInitialized || !this.faceLandmarker) {
      throw new Error('Service not initialized');
    }

    if (!('MediaStreamTrackProcessor' in window) || !('MediaStreamTrackGenerator' in window)) {
      throw new Error('Browser does not support required APIs');
    }

    const videoTrack = inputStream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error('No video track found');
    }

    this.trackProcessor = new MediaStreamTrackProcessor({ track: videoTrack });
    this.trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });

    this.isActive = true;
    await this.startStreamProcessing();

    return new MediaStream([this.trackGenerator]);
  }

  private async startStreamProcessing(): Promise<void> {
    if (!this.trackProcessor || !this.trackGenerator) return;

    this.trackWriter = this.trackGenerator.writable.getWriter();
    const reader = this.trackProcessor.readable.getReader();

    const processFrame = async (): Promise<void> => {
      try {
        const { done, value } = await reader.read();
        
        if (done || !this.isActive) return;

        await this.processVideoFrame(value);
        
        if (this.isActive) {
          processFrame();
        }
      } catch (error) {
        console.error('[FaceAvatar] Stream processing error:', error);
      }
    };

    processFrame();
  }

  private async processVideoFrame(videoFrame: VideoFrame): Promise<void> {
    if (this.isProcessing) {
      videoFrame.close();
      return;
    }

    this.isProcessing = true;

    try {
      const width = videoFrame.displayWidth;
      const height = videoFrame.displayHeight;

      // Initialize canvases if needed
      if (!this.tempCanvas || this.tempCanvas.width !== width || this.tempCanvas.height !== height) {
        this.tempCanvas = new OffscreenCanvas(width, height);
        this.tempCtx = this.tempCanvas.getContext('2d');
        
        this.outputCanvas = new OffscreenCanvas(width, height);
        this.outputCtx = this.outputCanvas.getContext('2d');
        
        this.threeCanvas = new OffscreenCanvas(width, height);
        
        if (!this.renderer) {
          this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.threeCanvas,
            alpha: true,
            antialias: true
          });
        }
        
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x000000, 0);
        
        if (this.camera) {
          this.camera.aspect = width / height;
          this.camera.updateProjectionMatrix();
        }
      }

      if (!this.tempCtx || !this.outputCtx) return;

      // Draw video frame
      this.tempCtx.drawImage(videoFrame, 0, 0, width, height);

      // Detect face and apply transformations
      await this.detectAndApplyFaceTransform();

      // Render composite
      this.renderComposite(width, height);

      // Create output frame
      const processedFrame = new VideoFrame(this.outputCanvas!, {
        timestamp: videoFrame.timestamp,
        alpha: 'discard'
      });

      await this.trackWriter?.write(processedFrame);

    } catch (error) {
      console.error('[FaceAvatar] Error processing frame:', error);
    } finally {
      this.isProcessing = false;
      videoFrame.close();
    }
  }

  private async detectAndApplyFaceTransform(): Promise<void> {
    if (!this.tempCanvas || !this.faceLandmarker) return;

    try {
      const result = this.faceLandmarker.detectForVideo(this.tempCanvas, performance.now());
      
      if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
        // Show avatar
        if (this.avatarModel) {
          this.avatarModel.scene.visible = true;
        } else if (this.geometricAvatar) {
          this.geometricAvatar.visible = true;
        }
        
        // Apply transformation matrix
        const matrix = new THREE.Matrix4().fromArray(result.facialTransformationMatrixes[0].data);
        matrix.scale(new THREE.Vector3(this.config.avatarSize, this.config.avatarSize, this.config.avatarSize));
        
        if (this.avatarModel) {
          this.avatarModel.scene.matrix.copy(matrix);
        } else if (this.geometricAvatar) {
          this.geometricAvatar.matrix.copy(matrix);
          this.geometricAvatar.matrixAutoUpdate = false;
        }
        
        // Apply blendshapes if available
        if (result.faceBlendshapes && result.faceBlendshapes.length > 0 && this.config.enableBlendshapes) {
          this.applyBlendshapes(result.faceBlendshapes[0]);
        }
        
      } else {
        // Hide avatar when no face detected
        if (this.avatarModel) {
          this.avatarModel.scene.visible = false;
        } else if (this.geometricAvatar) {
          this.geometricAvatar.visible = false;
        }
      }
      
    } catch (error) {
      console.error('[FaceAvatar] Face detection error:', error);
    }
  }

  private applyBlendshapes(blendshapes: any): void {
    if (!blendshapes.categories || this.morphTargetMeshes.length === 0) return;
    
    const blendshapeMap = new Map<string, number>();
    
    // Process blendshape values
    for (const category of blendshapes.categories) {
      let score = category.score;
      
      // Amplify certain expressions
      switch (category.categoryName) {
        case 'browOuterUpLeft':
        case 'browOuterUpRight':
        case 'eyeBlinkLeft':
        case 'eyeBlinkRight':
          score *= this.config.expressionIntensity;
          break;
      }
      
      blendshapeMap.set(category.categoryName, score);
    }
    
    // Apply to morph targets
    for (const mesh of this.morphTargetMeshes) {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
      
      for (const [name, value] of blendshapeMap) {
        if (name in mesh.morphTargetDictionary) {
          const idx = mesh.morphTargetDictionary[name];
          mesh.morphTargetInfluences[idx] = value;
        }
      }
    }
  }

  private renderComposite(width: number, height: number): void {
    if (!this.outputCtx || !this.tempCanvas || !this.renderer || !this.scene || !this.camera) return;

    // Clear output
    this.outputCtx.clearRect(0, 0, width, height);
    
    // Draw original video
    this.outputCtx.drawImage(this.tempCanvas, 0, 0, width, height);
    
    // Render 3D scene
    this.renderer.render(this.scene, this.camera);
    
    // Composite 3D render over video
    if (this.threeCanvas) {
      this.outputCtx.drawImage(this.threeCanvas, 0, 0, width, height);
    }
  }

  public updateConfig(config: Partial<FaceAvatarConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Reload avatar if type changed
    if (config.avatarType && this.scene) {
      // Remove existing avatars
      if (this.avatarModel) {
        this.scene.remove(this.avatarModel.scene);
        this.avatarModel = null;
        this.morphTargetMeshes = [];
      }
      if (this.geometricAvatar) {
        this.scene.remove(this.geometricAvatar);
        this.geometricAvatar = null;
      }
      
      // Load new avatar
      this.loadAvatar();
    }
  }

  public stopFaceAvatar(): void {
    this.isActive = false;
    
    if (this.trackWriter) {
      this.trackWriter.close();
      this.trackWriter = null;
    }
    
    if (this.processingController) {
      this.processingController.abort();
      this.processingController = null;
    }
  }

  public isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  public dispose(): void {
    this.stopFaceAvatar();
    
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    
    if (this.scene) {
      this.scene.clear();
      this.scene = null;
    }
    
    this.isInitialized = false;
  }
} 