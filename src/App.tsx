/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Music2, 
  Play, 
  Users, 
  Trophy, 
  LogOut, 
  Loader2, 
  Search,
  CheckCircle2,
  XCircle,
  Plus,
  ArrowRight,
  Copy,
  Share2
} from 'lucide-react';
import { auth, loginWithGoogle } from './lib/firebase';
import { useGame } from './hooks/useGame';
import { Category, Track, Player, Room } from './types';
import { cn } from './lib/utils';
import axios from 'axios';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [initializing, setInitializing] = useState(true);
  const [view, setView] = useState<'landing' | 'browse' | 'room'>('landing');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [roomName, setRoomName] = useState('');
  const [showNamingModal, setShowNamingModal] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedTerms, setSelectedTerms] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (view === 'room' && roomId) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'JOIN_ROOM', roomId }));
      };

      return () => ws.close();
    }
  }, [view, roomId]);

  const { room, loading, error, createRoom, joinRoom, startGame, submitAnswer } = useGame(roomId);

  useEffect(() => {
    return auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u && view === 'landing') setView('browse');
      setInitializing(false);
    });
  }, [view]);

  useEffect(() => {
    if (view === 'browse' && user) {
      axios.get('/api/categories')
        .then(res => {
          if (Array.isArray(res.data)) {
            setCategories(res.data);
          } else {
            console.error("Categories response is not an array:", res.data);
            setCategories([]);
          }
        })
        .catch(err => {
          console.error("Помилка завантаження категорій:", err);
          setCategories([]);
        });
    }
  }, [view, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && user && !room) {
      handleJoinByCode(roomParam);
      // Clean up URL to keep only the code if needed or just remove param
      window.history.replaceState({}, '', window.location.origin + window.location.pathname);
    }
  }, [user, room]);

  const handleCreateRoom = async (playlistId: string, isMulti: boolean = false) => {
    const name = roomName.trim() || `${user?.displayName?.split(' ')[0] || 'Моя'} Вечірка`;
    const id = await createRoom(name, playlistId, isMulti);
    if (id) {
      setRoomId(id);
      setView('room');
      setShowNamingModal(null);
      setRoomName('');
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await axios.get(`/api/search?q=${encodeURIComponent(query)}`);
      setSearchResults(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleTerm = (term: any) => {
    setSelectedTerms(prev => 
      prev.find(t => t.id === term.id)
        ? prev.filter(t => t.id !== term.id)
        : [...prev, term]
    );
  };

  const handleJoinByCode = async (code: string) => {
    if (!code) return;
    try {
      await joinRoom(code.toLowerCase());
      setRoomId(code.toLowerCase());
      setView('room');
    } catch (err: any) {
      alert("Не вдалося приєднатися до кімнати. Перевірте код.");
      console.error(err);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!user && view !== 'landing') return null;

  return (
    <div className="min-h-screen relative font-sans text-white selection:bg-white/20 bg-black">
      <div className="fixed inset-0 bg-[#000000]" />
      <div className="ambient-glow opacity-30" />
      
      <header className="fixed top-0 left-0 right-0 z-50 px-8 py-5 flex justify-between items-center bg-black/40 backdrop-blur-2xl border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setView('browse')}>
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center">
            <Music2 className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">TuneMatch</h1>
        </div>
        
        {user && (
          <div className="flex items-center gap-3 bg-white/[0.06] pl-4 pr-1.5 py-1.5 rounded-full border border-white/[0.08] backdrop-blur-md">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold leading-none text-white">{user.displayName}</p>
              <button 
                onClick={() => auth.signOut()}
                className="text-[10px] font-medium text-neutral-400 hover:text-white transition-colors mt-0.5"
              >
                Sign Out
              </button>
            </div>
            <img 
              src={user.photoURL || undefined} 
              alt={user.displayName || ''} 
              className="w-7 h-7 rounded-full border border-white/10"
            />
          </div>
        )}
      </header>

      <main className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <AnimatePresence>
          {showNamingModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
            >
              <div className="apple-glass p-8 rounded-[2.5rem] w-full max-w-md border border-white/10 shadow-2xl relative z-[110]">
                <h3 className="text-2xl font-bold text-white mb-2">Назвіть вашу вечірку</h3>
                <p className="text-neutral-400 text-sm mb-8">Цю назву побачать ваші друзі, коли приєднаються.</p>
                
                <input 
                  type="text"
                  autoFocus
                  placeholder="Наприклад: П'ятничний двіж"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-2xl py-4 px-6 text-white text-lg font-medium focus:outline-none focus:border-white/30 mb-8"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom(showNamingModal)}
                />
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowNamingModal(null)}
                    className="flex-1 py-4 text-neutral-400 font-bold hover:text-white transition-colors"
                  >
                    Скасувати
                  </button>
                  <button 
                    onClick={() => handleCreateRoom(showNamingModal)}
                    className="flex-1 bg-white text-black py-4 rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
                  >
                    Створити
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'landing' && (
            <motion.section 
              key="landing"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center justify-center min-h-[75vh] text-center"
            >
              <motion.h2 
                className="text-7xl sm:text-9xl font-bold tracking-tight mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.2 }}
              >
                Sync.<br/>Guess.<br/><span className="text-neutral-400">Master.</span>
              </motion.h2>
              <p className="text-xl text-neutral-400 mb-12 max-w-xl font-medium leading-relaxed">
                The ultimate music challenge built for real-time multiplayer.
                Connect with friends and prove your ears are unmatched.
              </p>
              <button 
                onClick={loginWithGoogle}
                className="group px-12 py-5 bg-white text-black font-bold rounded-full transition-all hover:scale-[1.02] active:scale-95 shadow-2xl flex items-center gap-3"
              >
                Start Listening <ArrowRight className="w-5 h-5" />
              </button>
            </motion.section>
          )}

          {view === 'browse' && (
            <motion.section 
              key="browse"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              <div className="relative h-64 rounded-3xl bg-neutral-900 overflow-hidden group shadow-2xl border border-white/[0.05]">
                <div className="absolute inset-0 bg-neutral-900" />
                {categories[1]?.imageUrl && categories[1].imageUrl !== '' && (
                  <img 
                    src={categories[1].imageUrl} 
                    className="absolute inset-0 w-full h-full object-cover opacity-20 transition-transform duration-1000 group-hover:scale-105"
                    alt="Background"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                <div className="relative h-full z-10 p-10 flex flex-col justify-end">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-[0.2em] mb-2">Daily Mix</span>
                  <h2 className="text-5xl font-bold mb-3 tracking-tight">World Top 50</h2>
                  <p className="text-neutral-400 text-sm max-w-md font-medium mb-6">Synchronized playback across 1,240 active listeners worldwide.</p>
                  <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <div className="relative group flex-1 sm:w-64">
                      <input 
                        type="text" 
                        placeholder="Room Code..."
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/[0.06] rounded-full py-2.5 pl-6 pr-12 focus:outline-none focus:border-white/20 transition-all font-bold placeholder:text-neutral-600 text-sm uppercase"
                      />
                      <button 
                        onClick={() => handleJoinByCode(joinCode)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white text-black rounded-full hover:scale-110 active:scale-90 transition-all"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>

                    <button 
                      onClick={() => handleCreateRoom('global')}
                      className="bg-white text-black px-8 py-2.5 rounded-full font-bold text-sm hover:scale-[1.02] active:scale-95 transition-all w-full sm:w-fit shadow-lg"
                    >
                      Quick Start
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-10 border-b border-white/[0.05] pb-12">
                <div className="flex-1 space-y-8 w-full">
                  <div>
                    <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-[0.2em]">Browse Mixes</h2>
                    <p className="text-xs text-neutral-500 mt-1.5 font-medium italic">Updates every 15 minutes</p>
                  </div>
                  
                  <div className="relative group w-full">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-white transition-colors" />
                    <input 
                      type="text" 
                      placeholder="Search artists, genres, or albums..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.06] rounded-2xl py-4 pl-14 pr-6 focus:outline-none focus:border-white/20 transition-all font-medium placeholder:text-neutral-600 text-sm"
                    />
                    
                    <AnimatePresence>
                      {searchResults.length > 0 && searchQuery && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="absolute top-full left-0 right-0 mt-3 apple-glass rounded-2xl overflow-hidden z-[60] shadow-2xl p-2"
                        >
                          {searchResults.map((result) => (
                            <button
                              key={result.id}
                              onClick={() => {
                                toggleTerm(result);
                                setSearchQuery('');
                                setSearchResults([]);
                              }}
                              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.08] transition-all text-left rounded-xl"
                            >
                              <span className="font-semibold text-sm text-neutral-200">{result.name}</span>
                              <Plus className="w-4 h-4 text-neutral-500" />
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {selectedTerms.length > 0 && (
                    <div className="flex flex-wrap gap-2.5">
                      {selectedTerms.map(term => (
                        <div key={term.id} className="flex items-center gap-2.5 bg-white/[0.08] text-white px-4 py-2 rounded-full border border-white/10 text-xs font-bold uppercase tracking-widest">
                          {term.name}
                          <button onClick={() => toggleTerm(term)} className="text-neutral-500 hover:text-white transition-colors"><XCircle className="w-4.5 h-4.5" /></button>
                        </div>
                      ))}
                      <button 
                        onClick={() => handleCreateRoom(selectedTerms.map(t => t.name).join(','), true)}
                        className="bg-white text-black px-6 py-2 rounded-full text-xs font-bold uppercase hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
                      >
                        Start Custom Mix
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="relative group w-full sm:w-80">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-white transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Enter lobby code..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleJoinByCode(e.currentTarget.value);
                    }}
                    className="w-full bg-white/[0.04] border border-white/[0.06] rounded-2xl py-4 pl-14 pr-6 focus:outline-none focus:border-white/20 transition-all font-medium placeholder:text-neutral-600 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {Array.isArray(categories) && categories.map((cat, idx) => (
                  <motion.div
                    key={cat.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.6 }}
                    whileHover={{ scale: 1.02 }}
                    className="group cursor-pointer relative aspect-square rounded-3xl overflow-hidden apple-card flex flex-col justify-end p-8"
                    onClick={() => setShowNamingModal(cat.id)}
                  >
                    {cat.imageUrl && (
                      <img 
                        src={cat.imageUrl} 
                        alt={cat.name} 
                        className="absolute inset-0 w-full h-full object-cover opacity-20 transition-all duration-700 group-hover:scale-110 group-hover:opacity-40"
                      />
                    )}
                    <div className="absolute top-8 right-8 text-neutral-500 group-hover:text-white transition-colors">
                      <Music2 className="w-5 h-5" />
                    </div>
                    <div className="relative z-10">
                      <p className="text-[11px] font-bold text-neutral-500 mb-2 uppercase tracking-[0.2em]">
                        Channel Sync
                      </p>
                      <h3 className="text-3xl font-bold tracking-tight text-white mb-2">{cat.name}</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{Math.floor(Math.random() * 500 + 10)} Active</span>
                        <div className="w-1 h-1 rounded-full bg-neutral-700" />
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{Math.floor(Math.random() * 100 + 50)} Tracks</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          {view === 'room' && (
            <motion.section 
              key="room"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-16 pb-20"
            >
              {!room ? (
                <div className="lg:col-span-12 flex flex-col items-center justify-center py-40">
                  <Loader2 className="w-12 h-12 text-white animate-spin mb-4" />
                  <p className="text-neutral-400 font-medium">Синхронізація сесії...</p>
                </div>
              ) : (
                <>
                  <div className="lg:col-span-8 flex flex-col gap-10">
                    <div className="apple-glass p-10 rounded-[2.5rem] relative overflow-hidden backdrop-blur-3xl">
                      <div className="flex justify-between items-start mb-16">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-[0.2em]">{room.status === 'playing' ? 'Session Live' : 'Waiting for Launch'}</p>
                          </div>
                          <h2 className="text-3xl font-bold tracking-tight text-white">{room.name}</h2>
                          <div className="flex items-center gap-3">
                            <p className="text-xs font-medium text-neutral-500 tracking-wider">Lobby Code: <span className="text-neutral-200 font-mono font-bold uppercase">{room.id}</span></p>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(room.id);
                                alert("Код копійовано!");
                              }}
                              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                              title="Copy Code"
                            >
                              <Copy className="w-3.5 h-3.5 text-neutral-500" />
                            </button>
                            <button 
                              onClick={() => {
                                const url = window.location.origin + "?room=" + room.id;
                                navigator.clipboard.writeText(url);
                                alert("Посилання для друзів скопійовано!");
                              }}
                              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                              title="Copy Join Link"
                            >
                              <Share2 className="w-3.5 h-3.5 text-neutral-500" />
                            </button>
                          </div>
                        </div>
                        {room.hostId === user?.uid && room.status === 'waiting' && (
                          <button 
                            onClick={startGame}
                            disabled={!room.tracks || room.tracks.length === 0}
                            className="px-10 py-3 bg-white text-black font-bold rounded-full hover:scale-[1.02] active:scale-95 transition-all shadow-2xl flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {(!room.tracks || room.tracks.length === 0) ? (
                              <>Fetching Tracks <Loader2 className="w-4 h-4 animate-spin" /></>
                            ) : (
                              <>Start Session <ArrowRight className="w-4 h-4" /></>
                            )}
                          </button>
                        )}
                      </div>

                      {room.status === 'waiting' && (
                        <div className="mb-12 p-8 rounded-3xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row items-center gap-6">
                          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                            <Share2 className="w-8 h-8 text-neutral-400" />
                          </div>
                          <div className="flex-1 text-center sm:text-left">
                            <h4 className="text-lg font-bold text-white mb-1">Запросіть друзів</h4>
                            <p className="text-neutral-500 text-sm">Поділіться цим посиланням, щоб інші могли приєднатися до вашої сесії.</p>
                          </div>
                          <button 
                            onClick={() => {
                              const url = window.location.origin + "?room=" + room.id;
                              if (navigator.share) {
                                navigator.share({ title: room.name, url }).catch(console.error);
                              } else {
                                navigator.clipboard.writeText(url);
                                alert("Посилання скопійовано!");
                              }
                            }}
                            className="w-full sm:w-auto px-8 py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all border border-white/5"
                          >
                            Запросити
                          </button>
                        </div>
                      )}

                      {room.status === 'waiting' ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                          <div className="w-24 h-24 rounded-3xl bg-white/[0.03] flex items-center justify-center mb-8 border border-white/[0.06]">
                            <Users className="w-9 h-9 text-neutral-600" />
                          </div>
                          <h3 className="text-2xl font-bold tracking-tight text-white mb-3">Syncing Listeners</h3>
                          <p className="text-neutral-500 max-w-sm text-sm font-medium leading-relaxed">The session will begin once the lobby is synchronized. Playback is precisely calibrated across all devices.</p>
                        </div>
                      ) : room.status === 'playing' ? (
                        <GameView room={room} onSubmit={submitAnswer} />
                      ) : room.status === 'intermission' ? (
                        <IntermissionView room={room} />
                      ) : (
                        <div className="text-center py-24">
                          <Trophy className="w-16 h-16 text-yellow-500/80 mx-auto mb-10 drop-shadow-[0_0_30px_rgba(234,179,8,0.2)]" />
                          <h3 className="text-4xl font-bold tracking-tight text-white mb-4">Session Completed</h3>
                          <p className="text-neutral-400 font-medium mb-12">Scoring analysis complete.</p>
                          {room.hostId === user?.uid && (
                            <button onClick={() => setView('browse')} className="px-10 py-3.5 bg-white text-black rounded-full hover:scale-[1.02] active:scale-95 transition-all font-bold text-sm tracking-wide">Back to Browse</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-4 space-y-8">
                    <div className="bg-white/[0.03] p-8 rounded-[2rem] border border-white/[0.06] backdrop-blur-2xl">
                      <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-10 flex items-center justify-between">
                        <span>Leaderboard</span>
                        <span className="text-xs text-neutral-400 font-mono">{Object.keys(room.players).length} Online</span>
                      </h3>
                      <div className="space-y-4">
                        {(Object.values(room.players) as Player[])
                          .sort((a, b) => (b.score || 0) - (a.score || 0))
                          .map((p, idx) => (
                            <div key={p.uid} className={cn(
                              "flex items-center justify-between p-4 rounded-2.5xl transition-all border",
                              p.uid === user?.uid ? "bg-white/[0.05] border-white/10" : "bg-transparent border-transparent"
                            )}>
                              <div className="flex items-center gap-4">
                                <div className="relative">
                                  <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center overflow-hidden border border-white/5">
                                    {p.photoURL ? <img src={p.photoURL} alt="" className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-neutral-600" />}
                                  </div>
                                  <div className={cn(
                                    "absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-2xl",
                                    idx === 0 ? "bg-white text-black" : "bg-neutral-900 text-white border border-white/10"
                                  )}>
                                    {idx + 1}
                                  </div>
                                </div>
                                <div>
                                  <p className="font-bold text-sm text-neutral-200">{p.displayName} {p.uid === user?.uid && '(You)'}</p>
                                  <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5">
                                    {p.lastAnswerCorrect && room.status === 'playing' ? (
                                      <span className="text-green-500/80">Match</span>
                                    ) : p.answerTime && room.status === 'playing' ? (
                                      <span className="text-red-500/80">Drift</span>
                                    ) : <span className="text-neutral-700">Syncing...</span>}
                                  </p>
                                </div>
                              </div>
                              <p className="text-lg font-bold text-white font-mono">{p.score || 0}</p>
                            </div>
                          ))}
                      </div>
                    </div>

                    <div className="bg-white/[0.03] p-8 rounded-[2rem] border border-white/[0.06] flex flex-col justify-between h-48">
                      <div>
                        <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em] mb-4">Signal Integrity</div>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-[9px] uppercase font-bold text-neutral-700">Socket Latency</p>
                              <p className="text-[9px] font-mono text-neutral-500">12ms</p>
                            </div>
                            <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full w-[98%] bg-green-500/40"></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-[9px] uppercase font-bold text-neutral-700">State Entropy</p>
                              <p className="text-[9px] font-mono text-neutral-500">Minimal</p>
                            </div>
                            <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full w-[5%] bg-blue-500/40"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-50 px-10 py-5 border-t border-white/[0.05] flex items-center justify-between bg-black/40 backdrop-blur-2xl text-[10px] text-neutral-500 font-bold uppercase tracking-[0.2em]">
        <div className="flex gap-10">
          <span>v1.2.0 "Silicon"</span>
          <span className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-green-500/50"></div> Latency: 12ms</span>
        </div>
        <div className="hidden sm:flex gap-8">
          <a href="#" className="hover:text-white transition-colors">Documentation</a>
          <a href="#" className="hover:text-white transition-colors">Infrastructure</a>
          <a href="#" className="hover:text-white transition-colors">Terms</a>
        </div>
      </footer>
    </div>
  );
}

function GameView({ room, onSubmit }: { room: Room, onSubmit: (c: boolean, t: number) => void }) {
  const currentTrack = room.tracks[room.currentRound];
  const [hasAnswered, setHasAnswered] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(1.5);
  const phaseDurations = [1000, 2000, 4000]; // ms

  useEffect(() => {
    const retraks = room.tracks
      .filter((t: any) => t.id !== currentTrack.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map((t: any) => t.title);
    
    setOptions([currentTrack.title, ...retraks].sort(() => 0.5 - Math.random()));
    setHasAnswered(false);
  }, [room.currentRound, currentTrack.id]);

  useEffect(() => {
    setTimeLeft(1.5);
    const audio = new Audio(currentTrack.previewUrl);
    let playbackStarted = false;
    let isTerminated = false;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        playbackStarted = true;
        if (isTerminated) audio.pause();
      }).catch(console.error);
    }

    const stopAudio = setTimeout(() => {
      if (playbackStarted) {
        audio.pause();
        audio.currentTime = 0;
      } else {
        isTerminated = true;
      }
    }, phaseDurations[room.currentPhase - 1]);

    // Precise Sync: Calculate startTime from server timestamp
    const serverStart = room.phaseStartTime?.toMillis?.() || Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      // Robust timestamp handling: handles Firestore Timestamp objects and raw numbers
      let effectiveStart = now;
      if (room.phaseStartTime) {
        if (typeof (room.phaseStartTime as any).toMillis === 'function') {
          effectiveStart = (room.phaseStartTime as any).toMillis();
        } else if (typeof room.phaseStartTime === 'number') {
          effectiveStart = room.phaseStartTime;
        } else if ((room.phaseStartTime as any).seconds) {
          effectiveStart = (room.phaseStartTime as any).seconds * 1000;
        }
      }
      
      const elapsed = (now - effectiveStart) / 1000;
      const remaining = Math.max(0, 1.5 - elapsed);
      setTimeLeft(remaining);

      if (!playbackStarted && elapsed > 0 && elapsed < 1.5) {
        audio.currentTime = elapsed;
      }

      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 32);

    return () => {
      clearInterval(timer);
      clearTimeout(stopAudio);
      audio.pause();
      isTerminated = true;
    };
  }, [room.currentRound, room.currentPhase, currentTrack.id]);

  const handleAnswer = (choice: string) => {
    if (hasAnswered) return;
    const isCorrect = choice === currentTrack.title;
    const reactionTime = (1.5 - timeLeft) * 1000;
    onSubmit(isCorrect, reactionTime);
    setHasAnswered(true);
  };

  return (
    <div className="space-y-16">
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-1">
              Round {room.currentRound + 1} of {room.tracks.length}
            </p>
            <h4 className="text-sm font-bold text-neutral-400">Phase {room.currentPhase} • Action Window</h4>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold font-mono tracking-tighter text-white">{timeLeft.toFixed(2)}s</p>
          </div>
        </div>
        <div className="w-full h-[3px] bg-white/5 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-white" 
            initial={{ width: "100%" }}
            animate={{ width: `${(timeLeft / 1.5) * 100}%` }}
            transition={{ duration: 0.1, ease: 'linear' }}
          />
        </div>
      </div>

      <div className="relative h-64 flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.01] to-transparent rounded-3xl" />
        <motion.div 
          animate={{ 
            scale: [1, 1.02, 1], 
            opacity: [0.1, 0.2, 0.1]
          }} 
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          className="w-32 h-32 rounded-full bg-white flex items-center justify-center backdrop-blur-3xl"
        >
          <Music2 className="w-12 h-12 text-black" />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map((option, idx) => (
          <button
            key={idx}
            disabled={hasAnswered}
            onClick={() => handleAnswer(option)}
            className={cn(
              "p-6 rounded-2xl text-left font-semibold transition-all duration-200 active:scale-95 border",
              hasAnswered 
                ? option === currentTrack.title 
                  ? "bg-white text-black border-white shadow-[0_0_40px_rgba(255,255,255,0.1)]"
                  : "bg-neutral-900 border-transparent opacity-20 text-neutral-500"
                : "bg-neutral-900 border-white/[0.03] hover:bg-neutral-800 hover:border-white/10 text-neutral-300"
            )}
          >
            <span className="text-sm font-medium tracking-wide">{option}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function IntermissionView({ room }: { room: Room }) {
  const currentTrack = room.tracks[room.currentRound];
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const winners = Object.values(room.players).filter(p => p.lastAnswerCorrect);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center py-10"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-80 h-80 rounded-[2.5rem] overflow-hidden mb-12 shadow-[0_60px_120px_rgba(0,0,0,0.9)] border border-white/10"
      >
        <img src={currentTrack.albumArt} className="w-full h-full object-cover" alt="" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
      </motion.div>

      <div className="text-center space-y-3 mb-16 px-4">
        <motion.span 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.4em]"
        >
          Matched Track
        </motion.span>
        <motion.h3 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-4xl font-bold tracking-tight text-white"
        >
          {currentTrack.title}
        </motion.h3>
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-xl text-neutral-400 font-medium"
        >
          {currentTrack.artist}
        </motion.p>
      </div>

      <div className="w-full max-w-sm bg-white/[0.02] border border-white/[0.06] rounded-[2rem] p-8 mb-12 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-8">
          <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">Matched Listeners</p>
          <span className="text-xs font-mono text-neutral-400">{winners.length} / {Object.keys(room.players).length}</span>
        </div>
        <div className="space-y-4">
          {winners.length > 0 ? winners.map(p => (
            <div key={p.uid} className="flex items-center justify-between px-4 py-3 bg-white/[0.03] rounded-xl border border-white/[0.05]">
              <span className="font-bold text-sm text-neutral-200">{p.displayName}</span>
              <span className="font-mono text-[10px] text-green-500/60">{p.answerTime?.toFixed(0)}ms</span>
            </div>
          )) : (
            <div className="text-center py-6 text-neutral-700 text-xs font-medium italic">Signal lost. No consensus.</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-neutral-600">
        <div className="w-4 h-4 border-2 border-neutral-900 border-t-neutral-600 rounded-full animate-spin" />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Next reveal in {countdown}s</p>
      </div>
    </motion.div>
  );
}
