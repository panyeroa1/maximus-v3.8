// FIX: Import React to resolve 'React' is not defined error for SetStateAction type.
import React from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { DetectedObject, PlanStep, OcrResult, RobotState } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const roboticsModel = "gemini-robotics-er-1.5-preview";
const proModel = "gemini-2.5-pro";


export const analyzeScene = async (base64Image: string, priorityObjectLabel?: string): Promise<{objects: DetectedObject[], ocr: OcrResult[]}> => {
  const priorityInstruction = priorityObjectLabel
    ? `Your highest priority is to locate the object labeled "${priorityObjectLabel}". Ensure its point is accurate.`
    : 'Point to no more than 10 distinct items.';

  const prompt = `
    Your task is to analyze the image for both objects and readable text.
    1.  **Object Detection**: ${priorityInstruction} The label should be an identifying name. Format this as an array of objects with "point" ([y, x]) and "label" keys.
    2.  **Optical Character Recognition (OCR)**: Identify all readable text. For each piece of text, provide its content and a bounding box. Format this as an array of objects with "box_2d" ([ymin, xmin, ymax, xmax]) and "text" keys.

    Return a single JSON object with two keys: "objects" and "ocr". The points and box coordinates must be normalized to 0-1000. If no objects or text are found, return empty arrays for the respective keys. Do not use markdown formatting in the response.
  `;

  try {
    const response = await ai.models.generateContent({
      model: roboticsModel,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        temperature: 0.2,
      },
    });

    const text = response.text.trim();
    const jsonString = text.replace(/^```json\s*|```$/g, '');
    const result = JSON.parse(jsonString);
    
    const objects = result.objects || [];
    const ocr = result.ocr || [];

    if (Array.isArray(objects) && Array.isArray(ocr)) {
      return {
          objects: objects.map((item: any) => ({
              ...item,
              id: `${item.label}-${item.point.join(',')}-${Math.random()}`
          })) as DetectedObject[],
          ocr: ocr as OcrResult[]
      };
    }
    return { objects: [], ocr: [] };

  } catch (error) {
    console.error("Error analyzing scene:", error);
    let errorMessage = 'Failed to analyze scene due to an unknown API error.';
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as Error).message;
        try {
            const errorBody = JSON.parse(message);
            if (errorBody.error?.status === 'RESOURCE_EXHAUSTED') {
                const retryDelayMatch = message.match(/Please retry in ([\d.]+)s/);
                const waitTime = retryDelayMatch ? `~${Math.ceil(parseFloat(retryDelayMatch[1]))} seconds` : 'a moment';
                errorMessage = `Vision API rate limit reached. The system will automatically retry. Please wait ${waitTime}.`;
            } else if (errorBody.error?.message) {
                errorMessage = `Vision API Error: ${errorBody.error.message}`;
            }
        } catch (e) {
            errorMessage = message;
        }
    }
    throw new Error(errorMessage);
  }
};

export const getCommandPlan = async (command: string, context: { sceneObjects: DetectedObject[], ocrData: OcrResult[], selectedObject?: DetectedObject | null }): Promise<PlanStep[]> => {
  const availableObjects = context.sceneObjects.map(o => `- ${o.label} at [y:${o.point[0]}, x:${o.point[1]}]`).join('\n');
  const ocrTextContext = context.ocrData.map(o => `- "${o.text}"`).join('\n');

  const prompt = `
    You are the "brain" of the Eburon humanoid robot. You receive a voice command from the operator and must convert it into a sequence of executable actions.

    ## Available Functions:
    - move(forwardSpeed: number, sideSpeed: number, rotateSpeed: number, duration_seconds: number): Controls movement. Speeds are floats from -1.0 (max backward/left/counter-clockwise) to 1.0 (max forward/right/clockwise). duration_seconds is how long to apply the movement.
    - set_posture(bodyHeight: number, footRaiseHeight: number, gaitType: "trot" | "walk" | "run" | "stand"): Adjusts the robot's stance. bodyHeight and footRaiseHeight are from 0.0 (low) to 1.0 (high).
    - perform_action(action: "stand_up" | "stand_down" | "jump" | "dance" | "wave"): Executes a pre-programmed complex action.
    - look_at(target_label: string): Directs the robot's visual sensors towards a specified object from the scene context.
    - interact_with_object(action: "pick_up" | "place", target_label: string, destination_label?: string): Manages manipulation. For 'place', 'destination_label' is required.
    - speak(message: string): Uses text-to-speech to communicate.
    - wait(duration_seconds: number): Pauses execution.

    ## Context:
    - Operator Command: "${command}"
    ${context.selectedObject ? `- The command specifically targets: "${context.selectedObject.label}" at [y:${context.selectedObject.point[0]}, x:${context.selectedObject.point[1]}]. You should prioritize this object.` : ''}
    - Objects in the scene:
    ${availableObjects || 'None detected.'}
    - Readable text in the scene:
    ${ocrTextContext || 'None detected.'}

    ## Task:
    Based on the command and context, create a step-by-step plan using the available functions. Your plan must be logical and physically plausible.
    You MUST find the exact object labels from the context to use as arguments for functions like 'look_at' and 'interact_with_object'. Do not invent object names.

    **Example Logic for "walk forward for 2 seconds":**
    1.  **Acknowledge:** Use 'speak' to confirm.
    2.  **Move:** Use 'move' with forwardSpeed: 0.5, other speeds 0, duration 2.

    First, provide your detailed reasoning for the plan. Then, provide the final plan as a JSON object with a "plan" key containing an array of function calls.
    Each function call object must have "function" (string) and "args" (array of arguments).
    If the command is unclear, requires information not present in the context, or is impossible, return an empty plan and clearly explain why in the reasoning.
  `;

  try {
    const response = await ai.models.generateContent({
      model: proModel,
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reasoning: { type: Type.STRING },
            plan: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  function: { type: Type.STRING },
                  args: {
                    type: Type.ARRAY,
                    items: {},
                  }
                },
                required: ['function', 'args']
              }
            }
          }
        }
      },
    });

    const result = JSON.parse(response.text);
    const plan = result.plan || [];
    if (result.reasoning && plan.length > 0) {
      plan[0].reasoning = result.reasoning;
    } else if (result.reasoning) {
        return [{function: 'info', args: [], reasoning: result.reasoning}];
    }
    return plan;
  } catch (error) {
    console.error("Error getting command plan:", error);
    return [{ function: 'error', args: ['Failed to generate a plan.'], reasoning: 'An internal error occurred.' }];
  }
};


// Simulated Robot Control Functions
const simulateDelay = (duration_seconds: number) => new Promise(resolve => setTimeout(resolve, duration_seconds * 1000));

export const move = async (
  currentState: RobotState,
  setState: (state: React.SetStateAction<RobotState>) => void,
  forwardSpeed: number,
  sideSpeed: number,
  rotateSpeed: number,
  duration_seconds: number
): Promise<void> => {
  setState({ ...currentState, forwardSpeed, sideSpeed, rotateSpeed });
  await simulateDelay(duration_seconds);
  // After movement duration, reset speeds to 0 and revert to stand gait
  setState(prevState => ({ ...prevState, forwardSpeed: 0, sideSpeed: 0, rotateSpeed: 0, gaitType: 'stand' }));
};

export const set_posture = async (
  currentState: RobotState,
  setState: (state: React.SetStateAction<RobotState>) => void,
  bodyHeight: number,
  footRaiseHeight: number, // Note: footRaiseHeight is just for the command, not stored in state
  gaitType: 'trot' | 'walk' | 'run' | 'stand'
): Promise<void> => {
  setState({ ...currentState, bodyHeight, gaitType });
  await simulateDelay(1.5); // Posture change takes time
};

export const perform_action = async (action: string): Promise<void> => {
  const duration = action === 'dance' ? 5 : 2.5;
  await simulateDelay(duration);
};

export const interact_with_object = async (action: string, target_label: string): Promise<void> => {
  await simulateDelay(3); // Interaction takes time
};

export const wait = async (duration_seconds: number): Promise<void> => {
  await simulateDelay(duration_seconds);
};


// Audio utility functions for Gemini Live API
export const encode = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const decode = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}