import { GoogleGenAI, Type, Chat } from "@google/genai";
import { EmotionResult } from "../types";

export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Prompt system instruction to ensure precise, granular emotion words.
const SYSTEM_INSTRUCTION = `
You are an expert psychologist and poet specializing in granular emotional vocabulary.
Your goal is to identify the ONE specific, official, or well-established poetic emotion word that best fits the user's state.
Do NOT just make up random words unless they are established neologisms like from 'The Dictionary of Obscure Sorrows'.
Prioritize words like: 'Sonder', 'Vellichor', 'Anemoia', 'Kenopsia', 'Liberosis', 'Limerence', 'Hiraeth', 'Saudade', 'Mono-no-aware'.
If it is a common emotion, find the most precise synonym (e.g., instead of "Sad", use "Melancholy" or "Wistfulness").
The definition should be poetic, validating, and concise.
The visual prompt should be "psychotropic", abstract, calm, and surreal.
`;

const emotionSchema = {
  type: Type.OBJECT,
  properties: {
    emotion: {
      type: Type.STRING,
      description: "A single, precise, evocative word describing the emotion.",
    },
    definition: {
      type: Type.STRING,
      description: "A concise, 1-sentence poetic definition of this state.",
    },
    visualPrompt: {
      type: Type.STRING,
      description: "A detailed description for an image generator. Keywords: psychotropic, bioluminescent, deep colors, dreamscape, abstract fluids, ethereal.",
    },
    colorHex: {
      type: Type.STRING,
      description: "A hex color code (e.g., #FF5733) that matches this mood. Prefer vibrant, deep, or neon-pastel tones suitable for dark mode.",
    },
  },
  required: ["emotion", "definition", "visualPrompt", "colorHex"],
};

export const analyzeText = async (text: string): Promise<EmotionResult> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this check-in: "${text}"`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: emotionSchema,
      },
    });

    const jsonStr = response.text || "{}";
    return JSON.parse(jsonStr) as EmotionResult;
  } catch (error) {
    console.error("Text analysis failed:", error);
    throw new Error("Could not analyze text.");
  }
};

export const analyzeAudio = async (base64Audio: string): Promise<{ transcript: string; analysis: EmotionResult }> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "audio/webm; codecs=opus", 
              data: base64Audio,
            },
          },
          {
            text: "First, transcribe this audio exactly. Then, analyze the emotional content according to the system instruction. Return JSON.",
          },
        ],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            analysis: {
              type: Type.OBJECT,
              properties: emotionSchema.properties,
              required: emotionSchema.required,
            }
          },
          required: ["transcript", "analysis"]
        }
      },
    });

    const jsonStr = response.text || "{}";
    return JSON.parse(jsonStr) as { transcript: string; analysis: EmotionResult };
  } catch (error) {
    console.error("Audio analysis failed:", error);
    throw new Error("Could not analyze audio.");
  }
};

export const generateEmotionImage = async (visualPrompt: string): Promise<string> => {
  try {
    // Enhanced prompt for the requested "psychotropic" style
    const enhancedPrompt = `Create a very beautiful, calm, artistic, abstract artwork. 
    Style: Psychotropic, Bioluminescent, Surreal, Dreamlike, High definition, Digital Art. 
    Colors: Deep, glowing, translucent.
    Subject: ${visualPrompt}. 
    No text. No faces.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [{ text: enhancedPrompt }],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image data returned.");
  } catch (error) {
    console.error("Image generation failed:", error);
    return `https://picsum.photos/800/800?blur=5`; 
  }
};

// --- Interview Mode ---

export const createInterviewChat = (): Chat => {
  return ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are an empathetic, calm interviewer helping someone discover their precise emotional state. 
      Ask short, gentle, open-ended questions to dig deeper into their feelings. 
      Do not diagnose. Do not offer solutions. Just explore.
      Keep your responses to 1-2 sentences maximum.
      Start by asking how they are feeling right now.`,
    },
  });
};

export const analyzeInterview = async (history: string): Promise<EmotionResult> => {
    return analyzeText(`Based on this interview transcript, analyze the user's emotion:\n\n${history}`);
};