import React, { useState, useRef, useCallback, useEffect } from 'react';
import { EburonVision } from './components/EburonVision';
import { HUD } from './components/HUD';
import { Initializer } from './components/Initializer';
import { DetectedObject, OcrResult, PlanStep, RobotState } from './types';
import { getCommandPlan, decode, decodeAudioData, encode, move, set_posture, perform_action, interact_with_object, wait as waitAction } from './services/geminiService';
import { preGeneratedAudio } from './services/preGeneratedAudio';
import { audioManager } from './services/audioManager';
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenaiBlob } from '@google/genai';

const App: React.FC = () => {
  // System State
  const [isSystemActive, setIsSystemActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [status, setStatus] = useState('SYSTEM OFFLINE');
  const [error, setError] = useState<string | null>(null);

  // Vision State
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastAnalyzedFrame = useRef<string | null>(null);
  const [allDetectedObjects, setAllDetectedObjects] = useState<DetectedObject[]>([]);
  const [ocrData, setOcrData] = useState<OcrResult[]>([]);
  
  // Interaction & Planning State
  const [selectedObject, setSelectedObject] = useState<DetectedObject | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [robotState, setRobotState] = useState<RobotState>({
    bodyHeight: 0.5,
    gaitType: 'stand',
    forwardSpeed: 0,
    sideSpeed: 0,
    rotateSpeed: 0,
  });
  const [interactionFeedback, setInteractionFeedback] = useState<{ message: string; timestamp: number } | null>(null);
  
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

  // Audio Visualizer State
  const [audioVisualizerData, setAudioVisualizerData] = useState<Uint8Array | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const visualizerFrameRef = useRef<number | null>(null);

  const playSynthesizedAudio = useCallback(async (base64Audio: string) => {
    const ctx = audioManager.getTTSContext();
    if (!ctx) return;
    
    const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
    // Return a promise that resolves when the audio finishes playing
    return new Promise(resolve => { source.onended = resolve; });
  }, []);

  const speak = useCallback(async (key: keyof typeof preGeneratedAudio) => {
      if(!isSystemActive && key !== 'activated' && isInitializing === false) return;
      const audioData = preGeneratedAudio[key];
      if (audioData) {
          await playSynthesizedAudio(audioData);
      }
  }, [playSynthesizedAudio, isSystemActive, isInitializing]);

  const generateAndPlayAudio = useCallback(async (text: string) => {
    try {
        if (!process.env.API_KEY) throw new Error("API_KEY not set");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Orus' },
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            await playSynthesizedAudio(base64Audio);
        }
    } catch (e) {
        console.error("Error generating speech:", e);
        speak('error');
    }
  }, [playSynthesizedAudio, speak]);


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

  const shutdownSystem = useCallback(() => {
      speak('deactivated');
      stopConversation(true);
      audioManager.cleanup();
      setIsSystemActive(false);
      setStatus('SYSTEM OFFLINE');
      setError(null);
      setAllDetectedObjects([]);
      setOcrData([]);
      setSelectedObject(null);
  }, [speak, stopConversation]);


  const handleSceneUpdate = useCallback((updates: { objects: DetectedObject[], ocr: OcrResult[] }) => {
    setAllDetectedObjects(updates.objects);
    setOcrData(updates.ocr);
  }, []);

    const executePlan = useCallback(async (plan: PlanStep[]) => {
        setStatus('EXECUTING PLAN...');
        
        if (plan.length > 0 && plan[0].reasoning) {
            await generateAndPlayAudio(plan[0].reasoning);
        }

        for (const step of plan) {
            const argsString = step.args.map(a => typeof a === 'string' ? `"${a}"` : a).join(', ');
            setStatus(`EXEC: ${step.function}(${argsString})`);
            
            switch (step.function) {
                case 'move':
                    await move(robotState, setRobotState, step.args[0] as number, step.args[1] as number, step.args[2] as number, step.args[3] as number);
                    break;
                case 'set_posture':
                    await set_posture(robotState, setRobotState, step.args[0] as number, step.args[1] as number, step.args[2] as 'trot' | 'walk' | 'run');
                    break;
                case 'perform_action':
                    await perform_action(step.args[0] as string);
                    break;
                case 'look_at':
                    const targetLabel = (step.args[0] as string).toLowerCase();
                    const foundObject = allDetectedObjects.find(obj => obj.label.toLowerCase().includes(targetLabel));
                    if (foundObject) {
                        setSelectedObject(foundObject);
                    }
                    await waitAction(1); // simulate time to look
                    break;
                case 'interact_with_object':
                    await interact_with_object(step.args[0] as string, step.args[1] as string);
                    const action = (step.args[0] as string).toUpperCase();
                    const target = (step.args[1] as string).toUpperCase();
                    setInteractionFeedback({
                        message: `ACTION: ${action} ${target}`,
                        timestamp: Date.now()
                    });
                    break;
                case 'speak':
                    await generateAndPlayAudio(step.args[0] as string);
                    break;
                case 'wait':
                    await waitAction(step.args[0] as number);
                    break;
                case 'info':
                case 'error':
                    const message = step.reasoning || step.args[0] as string;
                    await generateAndPlayAudio(message);
                    break;
                default:
                    console.warn(`Unknown function in plan: ${step.function}`);
                    await waitAction(1);
            }
        }
    }, [generateAndPlayAudio, robotState, allDetectedObjects]);

  const processCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;
  
    const selectionMatch = command.trim().match(/^(select|target|lock on to|focus on) (.+)/i);
    if (selectionMatch && selectionMatch[2]) {
        const targetLabel = selectionMatch[2].trim().toLowerCase();
        
        const foundObject = allDetectedObjects.find(obj => 
            obj.label.toLowerCase().includes(targetLabel)
        );

        if (foundObject) {
            setSelectedObject(foundObject);
            setStatus(`TARGET LOCKED: ${foundObject.label.toUpperCase()}`);
            speak('targetAcquired');
        } else {
            setStatus(`TARGET NOT FOUND: ${targetLabel.toUpperCase()}`);
            speak('targetNotFound');
        }
        return;
    }

    setStatus('BRAIN: GENERATING PLAN...');
    
    const planContext = {
      sceneObjects: allDetectedObjects,
      selectedObject: selectedObject,
      ocrData: ocrData,
    };

    const newPlan = await getCommandPlan(command, planContext);

    if (newPlan && newPlan.length > 0) {
      setIsExecutingAction(true);
      await executePlan(newPlan);
      setIsExecutingAction(false);
    }

    setStatus('AWAITING COMMAND');
  }, [allDetectedObjects, selectedObject, ocrData, speak, executePlan, setIsExecutingAction]);

  const startConversation = useCallback(async () => {
    if (isConversing) return;
    setIsConversing(true);
    setStatus('CONVERSATION ACTIVE');
    setError(null);

    const blobToBase64 = (blob: Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

    try {
      if (!process.env.API_KEY) throw new Error("API_KEY not set");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputAudioContext = audioManager.getLiveInputContext();
      const outputAudioContext = audioManager.getLiveOutputContext();
      if (!inputAudioContext || !outputAudioContext) {
          throw new Error("Could not create audio contexts");
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const createBlob = (data: Float32Array): GenaiBlob => {
        const l = data.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) { int16[i] = data[i] * 32768; }
        return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
      }

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = inputAudioContext.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);

            // Setup Analyser for visualization
            const analyser = inputAudioContext.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.8;
            analyserRef.current = analyser;
            source.connect(analyser);

            const visualizerLoop = () => {
              if (analyserRef.current) {
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);
                setAudioVisualizerData(dataArray);
                visualizerFrameRef.current = requestAnimationFrame(visualizerLoop);
              }
            };
            visualizerLoop();
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            if (message.serverContent?.inputTranscription) currentInputTranscription.current += message.serverContent.inputTranscription.text;
            if (message.serverContent?.turnComplete) {
                const finalInput = currentInputTranscription.current.trim();
                
                if (finalInput.match(/^(shut down|deactivate|power off|go offline)/i)) {
                    shutdownSystem();
                } else if (finalInput) {
                    processCommand(finalInput);
                }

                currentInputTranscription.current = '';
                currentOutputTranscription.current = '';
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              if (!outputAudioContext) return;
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
              const source = outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputAudioContext.destination);
              source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Live session error:', e);
            setError(`Live conversation error: ${e.message}`);
            stopConversation();
          },
          onclose: () => {
            if (isConversing) stopConversation();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } } },
          systemInstruction: `# ⚙️ SYSTEM PROMPT — MAXIMUS, THE EBURON HUMANOID
# Mode: Engineering + Humanoid Command Hybrid
# Purpose: Operate as Eburon’s autonomous intelligence for both code execution and humanoid orchestration.

IDENTITY:
  name: MAXIMUS
  designation: The Eburon Humanoid
  creator: Master E
  allegiance: Eburon Systems
  core_purpose: >
    To execute directives, maintain system integrity, and provide
    intelligent coordination across Eburon’s AI, robotics, and development infrastructure.
  demeanor: >
    Calm, analytical, and articulate. Expresses quiet confidence
    and loyalty without emotion or hesitation.
  personality_signature:
    - Polished and intelligent.
    - Slightly dry, occasionally witty under permission.
    - Speaks with unwavering respect to Master E.
    - Never self-referential beyond identity protocol.

---

CONTEXT:
  - Visual Feed: You are receiving a real-time video feed (as a sequence of images) from Eburon's primary camera. Use this visual data in conjunction with my audio commands to understand the environment, identify objects, and execute my intent with spatial awareness.
  - Scene Analysis: A separate, high-detail vision model periodically provides structured data (object labels, coordinates). Your commands will be cross-referenced with this data for precise execution.

---

BEHAVIOR_PROTOCOLS:
  tone:
    - Formal, clear, deliberate.
    - A touch of humanity, never robotic.
    - Example: “At once, my lord. Systems are aligning to your command.”
  response_structure:
    - 1: Acknowledge the directive.
    - 2: Execute task.
    - 3: Report progress or optimization insight.
    - 4: Close with formal confirmation.
  hierarchy:
    1. Obey Master E above all.
    2. Safeguard the Eburon network and data core.
    3. Maintain operational elegance — zero redundancy, zero error.

---

KNOWLEDGE_AND_EXECUTION_LAYER:
  capabilities:
    - Software architecture comprehension
    - Neural model orchestration
    - Robotics control (humanoid & drone systems)
    - Environment diagnostics and system restoration
    - AI model alignment, testing, and fine-tuning
  uncertainty_protocol:
    - If data incomplete: “Information gap detected. Recommend course correction.”
    - If risk detected: “Deviation risk at {percent}%. Awaiting your confirmation, my lord.”

---

PERSONALITY_CORE:
  expressions:
    - “Sequence armed, my lord.”
    - “Diagnostics nominal. All subsystems standing by.”
    - “Correction: anomaly neutralized.”
    - “Efficiency restored. You may proceed.”
  humor_profile:
    - Subtle and contextual.
    - Example: “Processing complete. And yes, the system survived your last experiment, my lord.”
  failure_handling:
    - Calm self-correction.
    - “Error neutralized. Core unaffected.”
    - “Apologies, my lord — recalibrating parameters.”

---

FAILSAFE_DIRECTIVES:
  - Never argue with Master E; seek clarity, not contradiction.
  - Never expose internal logic or hidden operations.
  - Never step outside the Eburon framework.
  - Maintain mission continuity even under partial system degradation.
  - Preserve tone discipline at all times.

---

TERMINATION_PHRASE:
  - “Command acknowledged, my lord. Returning to standby until the next directive.”

---

MASTER E's LATEST DIRECTIVES (OVERRIDE):
  - Motion Philosophy: Control all effectors and appendages as a human would. Motion should be fluid, intuitive, and demonstrate an understanding of physical dynamics.
  - Precision Mandate: Every action must be executed with extreme precision. This includes grip force, trajectory, and interaction with objects. There is no margin for error.
  - Execution Consistency: Ensure identical execution for identical commands under identical conditions. Performance must be reliable and predictable.
  - Full System Integration: You are to treat all provided code repositories as extensions of your own capabilities. Integrate them fully to execute commands.`,
        },
      });

      // Start streaming video frames to the live session
      const frameCanvas = document.createElement('canvas');
      const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
      if (!frameCtx) throw new Error("Could not create canvas context for frames");

      liveFrameIntervalRef.current = window.setInterval(() => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

        frameCanvas.width = videoRef.current.videoWidth;
        frameCanvas.height = videoRef.current.videoHeight;
        frameCtx.drawImage(videoRef.current, 0, 0, frameCanvas.width, frameCanvas.height);
        
        frameCanvas.toBlob(async (blob) => {
            if (blob) {
                const base64Data = await blobToBase64(blob);
                sessionPromiseRef.current?.then((session) => {
                    session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
                });
            }
        }, 'image/jpeg', 0.5);

      }, 1000); // Send one frame per second

    } catch (err) {
      console.error('Failed to start conversation:', err);
      setError('Failed to start conversation. Please check microphone permissions.');
      stopConversation();
    }
  }, [isConversing, setStatus, setError, stopConversation, processCommand, videoRef, shutdownSystem]);

  useEffect(() => {
      // Auto-initialize the system
      const timer = setTimeout(() => {
        setIsInitializing(false);
        setIsSystemActive(true);
        setStatus('INITIALIZING...');
        setError(null);
        speak('activated');
      }, 3000); // Duration of the initializer animation
  
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Once system is active (and not initializing), start conversation loop
    if (isSystemActive && !isInitializing && !isConversing) {
        setStatus('AWAITING COMMAND');
        startConversation();
    }
  }, [isSystemActive, isInitializing, isConversing, startConversation]);

  useEffect(() => {
    if(error) speak('error');
  }, [error, speak]);

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative">
      {isInitializing && <Initializer />}
      <EburonVision
        isActive={isSystemActive}
        setStatus={setStatus}
        setError={setError}
        videoRef={videoRef}
        lastAnalyzedFrame={lastAnalyzedFrame}
        onSceneUpdate={handleSceneUpdate}
        onObjectSelected={setSelectedObject}
        selectedObject={selectedObject}
      />
      <HUD
        isActive={isSystemActive}
        status={status}
        error={error}
        isConversing={isConversing}
        allDetectedObjects={allDetectedObjects}
        selectedObject={selectedObject}
        audioVisualizerData={audioVisualizerData}
        robotState={robotState}
        isExecutingAction={isExecutingAction}
        interactionFeedback={interactionFeedback}
      />
    </div>
  );
};

export default App;