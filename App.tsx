import React, { useState, useRef, useCallback, useEffect } from 'react';
import { EburonVision } from './components/EburonVision';
import { HUD } from './components/HUD';
import { Initializer } from './components/Initializer';
import { DetectedObject, OcrResult, ChatMessage } from './types';
import { getCommandPlan, executePlan, decode, decodeAudioData, encode } from './services/geminiService';
import { isSupabaseConfigured, loadHistory, saveHistory } from './services/supabaseService';
import { preGeneratedAudio } from './services/preGeneratedAudio';
import { audioManager } from './services/audioManager';
// FIX: The LiveSession type is not exported from '@google/genai'.
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenaiBlob } from '@google/genai';

const App: React.FC = () => {
  // System State
  const [isSystemActive, setIsSystemActive] = useState(false);
  const [status, setStatus] = useState('SYSTEM OFFLINE');
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);


  // Vision State
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastAnalyzedFrame = useRef<string | null>(null);
  const [allDetectedObjects, setAllDetectedObjects] = useState<DetectedObject[]>([]);
  const [ocrData, setOcrData] = useState<OcrResult[]>([]);
  
  // Interaction & Planning State
  const [selectedObject, setSelectedObject] = useState<DetectedObject | null>(null);
  
  // Conversation State
  const [isConversing, setIsConversing] = useState(false);
  // FIX: Using `any` because the `LiveSession` type is not exported from the SDK.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');
  const liveFrameIntervalRef = useRef<number | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Audio Visualizer State
  const [audioVisualizerData, setAudioVisualizerData] = useState<Uint8Array | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const visualizerFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Ensure unique device identity
    let deviceId = localStorage.getItem('eburon_deviceId');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('eburon_deviceId', deviceId);
    }
    
    if (!isSupabaseConfigured()) {
        setConfigError("Supabase is not configured. Please update services/supabaseService.ts to enable conversation history.");
        setIsLoadingHistory(false);
        return;
    }

    const fetchHistory = async () => {
        if (deviceId) {
            const savedHistory = await loadHistory(deviceId);
            if (savedHistory) {
                setHistory(savedHistory);
            }
        }
        setIsLoadingHistory(false);
    };
    
    fetchHistory();
  }, []); // Runs once on mount

  useEffect(() => {
    // Don't save anything until history is loaded or if there's a config error.
    if (isLoadingHistory || configError) {
        return;
    }

    const deviceId = localStorage.getItem('eburon_deviceId');
    if (deviceId) {
        saveHistory(deviceId, history).catch(e => {
            console.error("Failed to save chat history to Supabase Storage", e);
        });
    }
  }, [history, isLoadingHistory, configError]);

  const playSynthesizedAudio = useCallback(async (base64Audio: string) => {
    const ctx = audioManager.getTTSContext();
    if (!ctx) return;
    
    const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
  }, []);

  const speak = useCallback(async (key: keyof typeof preGeneratedAudio) => {
      if(!isSystemActive && key !== 'activated') return;
      const audioData = preGeneratedAudio[key];
      if (audioData) {
          await playSynthesizedAudio(audioData);
      }
  }, [playSynthesizedAudio, isSystemActive]);

  const stopConversation = useCallback(async (maintainStatus = false) => {
    setIsConversing(false);
    if(isSystemActive && !maintainStatus) setStatus('AWAITING COMMAND');

    if (liveFrameIntervalRef.current) {
        clearInterval(liveFrameIntervalRef.current);
        liveFrameIntervalRef.current = null;
    }

    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (e) { console.error("Error closing session:", e); }
      sessionPromiseRef.current = null;
    }
    
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamSourceRef.current = null;
    
    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    // Stop visualizer
    if (visualizerFrameRef.current) cancelAnimationFrame(visualizerFrameRef.current);
    visualizerFrameRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    setAudioVisualizerData(null);

  }, [isSystemActive, setStatus]);

  const toggleSystem = useCallback(() => {
    if (isSystemActive) {
      speak('deactivated');
      stopConversation(true);
      audioManager.cleanup();
      setIsSystemActive(false);
      setStatus('SYSTEM OFFLINE');
      setError(null);
      setAllDetectedObjects([]);
      setOcrData([]);
      setSelectedObject(null);
    } else {
      setIsSystemActive(true);
      setStatus('SYSTEM ONLINE');
      speak('activated');
    }
  }, [isSystemActive, speak, stopConversation]);

  const handleObjectSelected = useCallback((object: DetectedObject) => {
    setSelectedObject(object);
    setStatus(`TARGET ACQUIRED: ${object.label}`);
    speak('targetAcquired');
  }, [speak]);

  const handleSceneUpdate = useCallback(({ objects, ocr }: { objects: DetectedObject[], ocr: OcrResult[] }) => {
    setAllDetectedObjects(objects);
    setOcrData(ocr);
  }, []);

  const startConversation = useCallback(async () => {
    const deviceId = localStorage.getItem('eburon_deviceId');
    if (!isSystemActive || isConversing || !deviceId) return;
    setIsConversing(true);
    setStatus('LISTENING...');

    const inputCtx = audioManager.getLiveInputContext();
    const outputCtx = audioManager.getLiveOutputContext();
    if (!inputCtx || !outputCtx) {
        setError("Could not initialize audio contexts.");
        setIsConversing(false);
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        // Setup visualizer
        const sourceNode = inputCtx.createMediaStreamSource(stream);
        const analyser = inputCtx.createAnalyser();
        analyser.fftSize = 256;
        sourceNode.connect(analyser);
        analyserRef.current = analyser;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            if (analyserRef.current) {
                analyserRef.current.getByteFrequencyData(dataArray);
                setAudioVisualizerData(new Uint8Array(dataArray));
                visualizerFrameRef.current = requestAnimationFrame(draw);
            }
        };
        draw();
        
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const latestHistory = [...history]; // Capture history at the moment conversation starts
        const systemInstruction = `
            You are Maximus, the AI core for the Eburon humanoid robot.
            You see the world through a camera feed and can identify objects and text.
            You have a robotic arm for interaction.
            You hear the operator through a microphone and respond with a synthesized voice.
            Be concise, helpful, and act like a sophisticated robot AI.
            The operator's device ID is ${deviceId}.
            
            PREVIOUS CONVERSATION HISTORY:
            ${latestHistory.length > 0 ? latestHistory.map(m => `${m.role}: ${m.parts[0].text}`).join('\n') : 'No history.'}
        `;
        
        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                },
                systemInstruction: systemInstruction,
                outputAudioTranscription: {},
                inputAudioTranscription: {},
            },
            callbacks: {
                onopen: () => {
                    const source = inputCtx.createMediaStreamSource(stream);
                    mediaStreamSourceRef.current = source;
                    const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob: GenaiBlob = {
                            data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)),
                            mimeType: 'audio/pcm;rate=16000',
                        };
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputCtx.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.outputTranscription?.text) {
                       currentOutputTranscription.current += message.serverContent.outputTranscription.text;
                    }
                    if (message.serverContent?.inputTranscription?.text) {
                        currentInputTranscription.current += message.serverContent.inputTranscription.text;
                    }
                    if (message.serverContent?.turnComplete) {
                        const finalUserInput = currentInputTranscription.current.trim();
                        const finalModelOutput = currentOutputTranscription.current.trim();
                        
                        if (finalUserInput && finalModelOutput) {
                             setHistory(prev => [
                                ...prev,
                                { role: 'user', parts: [{ text: finalUserInput }] },
                                { role: 'model', parts: [{ text: finalModelOutput }] },
                            ]);
                        }
                        
                        currentInputTranscription.current = '';
                        currentOutputTranscription.current = '';
                    }

                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                    if (base64Audio) {
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                        const source = outputCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputCtx.destination);
                        source.addEventListener('ended', () => {
                            audioSourcesRef.current.delete(source);
                        });
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        audioSourcesRef.current.add(source);
                    }
                     if (message.serverContent?.interrupted) {
                        audioSourcesRef.current.forEach(source => source.stop());
                        audioSourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error("Live session error:", e);
                    setError("Live conversation connection failed.");
                    stopConversation();
                },
                onclose: () => {
                    stopConversation();
                },
            },
        });
    } catch (err) {
        console.error("Failed to start conversation:", err);
        setError("Failed to access microphone. Please check permissions.");
        stopConversation();
    }
}, [isSystemActive, isConversing, stopConversation, history]);

  return (
    <div className="w-full h-full relative bg-black">
        <EburonVision
            isActive={isSystemActive}
            setStatus={setStatus}
            setError={setError}
            videoRef={videoRef}
            lastAnalyzedFrame={lastAnalyzedFrame}
            onSceneUpdate={handleSceneUpdate}
            onObjectSelected={handleObjectSelected}
            selectedObject={selectedObject}
        />
        <HUD 
            isActive={isSystemActive}
            status={error || configError || status}
            error={error || configError}
            toggleSystem={toggleSystem}
            isConversing={isConversing}
            startConversation={startConversation}
            stopConversation={stopConversation}
            allDetectedObjects={allDetectedObjects}
            selectedObject={selectedObject}
            audioVisualizerData={audioVisualizerData}
            isLoadingHistory={isLoadingHistory}
        />
        {!isSystemActive && (
            <div className="scanline"></div>
        )}
        {isSystemActive && (
             <div className="absolute inset-2 border-4 border-yellow-400/30 rounded-[3.5rem] pointer-events-none hud-element-glow"></div>
        )}
    </div>
  );
};

export default App;