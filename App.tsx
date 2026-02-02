import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  History as HistoryIcon, 
  ArrowLeft, 
  Send, 
  Loader2,
  Sparkles,
  Mic,
  Type,
  MessageCircle,
  Zap
} from 'lucide-react';
import BubbleBackground from './components/BubbleBackground';
import VoiceRecorder from './components/VoiceRecorder';
import LiveSession from './components/LiveSession';
import { analyzeText, analyzeAudio, generateEmotionImage, createInterviewChat, analyzeInterview } from './services/geminiService';
import { CheckIn, AppState, EmotionResult, InputMode } from './types';
import { Chat, GenerateContentResponse } from "@google/genai";

// Helper to generate a unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

const MAX_CHAT_TURNS = 7;

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.HOME);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // State for result display
  const [currentResult, setCurrentResult] = useState<EmotionResult | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentInputSummary, setCurrentInputSummary] = useState('');
  const [selectedCheckIn, setSelectedCheckIn] = useState<CheckIn | null>(null);

  // Interview State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInstance, setChatInstance] = useState<Chat | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('checkIns');
    if (saved) {
      setCheckIns(JSON.parse(saved));
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('checkIns', JSON.stringify(checkIns));
  }, [checkIns]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatBottomRef.current) {
        chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleTextSubmit = async () => {
    if (!currentInput.trim()) return;
    setIsProcessing(true);
    setAppState(AppState.ANALYZING);

    try {
      const emotionData = await analyzeText(currentInput);
      setCurrentResult(emotionData);
      setCurrentInputSummary(currentInput);
      
      const image = await generateEmotionImage(emotionData.visualPrompt);
      setCurrentImage(image);
      
      setAppState(AppState.RESULT);
    } catch (error) {
      console.error(error);
      alert("Failed to analyze. Please try again.");
      setAppState(AppState.NEW_ENTRY);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAudioReady = async (base64Audio: string) => {
    setIsProcessing(true);
    setAppState(AppState.ANALYZING);

    try {
      const { transcript, analysis } = await analyzeAudio(base64Audio);
      setCurrentResult(analysis);
      setCurrentInputSummary(transcript);
      
      const image = await generateEmotionImage(analysis.visualPrompt);
      setCurrentImage(image);
      
      setAppState(AppState.RESULT);
    } catch (error) {
      console.error(error);
      alert("Failed to process audio. Please try again.");
      setAppState(AppState.NEW_ENTRY);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Interview Logic ---
  const startInterview = () => {
      const chat = createInterviewChat();
      setChatInstance(chat);
      setChatMessages([]);
      setInputMode('interview');
      // Trigger first message from AI proactively
      sendInterviewMessage(chat, "Hello."); 
  };
  
  const startLiveSession = () => {
      setInputMode('live');
      // LiveSession component will handle immediate connection upon mounting
  };

  const sendInterviewMessage = async (chat: Chat, message: string, isUser: boolean = false) => {
      let finalMessage = message;

      if (isUser) {
          // Check turn count (user messages / 2 approx, or just count user messages)
          const userMsgCount = chatMessages.filter(m => m.role === 'user').length;
          
          if (userMsgCount >= MAX_CHAT_TURNS - 1) {
              finalMessage += " [SYSTEM: This is the final turn. Please provide a brief comforting conclusion, summarize the emotion you sensed, and end the conversation.]";
          }
          
          setChatMessages(prev => [...prev, { role: 'user', text: message }]); // Show original message to user
          setCurrentInput('');
      }

      setIsProcessing(true);
      try {
          // If first system start message, use as is.
          const msgToSend = isUser ? finalMessage : "Start the conversation by asking me how I am feeling.";
          const result: GenerateContentResponse = await chat.sendMessage({ message: msgToSend });
          const responseText = result.text || "";
          setChatMessages(prev => [...prev, { role: 'model', text: responseText }]);
      } catch (e) {
          console.error(e);
      } finally {
          setIsProcessing(false);
      }
  };

  const finishInterview = async (transcriptOverride?: string) => {
      // Use transcriptOverride if coming from LiveSession, otherwise build from chatMessages
      const conversation = transcriptOverride || chatMessages.map(m => `${m.role}: ${m.text}`).join('\n');
      
      if (!conversation.trim()) return;

      setIsProcessing(true);
      setAppState(AppState.ANALYZING);
      
      try {
        const emotionData = await analyzeInterview(conversation);
        setCurrentResult(emotionData);
        // Summarize differently depending on mode
        setCurrentInputSummary(transcriptOverride ? "Live Therapy Session Transcript" : "Chat Interview Summary");
        
        const image = await generateEmotionImage(emotionData.visualPrompt);
        setCurrentImage(image);
        
        setAppState(AppState.RESULT);
      } catch (error) {
        console.error(error);
        alert("Failed to analyze conversation.");
        setAppState(AppState.NEW_ENTRY);
      } finally {
        setIsProcessing(false);
      }
  };

  const saveCheckIn = () => {
    if (!currentResult || !currentImage) return;

    const newCheckIn: CheckIn = {
      id: generateId(),
      timestamp: Date.now(),
      inputSummary: currentInputSummary,
      inputType: inputMode,
      result: currentResult,
      imageUrl: currentImage,
    };

    setCheckIns([newCheckIn, ...checkIns]);
    setAppState(AppState.HOME);
    setCurrentInput('');
    setCurrentImage(null);
    setCurrentResult(null);
    setChatMessages([]);
    setChatInstance(null);
  };

  // --- Views ---

  const renderHome = () => (
    <div className="flex flex-col h-full max-w-md mx-auto p-6 relative">
      <header className="flex justify-between items-center mb-8 fade-in">
        <div>
          <h1 className="text-3xl font-semibold text-slate-100 tracking-tight">Check-ins</h1>
          <p className="text-slate-400">How are you feeling?</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur p-2 rounded-full border border-slate-700 shadow-sm">
          <HistoryIcon className="text-slate-400 w-6 h-6" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 pb-24 no-scrollbar">
        {checkIns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 bg-slate-900/30 backdrop-blur rounded-3xl border border-slate-800/50 fade-in">
            <Sparkles className="w-12 h-12 text-indigo-400 mb-4" />
            <p className="text-slate-300 font-medium">No emotions recorded yet.</p>
            <p className="text-slate-500 text-sm mt-2">Tap the + button to capture your first feeling.</p>
          </div>
        ) : (
          checkIns.map((checkIn) => (
            <div 
              key={checkIn.id}
              onClick={() => {
                setSelectedCheckIn(checkIn);
                setAppState(AppState.DETAILS);
              }}
              className="group relative overflow-hidden bg-slate-900/40 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-slate-800/50 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 fade-in"
            >
              <div className="flex items-center gap-4">
                {checkIn.imageUrl && (
                  <div className="w-16 h-16 rounded-xl overflow-hidden shadow-inner flex-shrink-0 bg-slate-800">
                    <img src={checkIn.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-200" style={{ color: checkIn.result.colorHex }}>
                    {checkIn.result.emotion}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                    {new Date(checkIn.timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div 
                className="absolute inset-0 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity mix-blend-screen"
                style={{ backgroundColor: checkIn.result.colorHex }}
              />
            </div>
          ))
        )}
      </div>

      <button 
        onClick={() => {
            setAppState(AppState.NEW_ENTRY);
            setInputMode('text'); // Reset to default
            setChatMessages([]); // Reset chat
        }}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full p-4 shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all hover:scale-110 active:scale-90 z-20"
      >
        <Plus className="w-8 h-8" />
      </button>
    </div>
  );

  const renderNewEntry = () => {
    // Specialized view for Live Session
    if (inputMode === 'live') {
      return (
        <LiveSession 
          onSessionEnd={(transcript) => finishInterview(transcript)} 
          onCancel={() => setInputMode('text')} 
        />
      );
    }

    const userMsgCount = chatMessages.filter(m => m.role === 'user').length;
    const isChatFinished = userMsgCount >= MAX_CHAT_TURNS;

    return (
      <div className="flex flex-col h-full max-w-md mx-auto p-6 fade-in">
        <div className="flex justify-between items-center mb-6">
          <button 
              onClick={() => setAppState(AppState.HOME)} 
              className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800/50 backdrop-blur hover:bg-slate-800 text-slate-400 transition-colors"
          >
              <ArrowLeft className="w-5 h-5" />
          </button>
          {inputMode === 'interview' && (
              <button
                  onClick={() => finishInterview()}
                  disabled={chatMessages.length < 2 || isProcessing}
                  className="px-4 py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold rounded-full shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                  Analyze
              </button>
          )}
        </div>

        {inputMode !== 'interview' && (
            <h2 className="text-2xl font-semibold text-slate-100 mb-6">Capture the moment</h2>
        )}

        {/* Mode Toggle */}
        <div className="flex bg-slate-900/50 p-1 rounded-full mb-6 self-center border border-slate-800 overflow-x-auto max-w-full">
          <button
            onClick={() => setInputMode('text')}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              inputMode === 'text' ? 'bg-slate-700 shadow-sm text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Type className="w-3 h-3" /> Int
            </div>
          </button>
          <button
            onClick={() => setInputMode('voice')}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              inputMode === 'voice' ? 'bg-slate-700 shadow-sm text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Mic className="w-3 h-3" /> Voice
            </div>
          </button>
          <button
            onClick={startInterview}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              inputMode === 'interview' ? 'bg-slate-700 shadow-sm text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <MessageCircle className="w-3 h-3" /> Chat
            </div>
          </button>
          <button
            onClick={startLiveSession}
            className="px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap text-slate-500 hover:text-slate-300"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3" /> Live
            </div>
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center overflow-hidden">
          {inputMode === 'text' && (
            <div className="space-y-4">
              <textarea
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                placeholder="Describe how you feel right now... The stream of consciousness, words, colors, sensations."
                className="w-full h-48 p-6 rounded-3xl bg-slate-800/40 backdrop-blur-md border border-slate-700/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-lg text-slate-200 placeholder:text-slate-500 resize-none shadow-inner"
              />
              <button
                onClick={handleTextSubmit}
                disabled={!currentInput.trim() || isProcessing}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-2xl py-4 font-medium shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all flex items-center justify-center gap-2"
              >
                {isProcessing ? <Loader2 className="animate-spin w-5 h-5" /> : <><Send className="w-5 h-5" /> Find my words</>}
              </button>
            </div>
          )}

          {inputMode === 'voice' && (
            <VoiceRecorder onAudioReady={handleAudioReady} isProcessing={isProcessing} />
          )}

          {inputMode === 'interview' && (
              <div className="flex flex-col h-full">
                  {/* Chat History */}
                  <div className="flex-1 overflow-y-auto space-y-4 p-2 no-scrollbar mb-4">
                      {chatMessages.length === 0 && isProcessing && (
                          <div className="flex justify-start">
                              <div className="bg-slate-800/80 p-4 rounded-2xl rounded-tl-none max-w-[80%]">
                                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400"/>
                              </div>
                          </div>
                      )}
                      {chatMessages.map((msg, idx) => (
                          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div 
                                  className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-2 ${
                                      msg.role === 'user' 
                                      ? 'bg-indigo-600 text-white rounded-tr-none' 
                                      : 'bg-slate-800/80 backdrop-blur text-slate-200 rounded-tl-none border border-slate-700'
                                  }`}
                              >
                                  {msg.text}
                              </div>
                          </div>
                      ))}
                      {isProcessing && chatMessages.length > 0 && (
                          <div className="flex justify-start">
                              <div className="bg-slate-800/80 p-4 rounded-2xl rounded-tl-none max-w-[80%]">
                                  <span className="flex gap-1">
                                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"/>
                                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"/>
                                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"/>
                                  </span>
                              </div>
                          </div>
                      )}
                      <div ref={chatBottomRef} />
                  </div>
                  
                  {/* Chat Input */}
                  <div className="relative">
                      {isChatFinished ? (
                         <div className="w-full text-center py-4 bg-slate-800/60 rounded-full text-slate-400 text-sm border border-slate-700">
                            Session wrapped up. Please tap Analyze.
                         </div>
                      ) : (
                        <>
                            <input
                                type="text"
                                value={currentInput}
                                onChange={(e) => setCurrentInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !isProcessing && currentInput.trim() && chatInstance) {
                                        sendInterviewMessage(chatInstance, currentInput, true);
                                    }
                                }}
                                placeholder={isProcessing ? "Waiting for response..." : "Type your answer..."}
                                disabled={isProcessing}
                                className="w-full bg-slate-800/60 backdrop-blur border border-slate-700 rounded-full py-4 pl-6 pr-12 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
                            />
                            <button 
                                onClick={() => chatInstance && currentInput.trim() && sendInterviewMessage(chatInstance, currentInput, true)}
                                disabled={!currentInput.trim() || isProcessing}
                                className="absolute right-2 top-2 p-2 bg-indigo-600 rounded-full text-white disabled:bg-transparent disabled:text-slate-600 transition-colors"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </>
                      )}
                  </div>
              </div>
          )}
        </div>
      </div>
    );
  };

  const renderAnalyzing = () => (
    <div className="flex flex-col h-full items-center justify-center max-w-md mx-auto p-6 fade-in text-center">
      <div className="relative w-40 h-40 mb-8">
        <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full animate-pulse"></div>
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 bg-indigo-400 rounded-full animate-bounce delay-0 shadow-[0_0_10px_rgba(129,140,248,0.8)]"></div>
            <div className="w-4 h-4 bg-fuchsia-400 rounded-full animate-bounce delay-100 mx-3 shadow-[0_0_10px_rgba(232,121,249,0.8)]"></div>
            <div className="w-4 h-4 bg-teal-400 rounded-full animate-bounce delay-200 shadow-[0_0_10px_rgba(45,212,191,0.8)]"></div>
        </div>
      </div>
      <h3 className="text-xl font-medium text-slate-200">Exploring the depths...</h3>
      <p className="text-slate-500 mt-2 text-sm">Finding the precise words for your soul.</p>
    </div>
  );

  const renderResult = () => {
    if (!currentResult) return null;

    return (
      <div className="flex flex-col h-full max-w-md mx-auto p-6 fade-in overflow-y-auto">
        <div className="flex-1 flex flex-col items-center pt-4">
          
          {/* Generated Image - Psychotropic Style */}
          <div className="relative w-72 h-72 rounded-full overflow-hidden shadow-[0_0_50px_rgba(79,70,229,0.15)] border border-slate-700/50 mb-8 ring-1 ring-white/10">
            {currentImage ? (
              <img src={currentImage} alt="Emotion visualization" className="w-full h-full object-cover scale-105" />
            ) : (
              <div className="w-full h-full bg-slate-800 animate-pulse" />
            )}
            {/* Glossy overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent pointer-events-none" />
          </div>

          {/* Text Content */}
          <div className="text-center w-full bg-slate-900/60 backdrop-blur-xl rounded-3xl p-8 border border-slate-700/50 shadow-2xl">
            <h2 
              className="text-4xl font-bold mb-4 tracking-tight drop-shadow-sm"
              style={{ color: currentResult.colorHex }}
            >
              {currentResult.emotion}
            </h2>
            <div className="w-12 h-1 bg-slate-700 mx-auto mb-4 rounded-full" />
            <p className="text-lg text-slate-300 leading-relaxed font-light italic">
              "{currentResult.definition}"
            </p>
          </div>

          {/* Transcript/Input Summary */}
          <div className="mt-8 w-full px-4 border-t border-slate-800/50 pt-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">Your check-in</p>
            <p className="text-sm text-slate-400 text-center italic line-clamp-3">
              "{currentInputSummary}"
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 pb-4">
            <button
              onClick={() => {
                setAppState(AppState.NEW_ENTRY);
                setCurrentResult(null);
                setCurrentImage(null);
              }}
              className="w-full bg-transparent hover:bg-slate-800 text-slate-400 rounded-2xl py-4 font-medium border border-slate-700 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={saveCheckIn}
              className="w-full bg-slate-100 hover:bg-white text-slate-900 rounded-2xl py-4 font-medium shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-colors"
            >
              Keep this
            </button>
        </div>
      </div>
    );
  };

  const renderDetails = () => {
    if (!selectedCheckIn) return null;

    return (
        <div className="flex flex-col h-full max-w-md mx-auto p-6 fade-in overflow-y-auto">
           <button 
            onClick={() => {
                setSelectedCheckIn(null);
                setAppState(AppState.HOME);
            }} 
            className="mb-6 w-10 h-10 flex items-center justify-center rounded-full bg-slate-800/50 backdrop-blur hover:bg-slate-700 text-slate-300 transition-colors z-10"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 flex flex-col items-center">
            {/* Image */}
            <div className="relative w-full aspect-square max-w-[320px] rounded-[3rem] overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)] border border-slate-700/50 mb-10">
              {selectedCheckIn.imageUrl && (
                <img src={selectedCheckIn.imageUrl} alt="Emotion" className="w-full h-full object-cover" />
              )}
            </div>

            {/* Content */}
            <div className="text-center w-full mb-8">
                <h2 
                    className="text-5xl font-bold mb-6 tracking-tight drop-shadow-lg"
                    style={{ color: selectedCheckIn.result.colorHex }}
                >
                    {selectedCheckIn.result.emotion}
                </h2>
                <p className="text-xl text-slate-300 leading-relaxed font-light px-2">
                    {selectedCheckIn.result.definition}
                </p>
            </div>

            <div className="w-full bg-slate-900/40 backdrop-blur rounded-2xl p-6 border border-slate-800/50">
                <div className="flex items-center gap-2 mb-3 text-slate-500 text-xs font-bold uppercase tracking-wider">
                     {selectedCheckIn.inputType === 'voice' && <Mic className="w-3 h-3"/>}
                     {selectedCheckIn.inputType === 'text' && <Type className="w-3 h-3"/>}
                     {selectedCheckIn.inputType === 'interview' && <MessageCircle className="w-3 h-3"/>}
                     {selectedCheckIn.inputType === 'live' && <Zap className="w-3 h-3"/>}
                     {/* Legacy support or generic fallback */}
                     {!['voice', 'text', 'interview', 'live'].includes(selectedCheckIn.inputType) && <Zap className="w-3 h-3"/>}
                     Original Note
                </div>
                <p className="text-slate-400 italic text-sm leading-relaxed">
                    "{selectedCheckIn.inputSummary}"
                </p>
                <div className="mt-4 text-xs text-slate-600 text-right font-mono">
                    {new Date(selectedCheckIn.timestamp).toLocaleString()}
                </div>
            </div>
            
            <div className="h-12"/> {/* Spacer */}
          </div>
        </div>
    )
  }

  return (
    <div className="relative min-h-screen">
      <BubbleBackground />
      
      {appState === AppState.HOME && renderHome()}
      {appState === AppState.NEW_ENTRY && renderNewEntry()}
      {appState === AppState.ANALYZING && renderAnalyzing()}
      {appState === AppState.RESULT && renderResult()}
      {appState === AppState.DETAILS && renderDetails()}
    </div>
  );
};

export default App;