export interface EmotionResult {
  emotion: string;
  definition: string;
  visualPrompt: string;
  colorHex: string;
}

export interface CheckIn {
  id: string;
  timestamp: number;
  inputSummary: string; // The text or transcript summary
  inputType: 'text' | 'voice';
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
