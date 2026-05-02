import React, { useState, useEffect, useRef } from 'react';

const tracks = [
  {
    name: "Weightless",
    artist: "Aura Ambient",
    mood: ["calm", "focus", "sadness"],
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    color: "#6ec6c0"
  },
  {
    name: "Golden Hour",
    artist: "Aura Ambient",
    mood: ["joy", "energy"],
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    color: "#f6c90e"
  },
  {
    name: "Drift",
    artist: "Aura Ambient",
    mood: ["anxiety"],
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    color: "#b8a9d9"
  }
];

type AuraData = {
  emotion: 'joy' | 'calm' | 'anxiety' | 'sadness' | 'energy' | 'focus';
  intensity: number;
  affirmation: string;
  color: string;
};

type HistoryEntry = AuraData & { timestamp: number };

export default function App() {
  const [inputText, setInputText] = useState("");
  const [auraData, setAuraData] = useState<AuraData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moodHistory, setMoodHistory] = useState<HistoryEntry[]>([]);
  
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load mood history on mount
  useEffect(() => {
    try {
        const saved = localStorage.getItem('aura_mood_history');
        if (saved) {
            setMoodHistory(JSON.parse(saved));
        }
    } catch (e) {
        console.error("Could not load mood history", e);
    }
  }, []);

  // Audio setup
  useEffect(() => {
    if (!audioRef.current) {
        audioRef.current = new Audio(tracks[currentTrackIndex].url);
        audioRef.current.loop = true;
    } else {
        const wasPlaying = !audioRef.current.paused;
        audioRef.current.src = tracks[currentTrackIndex].url;
        if (wasPlaying) {
            audioRef.current.play().catch(console.error);
        }
    }

    const setAudioData = () => {
        setDuration(audioRef.current?.duration || 0);
    };

    const setAudioTime = () => {
        setCurrentTime(audioRef.current?.currentTime || 0);
    };

    audioRef.current.addEventListener('loadeddata', setAudioData);
    audioRef.current.addEventListener('timeupdate', setAudioTime);

    // Initial load might have already happened
    if (audioRef.current.readyState >= 2) {
      setDuration(audioRef.current.duration);
      setCurrentTime(audioRef.current.currentTime);
    }

    return () => {
        if (audioRef.current) {
            audioRef.current.removeEventListener('loadeddata', setAudioData);
            audioRef.current.removeEventListener('timeupdate', setAudioTime);
        }
    };
  }, [currentTrackIndex]);

  // Cleanup audio on unmount
  useEffect(() => {
      return () => {
          if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.src = "";
          }
      }
  }, []);

  const playPauseToggle = () => {
      if (audioRef.current) {
          if (isPlaying) {
              audioRef.current.pause();
              setIsPlaying(false);
          } else {
              audioRef.current.play().catch(e => console.error("Audio play failed:", e));
              setIsPlaying(true);
          }
      }
  };

  const nextTrack = () => {
      setCurrentTrackIndex((prev) => (prev + 1) % tracks.length);
  };

  const prevTrack = () => {
      setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
      if (audioRef.current && duration) {
          const bounds = e.currentTarget.getBoundingClientRect();
          const percent = (e.clientX - bounds.left) / bounds.width;
          audioRef.current.currentTime = percent * duration;
          setCurrentTime(percent * duration);
      }
  };

  const formatTime = (time: number) => {
      if (isNaN(time)) return "0:00";
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatRelativeTime = (timestamp: number) => {
      const now = new Date();
      const date = new Date(timestamp);
      
      const isToday = parseInt(now.toISOString().split('T')[0].replace(/-/g, '')) === parseInt(date.toISOString().split('T')[0].replace(/-/g, ''));
      const isYesterday = parseInt(now.toISOString().split('T')[0].replace(/-/g, '')) - parseInt(date.toISOString().split('T')[0].replace(/-/g, '')) === 1;

      const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      
      if (isToday) return `Today ${timeStr}`;
      if (isYesterday) return `Yesterday ${timeStr}`;
      return `${date.toLocaleDateString()} ${timeStr}`;
  };

  const readMyAura = async () => {
      if (!inputText.trim()) return;

      setIsLoading(true);
      setError(null);

      let parsedAura: AuraData | null = null;

      try {
          const response = await fetch('/api/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: inputText })
          });

          if (!response.ok) {
              throw new Error("Failed to analyze aura");
          }

          parsedAura = await response.json();

          if (parsedAura) {
              setAuraData(parsedAura);
              
              // Select track
              const idealTrackIndex = tracks.findIndex(t => t.mood.includes(parsedAura!.emotion));
              if (idealTrackIndex !== -1) {
                  setCurrentTrackIndex(idealTrackIndex);
                  // Auto play is nice, but many browsers block it until user interaction. 
                  // They just clicked, so we might be able to play.
                  if (audioRef.current) {
                      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
                  }
              }

              // Save to history
              const newEntry = { ...parsedAura, timestamp: Date.now() };
              const newHistory = [newEntry, ...moodHistory].slice(0, 7);
              setMoodHistory(newHistory);
              try {
                  localStorage.setItem('aura_mood_history', JSON.stringify(newHistory));
              } catch (e) { console.error(e); }
          }
      } catch (err) {
          console.error(err);
          setError("Could not read your aura. Try again.");
          setTimeout(() => setError(null), 4000);
      } finally {
          setIsLoading(false);
      }
  };

  const getMorphDuration = (intensity: number) => {
      if (intensity <= 3) return '8s';
      if (intensity <= 6) return '5s';
      return '3s';
  };

  const currentTrack = tracks[currentTrackIndex];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,700;1,400&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');
        
        body {
            background-color: #0d0b1a;
            color: #f5f0e8;
            margin: 0;
            font-family: 'DM Sans', sans-serif;
            overflow-x: hidden;
        }

        h1, h2, h3, .playfair {
            font-family: 'Playfair Display', serif;
        }

        @keyframes blobMorph {
            0% { border-radius: 60% 40% 55% 45% / 45% 55% 40% 60%; }
            25% { border-radius: 45% 55% 40% 60% / 60% 40% 55% 45%; }
            50% { border-radius: 55% 45% 60% 40% / 40% 60% 45% 55%; }
            75% { border-radius: 40% 60% 45% 55% / 55% 45% 60% 40%; }
            100% { border-radius: 60% 40% 55% 45% / 45% 55% 40% 60%; }
        }

        @keyframes blobPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.06); }
        }

        @keyframes ringRotate {
            from { transform: translate(-50%, -50%) rotate(0deg); }
            to { transform: translate(-50%, -50%) rotate(360deg); }
        }

        @keyframes auraGlow {
            0%, 100% { text-shadow: 0 0 10px rgba(201,149,108,0.3); }
            50% { text-shadow: 0 0 40px rgba(201,149,108,0.8); }
        }

        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes shimmer {
            0% { background-position: 200% center; }
            100% { background-position: -200% center; }
        }

        @keyframes dotPulse {
            0%, 100% { box-shadow: 0 0 0 0 inherit; }
            50% { box-shadow: 0 0 8px 3px inherit; }
        }

        @keyframes equalizerBar {
            0%, 100% { height: 6px; }
            50% { height: 18px; }
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        /* Custom scrollbar for timeline */
        .timeline-scroll::-webkit-scrollbar {
            height: 4px;
        }
        .timeline-scroll::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.02);
            border-radius: 10px;
        }
        .timeline-scroll::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
        }
      `}</style>
      
      <div className="min-h-screen w-full flex flex-col items-center pb-12">
          {/* Main Container */}
          <div className="w-full max-w-[680px] flex flex-col items-center px-4 md:px-5 pt-12">
              
              {/* SECTION 1 - HEADER */}
              <header className="w-full text-center flex flex-col items-center mb-10">
                  <h1 
                    className="text-[2.5rem] md:text-[3.5rem] text-[#c9956c] m-0 leading-tight"
                    style={{ animation: 'auraGlow 3s ease-in-out infinite' }}
                  >
                      AURA
                  </h1>
                  <p className="text-[rgba(245,240,232,0.5)] text-[1rem] tracking-[0.15em] uppercase mt-2 mb-6">
                      Understand what you're feeling.
                  </p>
                  <div className="w-[60px] h-[1px] bg-[rgba(201,149,108,0.3)]"></div>
              </header>

              {/* SECTION 2 - MOOD INPUT */}
              <section className="w-full flex flex-col items-center mb-12">
                  <div className="w-full relative">
                      <label htmlFor="moodInput" className="block text-[#b8a9d9] text-sm mb-3 ml-2">
                          How are you feeling right now?
                      </label>
                      <textarea 
                          id="moodInput"
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="Write freely... I feel anxious about tomorrow, or I'm overwhelmed but grateful..."
                          className="w-full min-h-[120px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] rounded-[16px] p-5 text-[#f5f0e8] resize-y focus:outline-none focus:border-[#b8a9d9] transition-all duration-300"
                          style={{
                              boxShadow: '0 0 0 rgba(184,169,217,0)'
                          }}
                          onFocus={(e) => {
                              e.target.style.boxShadow = '0 0 15px rgba(184,169,217,0.15)';
                          }}
                          onBlur={(e) => {
                              e.target.style.boxShadow = '0 0 0 rgba(184,169,217,0)';
                          }}
                      />
                  </div>
                  
                  <div className="mt-6 flex flex-col items-center">
                      <button 
                          onClick={readMyAura}
                          disabled={isLoading}
                          className="relative flex items-center justify-center gap-3 rounded-[50px] py-[14px] px-[40px] text-white font-bold tracking-[0.1em] uppercase text-[0.85rem] cursor-pointer border-none transition-all duration-300 hover:scale-[1.04]"
                          style={{
                              background: 'linear-gradient(135deg, #c9956c, #b8a9d9)',
                              boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                              opacity: isLoading ? 0.8 : 1
                          }}
                          onMouseEnter={(e) => {
                              if (!isLoading) e.currentTarget.style.boxShadow = '0 6px 20px rgba(201,149,108,0.4)';
                          }}
                          onMouseLeave={(e) => {
                              if (!isLoading) e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
                          }}
                      >
                          {isLoading && <span className="spinner"></span>}
                          {isLoading ? "Reading..." : "Read My Aura"}
                      </button>
                      
                      {error && (
                          <div className="text-[#c9956c] text-sm mt-3 animate-[fadeInUp_0.3s_ease-out_forwards]">
                              {error}
                          </div>
                      )}
                  </div>
              </section>

              {/* SECTION 3 & 4 - AURA VISUALIZER & AFFIRMATION */}
              {auraData && (
                  <div className="w-full flex flex-col items-center mb-12 animate-[fadeInUp_0.8s_ease-out_forwards]">
                      
                      {/* Aura Blob */}
                      <div className="relative flex items-center justify-center mb-12 w-[200px] h-[200px] md:w-[260px] md:h-[260px]">
                          {/* Inner Blob */}
                          <div 
                              className="absolute w-full h-full flex items-center justify-center flex-col z-10"
                              style={{
                                  background: `radial-gradient(circle, ${auraData.color}66, transparent 70%)`,
                                  border: `2px solid ${auraData.color}99`,
                                  boxShadow: `0 0 60px ${auraData.color}4D, 0 0 120px ${auraData.color}26`,
                                  animation: `blobMorph ${getMorphDuration(auraData.intensity)} linear infinite, blobPulse ${getMorphDuration(auraData.intensity)} ease-in-out infinite`
                              }}
                          >
                              <span className="playfair text-[1.1rem] text-[#f5f0e8] tracking-[0.2em] uppercase z-20" style={{textShadow: '0 2px 4px rgba(0,0,0,0.5)'}}>
                                  {auraData.emotion}
                              </span>
                              <span className="text-[rgba(245,240,232,0.6)] text-[0.75rem] mt-1 z-20">
                                  Intensity: {auraData.intensity}/10
                              </span>
                          </div>

                          {/* Outer Ring */}
                          <div 
                              className="absolute top-1/2 left-1/2 rounded-full z-0 w-[240px] h-[240px] md:w-[300px] md:h-[300px]"
                              style={{
                                  border: `1px solid ${auraData.color}40`,
                                  animation: 'ringRotate 12s linear infinite'
                              }}
                          ></div>
                      </div>

                      {/* Affirmation Card */}
                      <div 
                          className="w-full relative overflow-hidden rounded-[20px] p-7 md:p-8 border border-[rgba(255,255,255,0.1)]"
                          style={{
                              background: 'rgba(255,255,255,0.05)',
                              backdropFilter: 'blur(20px)',
                              WebkitBackdropFilter: 'blur(20px)',
                              animation: 'fadeInUp 0.8s ease-out 0.2s both'
                          }}
                      >
                          {/* Shimmer Overlay */}
                          <div 
                              className="absolute inset-0 z-0 opacity-50 pointer-events-none"
                              style={{
                                  background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.1) 50%, transparent 60%)',
                                  backgroundSize: '200% 200%',
                                  animation: 'shimmer 4s linear infinite'
                              }}
                          ></div>

                          <div className="relative z-10">
                              <span 
                                  className="absolute top-[-10px] left-[-10px] text-[#c9956c] opacity-20 playfair leading-none pointer-events-none"
                                  style={{ fontSize: '4rem' }}
                              >
                                  &ldquo;
                              </span>
                              <div className="pl-4">
                                  <h3 className="text-[#c9956c] uppercase tracking-[0.15em] text-[0.75rem] m-0">
                                      Your Aura Reading
                                  </h3>
                                  <div className="w-[40px] h-[1px] bg-[#c9956c] my-3"></div>
                                  <p className="playfair italic text-[1.15rem] leading-[1.8] text-[#f5f0e8] m-0">
                                      {auraData.affirmation}
                                  </p>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {/* SECTION 5 - AMBIENT MUSIC PLAYER */}
              <section className="w-full mb-12">
                  <div 
                      className="w-full rounded-[20px] p-5 border border-[rgba(255,255,255,0.1)] flex flex-col"
                      style={{
                          background: 'rgba(255,255,255,0.05)',
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)'
                      }}
                  >
                      <div className="flex items-center justify-between mb-4">
                          {/* Left: Equalizer */}
                          <div className="flex items-end h-[18px] gap-1 w-[24px]">
                              {[1, 2, 3].map(i => (
                                  <div 
                                      key={i}
                                      className="w-[4px] rounded-t-[2px] rounded-b-[1px] bg-white transition-colors duration-500"
                                      style={{
                                          backgroundColor: isPlaying ? currentTrack.color : 'rgba(255,255,255,0.2)',
                                          height: isPlaying ? '18px' : '4px',
                                          animationName: isPlaying ? 'equalizerBar' : 'none',
                                          animationDuration: '1.2s',
                                          animationTimingFunction: 'ease-in-out',
                                          animationIterationCount: 'infinite',
                                          animationDelay: `${i * 0.2}s`
                                      }}
                                  ></div>
                              ))}
                          </div>

                          {/* Center: Track Info */}
                          <div className="flex-1 px-4 text-center overflow-hidden">
                              <div className="font-bold text-[#f5f0e8] text-[0.9rem] truncate">
                                  {currentTrack.name}
                              </div>
                              <div className="text-[rgba(245,240,232,0.5)] text-[0.75rem] truncate">
                                  {currentTrack.artist}
                              </div>
                          </div>

                          {/* Right: Controls */}
                          <div className="flex items-center gap-2">
                              <button 
                                  onClick={prevTrack}
                                  className="w-[40px] h-[40px] rounded-full flex items-center justify-center border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.08)] text-[#f5f0e8] cursor-pointer transition-all duration-200 hover:bg-[rgba(255,255,255,0.15)] hover:scale-105"
                              >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                                  </svg>
                              </button>
                              <button 
                                  onClick={playPauseToggle}
                                  className="w-[48px] h-[48px] rounded-full flex items-center justify-center border border-[rgba(255,255,255,0.1)] text-[#f5f0e8] cursor-pointer transition-all duration-200 hover:scale-105"
                                  style={{
                                      backgroundColor: isPlaying ? `${currentTrack.color}4D` : 'rgba(255,255,255,0.08)'
                                  }}
                              >
                                  {isPlaying ? (
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                                      </svg>
                                  ) : (
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="ml-1">
                                          <path d="M8 5v14l11-7z"/>
                                      </svg>
                                  )}
                              </button>
                              <button 
                                  onClick={nextTrack}
                                  className="w-[40px] h-[40px] rounded-full flex items-center justify-center border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.08)] text-[#f5f0e8] cursor-pointer transition-all duration-200 hover:bg-[rgba(255,255,255,0.15)] hover:scale-105"
                              >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                                  </svg>
                              </button>
                          </div>
                      </div>

                      {/* Progress Bar */}
                      <div 
                          className="w-full h-[3px] bg-[rgba(255,255,255,0.1)] rounded-[10px] cursor-pointer mt-1"
                          onClick={handleSeek}
                      >
                          <div 
                              className="h-full rounded-[10px] transition-all duration-100 ease-linear"
                              style={{ 
                                  width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                                  backgroundColor: currentTrack.color 
                              }}
                          ></div>
                      </div>
                      
                      <div className="flex justify-between mt-2 text-[rgba(245,240,232,0.4)] text-[0.7rem] font-mono">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                      </div>
                  </div>
              </section>

              {/* SECTION 6 - MOOD HISTORY TIMELINE */}
              {moodHistory.length > 0 && (
                  <section className="w-full flex flex-col items-start mb-10 animate-[fadeInUp_0.8s_ease-out_forwards]">
                      <h4 className="text-[rgba(201,149,108,0.7)] uppercase tracking-[0.15em] text-[0.75rem] m-0 mb-4 ml-1">
                          Mood History
                      </h4>
                      
                      <div className="w-full flex md:flex-row flex-col gap-3 overflow-x-auto pb-4 timeline-scroll">
                          {moodHistory.map((item, idx) => (
                              <div 
                                  key={idx}
                                  className="flex-shrink-0 w-full md:w-[130px] rounded-[14px] p-[14px] border border-[rgba(255,255,255,0.05)] border-t-[3px] flex flex-col"
                                  style={{
                                      background: 'rgba(255,255,255,0.03)',
                                      backdropFilter: 'blur(10px)',
                                      WebkitBackdropFilter: 'blur(10px)',
                                      borderTopColor: item.color
                                  }}
                              >
                                  <div 
                                      className="w-[10px] h-[10px] rounded-full mb-2"
                                      style={{ 
                                          backgroundColor: item.color,
                                          color: `${item.color}80`,
                                          animation: 'dotPulse 3s infinite'
                                      }}
                                  ></div>
                                  <div className="text-[0.85rem] font-bold capitalize text-[#f5f0e8] mt-1">
                                      {item.emotion}
                                  </div>
                                  <div className="text-[rgba(245,240,232,0.5)] text-[0.75rem]">
                                      {item.intensity}/10
                                  </div>
                                  <div className="text-[rgba(245,240,232,0.3)] text-[0.7rem] mt-3 mt-auto pt-2 border-t border-[rgba(255,255,255,0.05)]">
                                      {formatRelativeTime(item.timestamp)}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </section>
              )}

              {/* SECTION 7 - FOOTER */}
              <footer className="mt-10 mb-8 text-center text-[rgba(245,240,232,0.3)] text-[0.75rem] tracking-[0.1em]">
                  made with AURA • feel everything
              </footer>

          </div>
      </div>
    </>
  );
}

