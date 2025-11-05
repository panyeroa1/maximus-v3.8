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

export interface RobotState {
  bodyHeight: number; // 0.0 to 1.0
  gaitType: 'trot' | 'walk' | 'run' | 'stand';
  forwardSpeed: number; // -1.0 to 1.0
  sideSpeed: number; // -1.0 to 1.0
  rotateSpeed: number; // -1.0 to 1.0
}
