import React, { useRef, useEffect, useState, useCallback } from 'react';
import { analyzeScene } from '../services/geminiService';
import { audioManager } from '../services/audioManager';
import { DetectedObject, OcrResult } from '../types';

interface EburonVisionProps {
  isActive: boolean;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  videoRef: React.RefObject<HTMLVideoElement>;
  lastAnalyzedFrame: React.MutableRefObject<string | null>;
  onSceneUpdate: (updates: { objects: DetectedObject[], ocr: OcrResult[] }) => void;
  onObjectSelected: (object: DetectedObject) => void;
  selectedObject: DetectedObject | null;
}

const FRAME_ANALYSIS_INTERVAL = 6500; // ms, increased from 2000 to stay within 10 reqs/min limit
const JPEG_QUALITY = 0.7;

export const EburonVision: React.FC<EburonVisionProps> = ({ isActive, setStatus, setError, videoRef, lastAnalyzedFrame, onSceneUpdate, onObjectSelected, selectedObject }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const analysisIntervalRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const previousLabelsRef = useRef<Set<string>>(new Set());

  const stopStreams = useCallback(() => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    if (videoRef.current) {
        videoRef.current.srcObject = null;
    }
    setDetectedObjects([]);
    previousLabelsRef.current.clear();
  }, [videoRef]);

  const startVisionSystem = useCallback(async () => {
    try {
      setStatus('ACTIVATING VISUAL SENSORS...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('VISUAL FEED ONLINE');

        const analyzeFrame = async () => {
          if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || !videoRef.current.videoWidth) return;

          const tempCanvas = document.createElement('canvas');
          const video = videoRef.current;
          tempCanvas.width = video.videoWidth;
          tempCanvas.height = video.videoHeight;
          const ctx = tempCanvas.getContext('2d');
          if (!ctx) return;

          ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
          const base64Image = tempCanvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
          lastAnalyzedFrame.current = base64Image;

          try {
            const { objects: newObjects, ocr: newOcr } = await analyzeScene(base64Image, selectedObject?.label);
            
            const newLabels = new Set(newObjects.map(o => o.label));
            let hasNewObject = false;
            for (const label of newLabels) {
              if (!previousLabelsRef.current.has(label)) {
                hasNewObject = true;
                break;
              }
            }
  
            if (hasNewObject) {
              audioManager.playDetectionSound();
            }
            
            previousLabelsRef.current = newLabels;
            setDetectedObjects(newObjects);
            onSceneUpdate({ objects: newObjects, ocr: newOcr });
          } catch (err) {
            console.error('Failed during frame analysis:', err);
             if (err instanceof Error) {
                setError(`Vision System Error: ${err.message}`);
            } else {
                setError('An unknown error occurred in the vision system.');
            }
          }
        };
        
        await analyzeFrame();
        analysisIntervalRef.current = window.setInterval(analyzeFrame, FRAME_ANALYSIS_INTERVAL);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Failed to access camera. Please check permissions and ensure a camera is available.');
      stopStreams();
    }
  }, [videoRef, setStatus, setError, stopStreams, lastAnalyzedFrame, onSceneUpdate, selectedObject]);
  
  useEffect(() => {
    if (isActive) {
      startVisionSystem();
    } else {
      stopStreams();
    }
    return () => stopStreams();
  }, [isActive, startVisionSystem, stopStreams]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const CLICK_THRESHOLD = 20; // pixels

    // Find the closest object to the click
    let closestObject: DetectedObject | null = null;
    let minDistance = Infinity;

    for (const obj of detectedObjects) {
      const [y, x] = obj.point;
      const canvasX = (x / 1000) * canvas.width;
      const canvasY = (y / 1000) * canvas.height;
      const distance = Math.sqrt(Math.pow(clickX - canvasX, 2) + Math.pow(clickY - canvasY, 2));

      if (distance < CLICK_THRESHOLD && distance < minDistance) {
        closestObject = obj;
        minDistance = distance;
      }
    }
    
    if (closestObject) {
        onObjectSelected(closestObject);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    
    const renderLoop = () => {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // All drawing logic removed to keep the view clean as per the new design.
        animationFrameId = requestAnimationFrame(renderLoop);
    };
    
    const handlePlay = () => {
        renderLoop();
    };

    video.addEventListener('play', handlePlay);
    return () => {
      video.removeEventListener('play', handlePlay);
      cancelAnimationFrame(animationFrameId);
    };
  }, [videoRef]);

  return (
    <div className="w-full h-full bg-black relative">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full cursor-pointer" onClick={handleCanvasClick} />
    </div>
  );
};