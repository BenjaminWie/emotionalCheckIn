export interface EmotionResult {
  emotion: string;
  definition: string;
  visualPrompt: string;
  colorHex: string;
}

export type InputMode = 'text' | 'voice' | 'interview' | 'live';

export interface CheckIn {
  id: string;
  timestamp: number;
  inputSummary: string; // The text or transcript summary
  inputType: InputMode;
  result: EmotionResult;
  imageUrl?: string;
}

export enum AppState {
  HOME,
  NEW_ENTRY,
  ANALYZING,
  RESULT,
  DETAILS
}