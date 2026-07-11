import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Send, Mic, MicOff, Volume2, VolumeX, MapPin, 
  AlertTriangle, Navigation, Clock, Shield, Compass, ChevronRight 
} from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: 'Welcome to StadeX. I am your multi-agent FIFA venue assistant. I can guide you through the gates, suggest fast paths based on live queue times, translate, or explain venue policies. How can I assist you?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      agent: 'system'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [language, setLanguage] = useState('English');
  const [isListening, setIsListening] = useState(false);
  const [isSpeakEnabled, setIsSpeakEnabled] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [recommendedGate, setRecommendedGate] = useState(null);
  const [selectedGate, setSelectedGate] = useState('C'); // Default selection
  const [gateStatuses, setGateStatuses] = useState({});

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Poll live gate status every 5 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/gate-status');
        if (res.ok) {
          const data = await res.json();
          setGateStatuses(data);
        }
      } catch (err) {
        console.error('Error fetching gate status:', err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Set up Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      
      // Match language code
      const getLangCode = (name) => {
        switch(name) {
          case 'Spanish': return 'es-ES';
          case 'French': return 'fr-FR';
          case 'Portuguese': return 'pt-PT';
          case 'Mandarin': return 'zh-CN';
          case 'Arabic': return 'ar-SA';
          default: return 'en-US';
        }
      };
      
      rec.lang = getLangCode(language);

      rec.onstart = () => setIsListening(true);
      rec.onend = () => setIsListening(false);
      rec.onerror = (e) => {
        console.error('Speech recognition error:', e);
        setIsListening(false);
      };
      rec.onresult = (event) => {
        const text = event.results[0][0].transcript;
        setInputText(text);
        handleSendMessage(text);
      };
      
      recognitionRef.current = rec;
    }
  }, [language]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setInputText('');
      recognitionRef.current.start();
    }
  };

  const speakText = (text, langName) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // stop any current speech

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Map language code for voices
    const getLangCode = (name) => {
      switch(name) {
        case 'Spanish': return 'es-ES';
        case 'French': return 'fr-FR';
        case 'Portuguese': return 'pt-PT';
        case 'Mandarin': return 'zh-CN';
        case 'Arabic': return 'ar-EG';
        default: return 'en-US';
      }
    };

    utterance.lang = getLangCode(langName);
    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    // Add user message
    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          role: 'fan',
          language
        })
      });

      if (!res.ok) throw new Error('API server error');
      const data = await res.json();

      setIsTyping(false);

      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        agent: data.agent_used
      };

      setMessages(prev => [...prev, botMsg]);

      // If voice enabled, speak the answer
      if (isSpeakEnabled) {
        speakText(data.reply, language);
      }

      // Highlight recommended gate if returned
      if (data.data?.recommended_gate) {
        setRecommendedGate(data.data.recommended_gate);
        setSelectedGate(data.data.recommended_gate);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setIsTyping(false);
      
      setMessages(prev => [...prev, {
        id: Date.now() + 2,
        sender: 'bot',
        text: 'Sorry, I encountered an issue connecting to the orchestrator. Please check that the server is running.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        agent: 'error'
      }]);
    }
  };

  const activeGateStatus = gateStatuses[selectedGate] || { occupancy_pct: 0, queue_len_min: 0 };

  return (
    <div className="min-h-screen bg-stadium-bg text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800/80 px-6 py-4 bg-stadium-card/60 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-bold text-white shadow-md shadow-cyan-500/20">
            <Compass size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-cyan-400 bg-clip-text text-transparent">
              StadeX
            </h1>
            <p className="text-xs text-slate-400 font-medium tracking-wide">FIFA WORLD CUP 2026 Venue Ops</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold animate-pulse-slow">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Orchestrator Live
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        {/* Left: Chat Panel */}
        <section className="lg:col-span-5 flex flex-col glass-card rounded-2xl overflow-hidden shadow-2xl h-[calc(100vh-140px)] min-h-[500px]">
          {/* Chat Header controls */}
          <div className="p-4 border-b border-slate-800/70 bg-stadium-card/40 flex justify-between items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-cyan-400 tracking-wider uppercase">Language:</span>
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-slate-900 border border-slate-700/80 text-slate-200 rounded-lg text-sm px-2.5 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer font-medium"
              >
                <option value="English">English</option>
                <option value="Spanish">Español</option>
                <option value="French">Français</option>
                <option value="Portuguese">Português</option>
                <option value="Mandarin">普通话</option>
                <option value="Arabic">العربية</option>
              </select>
            </div>

            <button
              onClick={() => setIsSpeakEnabled(!isSpeakEnabled)}
              title={isSpeakEnabled ? "Disable Read Aloud" : "Enable Read Aloud"}
              className={`p-2 rounded-lg transition-all border ${
                isSpeakEnabled 
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-md' 
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isSpeakEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {messages.map((msg) => (
              <div 
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1.5">
                  <span className="text-[10px] text-slate-500 font-medium">
                    {msg.sender === 'user' ? 'You' : 'StadeX'}
                  </span>
                  {msg.agent && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                      msg.agent === 'navigation_agent' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                      msg.agent === 'crowd_agent' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      msg.agent === 'language_agent' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {msg.agent.replace('_', ' ')}
                    </span>
                  )}
                  <span className="text-[9px] text-slate-600 font-light">{msg.timestamp}</span>
                </div>

                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.sender === 'user' 
                    ? 'bg-gradient-to-br from-cyan-600 to-cyan-700 text-white rounded-tr-none shadow-md shadow-cyan-600/10' 
                    : 'bg-slate-900/80 border border-slate-800 text-slate-100 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5 mb-1 px-1.5">
                  <span className="text-[10px] text-slate-500 font-medium">Orchestrator routing...</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl rounded-tl-none px-4 py-3 flex gap-1.5 items-center">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Chat input box */}
          <div className="p-4 border-t border-slate-800/80 bg-stadium-card/20">
            <div className="flex gap-2">
              <button
                onClick={toggleListening}
                className={`p-3.5 rounded-xl border flex items-center justify-center transition-all ${
                  isListening 
                    ? 'bg-red-500 border-red-400 text-white animate-pulse shadow-lg shadow-red-500/30' 
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-slate-100'
                }`}
                title={isListening ? "Listening... Click to Stop" : "Click to speak"}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={isListening ? "Listening..." : "Ask directions, line lengths, transit..."}
                className="flex-1 bg-slate-900 border border-slate-800/80 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-100 placeholder-slate-500 transition-colors"
                disabled={isListening}
              />

              <button
                onClick={() => handleSendMessage()}
                className="p-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white transition-colors flex items-center justify-center shadow-lg shadow-cyan-600/10"
                disabled={!inputText.trim()}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </section>

        {/* Right: Stadium Map Panel */}
        <section className="lg:col-span-7 flex flex-col gap-6 h-[calc(100vh-140px)] min-h-[500px]">
          {/* Map Visual */}
          <div className="flex-1 glass-card rounded-2xl p-4 flex flex-col relative overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center mb-4 z-10">
              <div className="flex items-center gap-2">
                <Compass className="text-cyan-400" size={18} />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Interactive Map Panel</h2>
              </div>
              {recommendedGate && (
                <button 
                  onClick={() => setRecommendedGate(null)}
                  className="text-xs text-cyan-400 font-semibold hover:text-cyan-300 transition-colors bg-cyan-950/40 border border-cyan-800/50 px-2 py-1 rounded"
                >
                  Clear Route Highlight
                </button>
              )}
            </div>

            {/* SVG Stadium Map */}
            <div className="flex-1 flex items-center justify-center p-2 relative bg-slate-950/20 rounded-xl border border-slate-900/60">
              <svg viewBox="0 0 800 500" className="w-full h-full max-h-[420px] drop-shadow-[0_15px_15px_rgba(0,0,0,0.4)]">
                {/* Background Grid */}
                <defs>
                  <radialGradient id="fieldGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1e3a2f" />
                    <stop offset="100%" stopColor="#111c17" />
                  </radialGradient>
                  <filter id="neonGlowCyan">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="neonGlowPulse" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feComponentTransfer in="blur" result="glow">
                      <feFuncA type="linear" slope="0.7"/>
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode in="glow"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>

                {/* Stadium Outer Ring */}
                <ellipse cx="400" cy="250" rx="350" ry="210" fill="#141c2c" stroke="#1f293d" strokeWidth="6" />
                <ellipse cx="400" cy="250" rx="300" ry="170" fill="#0d1421" stroke="#334155" strokeWidth="2" strokeDasharray="5,5" />

                {/* Stadium Seating Sections Base */}
                <ellipse cx="400" cy="250" rx="270" ry="145" fill="#121b2d" stroke="#1e293b" strokeWidth="4" />

                {/* Football Field in center */}
                <rect x="250" y="160" width="300" height="180" rx="6" fill="url(#fieldGrad)" stroke="#22c55e" strokeWidth="2" opacity="0.9" />
                <line x1="400" y1="160" x2="400" y2="340" stroke="#22c55e" strokeWidth="1.5" />
                <circle cx="400" cy="250" r="35" fill="none" stroke="#22c55e" strokeWidth="1.5" />
                <rect x="250" y="210" width="30" height="80" fill="none" stroke="#22c55e" strokeWidth="1.5" />
                <rect x="520" y="210" width="30" height="80" fill="none" stroke="#22c55e" strokeWidth="1.5" />

                {/* Outer Seating Wedges / Sections */}
                {/* North Wedges */}
                <path d="M 180 150 A 270 145 0 0 1 620 150 L 590 170 A 240 120 0 0 0 210 170 Z" fill="#1e293b" stroke="#0b0f19" strokeWidth="2" />
                {/* South Wedges */}
                <path d="M 180 350 A 270 145 0 0 0 620 350 L 590 330 A 240 120 0 0 1 210 330 Z" fill="#1e293b" stroke="#0b0f19" strokeWidth="2" />
                {/* East Wedges */}
                <path d="M 620 150 A 270 145 0 0 1 620 350 L 590 330 A 240 120 0 0 0 590 170 Z" fill="#1e293b" stroke="#0b0f19" strokeWidth="2" />
                {/* West Wedges */}
                <path d="M 180 150 A 270 145 0 0 0 180 350 L 210 330 A 240 120 0 0 1 210 170 Z" fill="#1e293b" stroke="#0b0f19" strokeWidth="2" />

                {/* Gate Points Interaction */}
                
                {/* GATE A (North) */}
                <g 
                  onClick={() => setSelectedGate('A')}
                  className="cursor-pointer group"
                >
                  <ellipse 
                    cx="400" cy="40" rx="30" ry="18" 
                    fill={selectedGate === 'A' ? '#0891b2' : '#1e293b'} 
                    stroke={recommendedGate === 'A' ? '#06b6d4' : '#475569'} 
                    strokeWidth={recommendedGate === 'A' ? '4' : '2'}
                    filter={recommendedGate === 'A' ? 'url(#neonGlowPulse)' : ''}
                    className={recommendedGate === 'A' ? 'animate-pulse' : ''}
                  />
                  <text x="400" y="44" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">GATE A</text>
                  <circle cx="400" cy="58" r="4" fill="#06b6d4" opacity={recommendedGate === 'A' ? 1 : 0} className="animate-ping" />
                </g>

                {/* GATE B (East) */}
                <g 
                  onClick={() => setSelectedGate('B')}
                  className="cursor-pointer group"
                >
                  <ellipse 
                    cx="760" cy="250" rx="30" ry="18" 
                    fill={selectedGate === 'B' ? '#0891b2' : '#1e293b'} 
                    stroke={recommendedGate === 'B' ? '#06b6d4' : '#475569'} 
                    strokeWidth={recommendedGate === 'B' ? '4' : '2'}
                    filter={recommendedGate === 'B' ? 'url(#neonGlowPulse)' : ''}
                    className={recommendedGate === 'B' ? 'animate-pulse' : ''}
                  />
                  <text x="760" y="254" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">GATE B</text>
                  <circle cx="760" cy="268" r="4" fill="#06b6d4" opacity={recommendedGate === 'B' ? 1 : 0} className="animate-ping" />
                </g>

                {/* GATE C (South) */}
                <g 
                  onClick={() => setSelectedGate('C')}
                  className="cursor-pointer group"
                >
                  <ellipse 
                    cx="400" cy="460" rx="30" ry="18" 
                    fill={selectedGate === 'C' ? '#0891b2' : '#1e293b'} 
                    stroke={recommendedGate === 'C' ? '#06b6d4' : '#475569'} 
                    strokeWidth={recommendedGate === 'C' ? '4' : '2'}
                    filter={recommendedGate === 'C' ? 'url(#neonGlowPulse)' : ''}
                    className={recommendedGate === 'C' ? 'animate-pulse' : ''}
                  />
                  <text x="400" y="464" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">GATE C</text>
                  <circle cx="400" cy="442" r="4" fill="#06b6d4" opacity={recommendedGate === 'C' ? 1 : 0} className="animate-ping" />
                </g>

                {/* GATE D (West) */}
                <g 
                  onClick={() => setSelectedGate('D')}
                  className="cursor-pointer group"
                >
                  <ellipse 
                    cx="40" cy="250" rx="30" ry="18" 
                    fill={selectedGate === 'D' ? '#0891b2' : '#1e293b'} 
                    stroke={recommendedGate === 'D' ? '#06b6d4' : '#475569'} 
                    strokeWidth={recommendedGate === 'D' ? '4' : '2'}
                    filter={recommendedGate === 'D' ? 'url(#neonGlowPulse)' : ''}
                    className={recommendedGate === 'D' ? 'animate-pulse' : ''}
                  />
                  <text x="40" y="254" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">GATE D</text>
                  <circle cx="40" cy="268" r="4" fill="#06b6d4" opacity={recommendedGate === 'D' ? 1 : 0} className="animate-ping" />
                </g>

                {/* GATE E - VIP (North West) */}
                <g 
                  onClick={() => setSelectedGate('E')}
                  className="cursor-pointer group"
                >
                  <ellipse 
                    cx="150" cy="80" rx="30" ry="18" 
                    fill={selectedGate === 'E' ? '#0891b2' : '#1e293b'} 
                    stroke={recommendedGate === 'E' ? '#06b6d4' : '#475569'} 
                    strokeWidth={recommendedGate === 'E' ? '4' : '2'}
                    filter={recommendedGate === 'E' ? 'url(#neonGlowPulse)' : ''}
                    className={recommendedGate === 'E' ? 'animate-pulse' : ''}
                  />
                  <text x="150" y="84" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">GATE E</text>
                  <circle cx="150" cy="98" r="4" fill="#06b6d4" opacity={recommendedGate === 'E' ? 1 : 0} className="animate-ping" />
                </g>

                {/* GATE F - Media (South East) */}
                <g 
                  onClick={() => setSelectedGate('F')}
                  className="cursor-pointer group"
                >
                  <ellipse 
                    cx="650" cy="420" rx="30" ry="18" 
                    fill={selectedGate === 'F' ? '#0891b2' : '#1e293b'} 
                    stroke={recommendedGate === 'F' ? '#06b6d4' : '#475569'} 
                    strokeWidth={recommendedGate === 'F' ? '4' : '2'}
                    filter={recommendedGate === 'F' ? 'url(#neonGlowPulse)' : ''}
                    className={recommendedGate === 'F' ? 'animate-pulse' : ''}
                  />
                  <text x="650" y="424" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">GATE F</text>
                  <circle cx="650" cy="402" r="4" fill="#06b6d4" opacity={recommendedGate === 'F' ? 1 : 0} className="animate-ping" />
                </g>

                {/* Recommended Route Arrows/Path */}
                {recommendedGate && (
                  <path 
                    d={
                      recommendedGate === 'A' ? "M 400 70 Q 400 120 400 150" :
                      recommendedGate === 'B' ? "M 720 250 Q 640 250 590 250" :
                      recommendedGate === 'C' ? "M 400 430 Q 400 380 400 350" :
                      recommendedGate === 'D' ? "M 80 250 Q 160 250 210 250" :
                      recommendedGate === 'E' ? "M 170 95 Q 220 140 260 170" :
                      "M 630 405 Q 580 360 540 330"
                    }
                    fill="none" 
                    stroke="#06b6d4" 
                    strokeWidth="4" 
                    strokeDasharray="8,6" 
                    markerEnd="url(#arrow)"
                    className="animate-[dash_2s_linear_infinite]"
                  />
                )}
              </svg>

              {/* Float recommended card overlay */}
              {recommendedGate && (
                <div className="absolute top-4 left-4 right-4 bg-cyan-950/80 backdrop-blur border border-cyan-500/35 rounded-xl p-3 flex items-center gap-3 animate-bounce shadow-xl">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Navigation size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">AI Recommended Route</h4>
                    <p className="text-xs text-cyan-300">Enter stadium via <strong className="text-white">Gate {recommendedGate}</strong> for fastest queue processing.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Gate details */}
            <div className="mt-4 p-4 rounded-xl bg-stadium-card/60 border border-slate-800/80 flex flex-wrap gap-4 items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-200">
                  Selected: <span className="text-cyan-400">Gate {selectedGate}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedGate === 'A' ? "North Gate — closest to Sections 100-115, near main parking lot" :
                   selectedGate === 'B' ? "East Gate — closest to Sections 200-215, near metro station exit" :
                   selectedGate === 'C' ? "South Gate — closest to Sections 116-130, near ADA accessible parking lot" :
                   selectedGate === 'D' ? "West Gate — closest to Sections 216-230, near taxi/rideshare drop-off" :
                   selectedGate === 'E' ? "VIP Gate — restricted entry, access to suites and executive lounge" :
                   "Media Gate — press badges and broadcasting crew entrance"}
                </p>
              </div>

              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="text-cyan-400" size={16} />
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-semibold">Wait Time</span>
                    <span className="text-sm font-bold text-slate-200">{activeGateStatus.queue_len_min} min</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Shield className="text-cyan-400" size={16} />
                  <div>
                    <span className="block text-[10px] text-slate-500 uppercase font-semibold">Occupancy</span>
                    <span className={`text-sm font-bold ${
                      activeGateStatus.occupancy_pct > 85 ? 'text-red-400' :
                      activeGateStatus.occupancy_pct > 60 ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>{activeGateStatus.occupancy_pct}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
