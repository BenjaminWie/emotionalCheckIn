import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Mic, PhoneOff, Loader2, Volume2 } from 'lucide-react';
import { createPcmBlob, decodeBase64, decodeAudioData } from '../utils/audioUtils';

interface LiveSessionProps {
  onSessionEnd: (transcript: string) => void;
  onCancel: () => void;
}

const LiveSession: React.FC<LiveSessionProps> = ({ onSessionEnd, onCancel }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [isSpeaking, setIsSpeaking] = useState(false); // AI is speaking
  const [isUserSpeaking, setIsUserSpeaking] = useState(false); // User is speaking
  
  // Refs for audio handling
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Transcription history tracking
  const transcriptRef = useRef<{role: string, text: string}[]>([]);
  const currentInputTransRef = useRef<string>('');
  const currentOutputTransRef = useRef<string>('');

  useEffect(() => {
    let sessionPromise: Promise<any> | null = null;
    let isActive = true;

    const startSession = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Setup Audio Contexts
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        // Setup Microphone
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Connect to Gemini Live
        sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }, // Calm voice
            },
            systemInstruction: `
              You are a meditative, empathetic, and calm psychotherapist. 
              Your goal is to help the user identify and name their emotions.
              Speak slowly, softly, and concisely. Use a soothing tone.
              Ask one simple, open-ended question at a time.
              Do not diagnose. Just listen and help them explore their inner state.
              Start by gently asking how they are feeling right now.
            `,
            inputAudioTranscription: { model: "gemini-flash-latest" }, 
            outputAudioTranscription: { model: "gemini-flash-latest" },
          },
          callbacks: {
            onopen: () => {
              if (!isActive) return;
              console.log('Session connected');
              setStatus('connected');
              
              // Start streaming audio from mic
              if (inputAudioContextRef.current && streamRef.current) {
                const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
                const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                scriptProcessorRef.current = scriptProcessor;
                
                scriptProcessor.onaudioprocess = (e) => {
                  if (!isActive) return;
                  const inputData = e.inputBuffer.getChannelData(0);
                  
                  // Simple VAD visualizer
                  const rms = Math.sqrt(inputData.reduce((acc, val) => acc + val * val, 0) / inputData.length);
                  setIsUserSpeaking(rms > 0.02);

                  const pcmBlob = createPcmBlob(inputData);
                  sessionPromise?.then((session) => {
                    session.sendRealtimeInput({ media: pcmBlob });
                  });
                };
                
                source.connect(scriptProcessor);
                scriptProcessor.connect(inputAudioContextRef.current.destination);
              }
            },
            onmessage: async (message: LiveServerMessage) => {
              if (!isActive) return;

              // Handle Transcription
              if (message.serverContent?.outputTranscription) {
                currentOutputTransRef.current += message.serverContent.outputTranscription.text;
              }
              if (message.serverContent?.inputTranscription) {
                currentInputTransRef.current += message.serverContent.inputTranscription.text;
              }
              if (message.serverContent?.turnComplete) {
                if (currentInputTransRef.current) {
                  transcriptRef.current.push({ role: 'user', text: currentInputTransRef.current });
                  currentInputTransRef.current = '';
                }
                if (currentOutputTransRef.current) {
                   transcriptRef.current.push({ role: 'model', text: currentOutputTransRef.current });
                   currentOutputTransRef.current = '';
                }
                setIsSpeaking(false);
              }

              // Handle Audio Output
              const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio && outputAudioContextRef.current) {
                setIsSpeaking(true);
                const ctx = outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBytes = decodeBase64(base64Audio);
                const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                
                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) setIsSpeaking(false);
                });
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              }
            },
            onclose: () => {
              console.log('Session closed');
            },
            onerror: (err) => {
              console.error('Session error:', err);
              setStatus('error');
            }
          }
        });
      } catch (e) {
        console.error("Failed to start session", e);
        setStatus('error');
      }
    };

    startSession();

    return () => {
      isActive = false;
      sessionPromise?.then(session => session.close());
      streamRef.current?.getTracks().forEach(t => t.stop());
      inputAudioContextRef.current?.close();
      outputAudioContextRef.current?.close();
    };
  }, []);

  const handleFinish = () => {
    // Compile full transcript
    let finalTranscript = transcriptRef.current.map(t => `${t.role}: ${t.text}`).join('\n');
    // Add any pending transcription
    if (currentInputTransRef.current) finalTranscript += `\nuser: ${currentInputTransRef.current}`;
    if (currentOutputTransRef.current) finalTranscript += `\nmodel: ${currentOutputTransRef.current}`;
    
    // Fallback if transcript is empty (e.g. short session)
    if (!finalTranscript) finalTranscript = "User engaged in a silent meditative session.";

    onSessionEnd(finalTranscript);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-8 fade-in relative overflow-hidden">
      
      {/* Dynamic Background */}
      <div className={`absolute inset-0 transition-opacity duration-1000 ${isSpeaking ? 'opacity-30' : 'opacity-0'} bg-indigo-500 blur-[120px]`}></div>
      <div className={`absolute inset-0 transition-opacity duration-1000 ${isUserSpeaking ? 'opacity-20' : 'opacity-0'} bg-teal-500 blur-[120px]`}></div>

      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        {status === 'connecting' && (
           <div className="text-slate-400 flex flex-col items-center gap-4">
             <Loader2 className="w-8 h-8 animate-spin text-indigo-400"/>
             <p className="text-sm tracking-widest uppercase">Connecting...</p>
           </div>
        )}

        {status === 'error' && (
            <div className="text-center space-y-4">
                <p className="text-red-400">Connection Interrupted</p>
                <button onClick={onCancel} className="text-slate-400 underline">Go back</button>
            </div>
        )}

        {status === 'connected' && (
          <div className="flex flex-col items-center gap-12">
            {/* Meditative Orb Visualizer */}
            <div className="relative w-64 h-64 flex items-center justify-center">
               
               {/* Core AI Orb */}
               <div 
                  className={`absolute w-32 h-32 rounded-full bg-indigo-400 blur-xl transition-all duration-700 mix-blend-screen 
                  ${isSpeaking ? 'scale-150 opacity-100' : 'scale-100 opacity-60'}`}
               />
               <div className="relative w-32 h-32 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-[0_0_40px_rgba(99,102,241,0.3)] z-10 flex items-center justify-center">
                    {isSpeaking ? (
                        <Volume2 className="w-8 h-8 text-indigo-100 animate-pulse" />
                    ) : isUserSpeaking ? (
                         <Mic className="w-8 h-8 text-teal-200" />
                    ) : (
                        <div className="w-2 h-2 rounded-full bg-white/50" />
                    )}
               </div>

               {/* User Voice Ripple */}
               <div 
                className={`absolute inset-0 rounded-full border border-teal-500/30 transition-all duration-200
                ${isUserSpeaking ? 'scale-125 opacity-100' : 'scale-90 opacity-0'}`}
               />
               <div 
                className={`absolute inset-0 rounded-full border border-teal-500/20 transition-all duration-200 delay-75
                ${isUserSpeaking ? 'scale-150 opacity-80' : 'scale-90 opacity-0'}`}
               />

            </div>
            
            <p className="text-slate-400 font-light tracking-wide text-sm text-center max-w-xs">
                {isSpeaking ? "Listen..." : "Speak freely..."}
            </p>

            <div className="flex gap-6">
                <button 
                    onClick={onCancel}
                    className="w-14 h-14 rounded-full bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition-all flex items-center justify-center"
                >
                    <PhoneOff className="w-6 h-6" />
                </button>
                <button
                    onClick={handleFinish}
                    className="px-8 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all"
                >
                    Finish & Analyze
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveSession;
