export interface DetectedObject {
  id: string; // A unique identifier for the object instance
  point: [number, number]; // [y, x]
  label: string;
}

export interface OcrResult {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  text: string;
}

export interface PlanStep {
  function: string;
  args: (string | number | boolean)[];
  reasoning?: string; // Optional reasoning from the model for the first step
}

export interface TranscriptEntry {
  speaker: 'user' | 'eburon';
  text: string;
}
