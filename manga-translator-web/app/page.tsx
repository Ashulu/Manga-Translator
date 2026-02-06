'use client';

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Upload, ScanEye, Loader2, Download, ChevronLeft, ChevronRight, Trash2, X, Save } from 'lucide-react';
import html2canvas from 'html2canvas';
import { supabase } from '@/lib/supabase';

interface Bubble {
  box: [number, number, number, number]; 
  japanese: string;
  translated: string;
}

interface PageResult {
  bubbles: Bubble[];
  cleaned_image: string;
  original_size: { width: number; height: number };
}

export default function Home() {
  // We now store an ARRAY of pages
  const [pages, setPages] = useState<PageResult[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  
  const [loading, setLoading] = useState(false);
  const [selectedFont, setSelectedFont] = useState('font-anime');
  const [targetLang, setTargetLang] = useState('English');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const [showAuthModal, setShowAuthModal] = useState(false);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Check for active session on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auth Functions
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) alert(error.message);
      else alert("Check your email for the confirmation link!");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setPages([]); // Clear current view
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPages([]);
    setCurrentPageIndex(0);
    setEditingIndex(null);
    processFile(file);
  };

  const processFile = async (file: File) => {
    if (!user) return alert("Please log in first!");
    setLoading(true);

    try {
      // 1. CREATE PROJECT ON FRONTEND
      const { data: project, error: pError } = await supabase
        .from('projects')
        .insert({ title: file.name, user_id: user.id })
        .select()
        .single();

      if (pError) throw pError;

      // 2. SEND TO BACKEND
      const formData = new FormData();
      formData.append('file', file);
      formData.append('target_language', targetLang);
      formData.append('project_id', project.id); // <--- Pass the ID we just made

      await axios.post('http://127.0.0.1:8000/process-page', formData);
      
      // 3. RELOAD
      loadProject(project.id);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleTextChange = (pageIndex: number, bubbleIndex: number, newText: string) => {
    const newPages = [...pages];
    newPages[pageIndex].bubbles[bubbleIndex].translated = newText;
    setPages(newPages);
  };

  const handleDownloadCurrentPage = async () => {
    if (!containerRef.current) return;
    const canvas = await html2canvas(containerRef.current, { useCORS: true, scale: 2 });
    const image = canvas.toDataURL("image/jpeg", 0.9);
    const link = document.createElement("a");
    link.href = image;
    link.download = `manga_page_${currentPageIndex + 1}.jpg`;
    link.click();
  };

  // Helper to get current page data
  const currentPage = pages[currentPageIndex];

  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
  
    if (data) setHistory(data);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) { // Zoom on Ctrl/Cmd + Scroll
      e.preventDefault();
      const zoomSpeed = 0.001;
      const delta = -e.deltaY;
      const newScale = Math.min(Math.max(scale + delta * zoomSpeed, 0.1), 5);
      setScale(newScale);
    } else if (!isPanning) {
      // Normal scroll moves the offset (Panning)
      setOffset(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };
  
  // Fetch on load
  useEffect(() => {
    fetchHistory();
  }, []);

  const loadProject = async (projectId: string) => {
    setLoading(true);
    setShowHistory(false);
  
    const { data: pagesData, error } = await supabase
      .from('pages')
      .select('*')
      .eq('project_id', projectId)
      .order('page_number', { ascending: true });
  
    if (pagesData) {
      // Map database structure back to our PageResult interface
      const formattedPages = pagesData.map(p => ({
        bubbles: p.bubbles_json,
        cleaned_image: p.image_url,
        original_size: { width: p.width, height: p.height }
      }));
      setPages(formattedPages);
      setCurrentPageIndex(0);
    }
    setLoading(false);
  };

  const deleteProject = async (e: React.MouseEvent, projectId: string) => {
    // Prevent the click from triggering 'loadProject'
    e.stopPropagation();
    
    if (!confirm("Are you sure you want to delete this translation?")) return;
  
    try {
      // 1. Delete the Project from the DB 
      // (The 'pages' rows will cascade delete automatically)
      const { error: dbError } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);
  
      if (dbError) throw dbError;
  
      // 2. Clean up Storage
      // We get a list of all files in the project folder and delete them
      const { data: files } = await supabase.storage
        .from('manga-images')
        .list(projectId);
  
      if (files && files.length > 0) {
        const pathsToDelete = files.map(f => `${projectId}/${f.name}`);
        await supabase.storage.from('manga-images').remove(pathsToDelete);
      }
  
      // 3. Update local state
      setHistory(prev => prev.filter(p => p.id !== projectId));
      
      // 4. If we are currently viewing the deleted project, clear the screen
      if (pages.length > 0 && history.find(p => p.id === projectId)) {
          setPages([]);
      }
  
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("Failed to delete project.");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-blue-500/30">
        {/* --- NAVBAR --- */}
        <nav className="flex justify-between items-center px-8 py-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-2xl font-bold tracking-tighter text-blue-400">
            <ScanEye size={32} /> <span>MangaPulse</span>
          </div>
          <div className="flex gap-6 items-center">
            <button onClick={() => { setIsSignUp(false); setShowAuthModal(true); }} className="text-sm font-medium hover:text-blue-400 transition">Log In</button>
            <button onClick={() => { setIsSignUp(true); setShowAuthModal(true); }} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-full text-sm font-bold transition shadow-lg shadow-blue-900/20">Sign Up Free</button>
          </div>
        </nav>
  
        {/* --- HERO SECTION --- */}
        <section className="px-8 pt-20 pb-32 text-center max-w-4xl mx-auto">
          <div className="inline-block px-4 py-1.5 mb-6 border border-blue-500/30 bg-blue-500/10 rounded-full text-blue-400 text-xs font-bold uppercase tracking-widest">
            Powered by Gemini 2.5 Flash
          </div>
          <h1 className="text-6xl md:text-7xl font-black mb-8 leading-[1.1] tracking-tight">
            Read any Manga in <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-cyan-300">your language.</span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            The all-in-one AI workstation for fans and scanlators. Detect bubbles, erase Japanese text, and typeset with professional fonts in seconds.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => { setIsSignUp(true); setShowAuthModal(true); }}
              className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-lg transition-all hover:scale-105"
            >
              Start Translating Now
            </button>
          </div>
        </section>
  
        {/* --- FEATURES GRID --- */}
        <section className="px-8 py-24 bg-gray-900/50 border-y border-gray-800">
          <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-12">
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 bg-blue-600/20 flex items-center justify-center rounded-xl text-blue-400">
                <ScanEye />
              </div>
              <h3 className="text-xl font-bold">Smart Detection</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Using YOLOv8 to automatically identify speech bubbles and text areas with pixel-perfect precision.</p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 bg-purple-600/20 flex items-center justify-center rounded-xl text-purple-400">
                <Save />
              </div>
              <h3 className="text-xl font-bold">Context-Aware AI</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Powered by Gemini. Understands slang, honorifics, and sarcasm that traditional translators miss.</p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 bg-green-600/20 flex items-center justify-center rounded-xl text-green-400">
                <Download />
              </div>
              <h3 className="text-xl font-bold">Cloud Workspace</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Save your projects to the cloud. Access your history and edits from any device, anytime.</p>
            </div>
          </div>
        </section>
  
        {/* --- AUTH MODAL --- */}
        {showAuthModal && (
          <div className="fixed inset-0 z-200 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowAuthModal(false)} />
            <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 p-10 rounded-3xl shadow-2xl">
              <button onClick={() => setShowAuthModal(false)} className="absolute top-6 right-6 text-gray-500 hover:text-white"><X size={20}/></button>
              <h2 className="text-3xl font-black mb-2">{isSignUp ? 'Join Pulse' : 'Welcome Back'}</h2>
              <p className="text-gray-400 text-sm mb-8">{isSignUp ? 'Start your journey into the world of manga.' : 'Log in to access your translations.'}</p>
              
              <form onSubmit={handleAuth} className="flex flex-col gap-4">
                <input 
                  type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)}
                  className="bg-gray-800 border-none p-4 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" required 
                />
                <input 
                  type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                  className="bg-gray-800 border-none p-4 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" required 
                />
                <button className="bg-blue-600 p-4 rounded-xl font-bold hover:bg-blue-500 transition-all mt-2">
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </button>
              </form>
              <button 
                onClick={() => setIsSignUp(!isSignUp)}
                className="w-full text-center mt-6 text-xs text-gray-500 hover:text-blue-400 transition"
              >
                {isSignUp ? 'Already a member? Sign In' : 'New to Pulse? Create an account'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="h-screen w-full bg-[#0b0c10] text-gray-100 flex flex-col overflow-hidden font-sans selection:bg-blue-500/30">
      
      {/* --- 1. THE STUDIO HEADER --- */}
      <header className="h-14 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between px-6 z-110 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-blue-400 font-black tracking-tighter text-xl">
            <ScanEye size={24} />
            <span>MangaPulse <span className="text-[10px] text-gray-500 font-mono tracking-normal ml-1 uppercase">Studio v1.0</span></span>
          </div>
        </div>
  
        <div className="flex items-center gap-6">
          {user && (
            <>
              <div className="flex items-center gap-4 border-r border-white/10 pr-6 mr-2">
                 <div className="flex flex-col">
                    <label className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Typography</label>
                    <select 
                      value={selectedFont} 
                      onChange={(e) => setSelectedFont(e.target.value)}
                      className="bg-transparent text-xs font-bold outline-none cursor-pointer hover:text-blue-400 transition"
                    >
                      <option value="font-anime">Anime Ace</option>
                      <option value="font-action">Action Man</option>
                      <option value="font-smack">Smack Attack</option>
                    </select>
                 </div>
                 <div className="flex flex-col">
                    <label className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Language</label>
                    <select 
                      value={targetLang} 
                      onChange={(e) => setTargetLang(e.target.value)}
                      className="bg-transparent text-xs font-bold outline-none cursor-pointer hover:text-blue-400 transition"
                    >
                      <option value="English">English</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                    </select>
                 </div>
              </div>
  
              <button onClick={() => { setShowHistory(true); fetchHistory(); }} className="text-xs font-bold hover:text-blue-400 transition">History</button>
              <button onClick={handleSignOut} className="text-xs font-bold text-gray-500 hover:text-red-400 transition">Sign Out</button>
              
              <div className="flex gap-2 ml-4">
                {currentPage && (
                  <button 
                    onClick={handleDownloadCurrentPage}
                    className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-black transition"
                  >
                    <Download size={14}/> Export
                  </button>
                )}
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-black transition"
                >
                  Upload
                </button>
              </div>
            </>
          )}
        </div>
      </header>
  
      <input type="file" hidden ref={fileInputRef} accept="image/*,.pdf" onChange={handleFileChange} />
  
      {/* --- 2. THE WORKSPACE --- */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* SIDEBAR: Filmstrip Navigation */}
        <aside className="w-64 border-r border-white/5 bg-black/20 flex flex-col md:flex shrink-0">
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <span className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Chapter Pages</span>
            <span className="text-[10px] font-mono text-gray-600">{pages.length} total</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {pages.map((p, idx) => (
              <div 
                key={idx} 
                onClick={() => { setCurrentPageIndex(idx); setEditingIndex(null); }}
                className={`group relative aspect-2/3 w-full rounded-lg border-2 transition-all cursor-pointer overflow-hidden ${currentPageIndex === idx ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : 'border-white/5 hover:border-white/20'}`}
              >
                 <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors z-10" />
                 <img src={p.cleaned_image} className="w-full h-full object-cover" />
                 <div className="absolute bottom-2 left-2 z-20 bg-black/60 px-2 py-0.5 rounded text-[10px] font-mono text-white">
                    {idx + 1}
                 </div>
              </div>
            ))}
            {pages.length === 0 && (
              <div className="text-center py-20 opacity-20 flex flex-col items-center gap-2">
                 <Upload size={32} />
                 <span className="text-xs uppercase font-bold tracking-tighter">Empty Rack</span>
              </div>
            )}
          </div>
        </aside>
  
        {/* THE STAGE: The Canvas Area */}
        <section 
          className="flex-1 relative bg-[#111216] overflow-hidden cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={() => setIsPanning(true)}
          onMouseUp={() => setIsPanning(false)}
          onMouseMove={(e) => {
            if (isPanning) {
              setOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
            }
          }}
        >
          {/* The Transform Layer */}
          <div 
            className="absolute inset-0 flex items-center justify-center transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: 'center',
            }}
          >
            {currentPage ? (
              <div 
                ref={containerRef} 
                className="relative shadow-[0_40px_100px_rgba(0,0,0,0.7)] bg-white"
              >
                <img 
                  src={currentPage.cleaned_image} 
                  alt="Manga Page" 
                  className="w-full h-auto block max-w-none" 
                  style={{ width: currentPage.original_size.width / 2 }} // Base size
                />

                {currentPage.bubbles.map((bubble, i) => {
                  const [x1, y1, x2, y2] = bubble.box;
                  const { width: origW, height: origH } = currentPage.original_size;
                  
                  const left = (x1 / origW) * 100;
                  const top = (y1 / origH) * 100;
                  const width = ((x2 - x1) / origW) * 100;
                  const height = ((y2 - y1) / origH) * 100;

                  return (
                    <div
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setEditingIndex(i); }}
                      className={`absolute text-black flex items-center justify-center text-center p-1 z-10 overflow-hidden 
                                  uppercase tracking-tight leading-none ${selectedFont} 
                                  ${editingIndex === i ? 'ring-2 ring-blue-500 bg-white/95 z-50' : ''}`}
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        width: `${width}%`,
                        height: `${height}%`,
                        containerType: 'size',
                        
                        // IMPROVED TYPESETTING LOGIC:
                        // 1. We lowered the min-size to 4px for tiny labels.
                        // 2. We use 'cqw' to ensure text doesn't overflow width-wise.
                        fontSize: 'clamp(4px, 15cqw, 20px)', 
                        
                        wordBreak: 'break-word',
                        hyphens: 'auto',
                        textWrap: 'balance',
                        textShadow: editingIndex === i ? 'none' : '0px 0px 2px white',
                      }}
                    >
                      {editingIndex === i ? (
                        <textarea
                          autoFocus
                          value={bubble.translated}
                          onChange={(e) => handleTextChange(currentPageIndex, i, e.target.value)}
                          onBlur={() => setEditingIndex(null)}
                          className="w-full h-full bg-transparent border-none outline-none resize-none text-center p-0"
                          style={{ fontSize: 'inherit', fontFamily: 'inherit' }}
                        />
                      ) : (
                        <span className="w-full">{bubble.translated}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-700 select-none">
                <ScanEye size={120} className="mb-6 opacity-5" />
                <p className="text-xs font-black uppercase tracking-[0.4em] opacity-20">Workspace Standby</p>
                <p className="text-[10px] text-gray-800 mt-4 max-w-50 text-center leading-relaxed font-mono">
                  UPLOAD A PROJECT OR SELECT FROM HISTORY TO INITIALIZE CANVAS
                </p>
              </div>
            )}
          </div>

          {/* Floating Zoom Controls (UI Juice) */}
          <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/10 z-120">
            <button onClick={() => setScale(s => Math.max(s - 0.2, 0.2))} className="p-2 hover:bg-white/10 rounded-lg">-</button>
            <span className="text-[10px] font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(s + 0.2, 5))} className="p-2 hover:bg-white/10 rounded-lg">+</button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button onClick={() => { setScale(1); setOffset({x:0, y:0}); }} className="text-[10px] font-bold px-2 uppercase">Reset</button>
          </div>
        </section>
      </div>
  
      {/* --- 3. THE STUDIO FOOTER --- */}
      <footer className="h-8 border-t border-white/5 bg-black/40 flex items-center justify-between px-6 text-[10px] font-mono text-gray-500 z-110">
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
              <span>SYSTEM: {loading ? 'PROCESSING' : 'IDLE'}</span>
            </div>
            <span>PAGE_ID: {currentPageIndex + 1}/{pages.length}</span>
            {currentPage && <span>RES: {currentPage.original_size.width}x{currentPage.original_size.height}</span>}
          </div>
          <div className="flex gap-6">
            <span className="text-blue-500/50">ENGINE: GEMINI-1.5-FLASH</span>
            <span>FPS: 60</span>
          </div>
      </footer>
  
      {/* HISTORY SIDEBAR (Keep your existing history logic here) */}
      {showHistory && (
        <div className="fixed inset-0 z-200 flex justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowHistory(false)} />
          <div className="relative w-80 h-full bg-gray-950 border-l border-white/10 p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black uppercase tracking-tighter">History</h2>
              <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-white"><X /></button>
            </div>
            <div className="flex flex-col gap-3">
              {history.map((project) => (
                <div 
                  key={project.id}
                  onClick={() => loadProject(project.id)}
                  className="p-4 bg-gray-900/50 border border-white/5 rounded-xl cursor-pointer hover:border-blue-500 transition group relative"
                >
                  <button onClick={(e) => deleteProject(e, project.id)} className="absolute top-2 right-2 text-gray-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><Trash2 size={14} /></button>
                  <p className="font-bold text-sm truncate pr-4">{project.title}</p>
                  <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">{new Date(project.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}