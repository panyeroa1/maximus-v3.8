import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DetectedObject, PlanStep, OcrResult } from '../types';

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
    You are the "brain" of the Eburon robot. You receive a command from an operator and must convert it into a sequence of actions.

    ## Available Functions:
    - move(x: number, y: number, high: boolean): Moves the arm to normalized coordinates. 'high' avoids obstacles.
    - setGripperState(opened: boolean): true to open gripper, false to close.
    - returnToOrigin(): Returns the robot to a safe, neutral pose.

    ## Context:
    - Operator Command: "${command}"
    ${context.selectedObject ? `- The command specifically targets: "${context.selectedObject.label}" at [y:${context.selectedObject.point[0]}, x:${context.selectedObject.point[1]}].` : ''}
    - Other objects in the scene:
    ${availableObjects || 'None detected.'}
    - Readable text in the scene:
    ${ocrTextContext || 'None detected.'}

    ## Task:
    Based on the command and context, create a step-by-step plan using the available functions. Your plan must be logical and physically plausible for a robot arm. When moving an object to a destination, you must find the coordinates for both the object and the destination from the 'Other objects in the scene' context.

    **Example Logic for a "pick and place" task:**
    1.  **Approach:** Move the gripper high above the target object.
    2.  **Prepare:** Open the gripper.
    3.  **Grasp:** Move the gripper down to the object.
    4.  **Secure:** Close the gripper.
    5.  **Lift:** Move the gripper up to a safe height.
    6.  **Transport:** Move the gripper high above the destination.
    7.  **Place:** Move the gripper down to the destination.
    8.  **Release:** Open the gripper.
    9.  **Retreat:** Move the gripper back up.
    10. **Reset:** Use 'returnToOrigin()' after the task is complete.

    First, provide your detailed reasoning for the specific command, including which objects and coordinates you are using. Then, provide the final plan as a JSON object with a "plan" key containing an array of function calls.
    Each function call object must have "function" (string) and "args" (array of arguments).
    If the command is unclear, requires information not present in the context (e.g., location of an unseen object), or is impossible, return an empty plan and clearly explain why in the reasoning.
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


export async function* executePlan(plan: PlanStep[]): AsyncGenerator<string> {
  yield "Executing plan...";
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const step of plan) {
    const argsString = step.args.join(', ');
    const logMessage = `Executing: ${step.function}(${argsString})`;
    yield logMessage;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  yield "Plan execution complete.";
}

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