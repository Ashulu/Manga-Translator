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
  project_id: string;
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

  const [showAuthModal, setShowAuthModal] = useState(false);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Check if the user is currently typing in an input or textarea
      const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  
      // 2. Only trigger if Cmd/Ctrl + K is pressed
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen(prev => !prev);
      }
  
      // 3. Escape should always close it, even if typing
      if (e.key === 'Escape') {
        setIsPaletteOpen(false);
      }
    };
  
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [glossary, setGlossary] = useState<{japanese: string, english: string}[]>([]);
  const [newTerm, setNewTerm] = useState({ jp: '', en: '' });
  const [activeTab, setActiveTab] = useState<'pages' | 'glossary'>('pages');

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
      formData.append('project_id', project.id);
      // We send the glossary so the AI knows the rules for this specific upload
      formData.append('glossary', JSON.stringify(glossary));

      // Wait for the backend to finish processing all pages
      await axios.post('http://127.0.0.1:8000/process-page', formData);

      // 3. SYNC UI
      // This will fetch the fresh pages and the glossary from the DB
      await loadProject(project.id);
      
    } catch (error) {
      console.error("Processing failed:", error);
      alert("Failed to process file. Check backend logs.");
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
        original_size: { width: p.width, height: p.height },
        project_id: p.project_id
      }));
      setPages(formattedPages);
      setCurrentPageIndex(0);
      fetchGlossary(projectId); 
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

  const getPaletteResults = () => {
    if (!paletteQuery) return [];
  
    const results: any[] = [];
    const q = paletteQuery.toLowerCase();
  
    // A. Static Commands
    if ("export save download".includes(q)) {
      results.push({ type: 'command', label: 'Export Current Page', action: handleDownloadCurrentPage, icon: <Download size={14}/> });
    }
  
    // B. Page Navigation
    if (q.startsWith('p') || !isNaN(Number(q))) {
      const pageNum = parseInt(q.replace(/\D/g, ''));
      if (pageNum > 0 && pageNum <= pages.length) {
        results.push({ 
          type: 'nav', 
          label: `Jump to Page ${pageNum}`, 
          action: () => setCurrentPageIndex(pageNum - 1), 
          icon: <ChevronRight size={14}/> 
        });
      }
    }
  
    // C. Deep Search in Bubbles
    pages.forEach((page, pIdx) => {
      page.bubbles.forEach((bubble) => {
        if (bubble.translated.toLowerCase().includes(q)) {
          results.push({
            type: 'search',
            label: bubble.translated,
            sublabel: `Page ${pIdx + 1}`,
            action: () => setCurrentPageIndex(pIdx),
            icon: <ScanEye size={14}/>
          });
        }
      });
    });
  
    return results.slice(0, 8); // Limit to top 8 results
  };

  const fetchGlossary = async (projectId: string) => {
    const { data } = await supabase
      .from('glossary_items')
      .select('japanese, english')
      .eq('project_id', projectId);
    if (data) setGlossary(data);
  };
  
  const addGlossaryTerm = async () => {
    if (!newTerm.jp || !newTerm.en || !pages.length) return;
    
    const currentProjectId = history.find(p => p.id === pages[0]?.project_id)?.id; // Or track currentProjectId in state
  
    const { error } = await supabase
      .from('glossary_items')
      .insert({ 
        project_id: pages[0].project_id, // Ensure your PageResult interface has project_id
        japanese: newTerm.jp, 
        english: newTerm.en 
      });
  
    if (!error) {
      setGlossary([...glossary, { japanese: newTerm.jp, english: newTerm.en }]);
      setNewTerm({ jp: '', en: '' });
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
          {/* Tab Switcher */}
          <div className="flex border-b border-white/5">
            <button 
              onClick={() => setActiveTab('pages')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'pages' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'}`}
            >
              Pages
            </button>
            <button 
              onClick={() => setActiveTab('glossary')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition ${activeTab === 'glossary' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500'}`}
            >
              Glossary
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === 'pages' ? (
              <div className="p-4 space-y-4">
                {/* ... YOUR EXISTING PAGES MAP ... */}
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-4">
                {/* Add Term Form */}
                <div className="space-y-2 pb-4 border-b border-white/5">
                  <input 
                    placeholder="Japanese" 
                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs outline-none focus:border-blue-500"
                    value={newTerm.jp}
                    onChange={e => setNewTerm({...newTerm, jp: e.target.value})}
                  />
                  <input 
                    placeholder="English" 
                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs outline-none focus:border-blue-500"
                    value={newTerm.en}
                    onChange={e => setNewTerm({...newTerm, en: e.target.value})}
                  />
                  <button 
                    onClick={addGlossaryTerm}
                    className="w-full py-2 bg-blue-600 rounded text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition"
                  >
                    Add Term
                  </button>
                </div>

                {/* Glossary List */}
                <div className="space-y-2">
                  {glossary.map((item, idx) => (
                    <div key={idx} className="p-2 bg-white/5 rounded border border-white/5 flex flex-col">
                      <span className="text-gray-500 text-[10px] font-mono">{item.japanese}</span>
                      <span className="text-blue-400 text-xs font-bold">{item.english}</span>
                    </div>
                  ))}
                </div>
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

                  const isEditing = editingIndex === i;

                  return (
                    <div
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setEditingIndex(i); }}
                      // We set the container type here...
                      className="absolute z-10 overflow-hidden pointer-events-auto cursor-pointer"
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        width: `${width}%`,
                        height: `${height}%`,
                        containerType: 'size', // This div is the container
                      }}
                    >
                      {/* ...and apply the font size to this inner wrapper */}
                      <div 
                        className={`w-full h-full flex items-center justify-center text-center p-[5cqmin]
                                    uppercase tracking-tight leading-[1.1] ${selectedFont} text-black
                                    ${isEditing ? 'bg-white/95 ring-2 ring-blue-500' : 'hover:bg-white/10'}`}
                        style={{
                          // 8cqmin means "8% of the bubble's smallest dimension"
                          // This is very stable and prevents the "MI RA" vertical stacking
                          fontSize: '12cqmin', 
                          textWrap: 'balance',
                          textShadow: isEditing ? 'none' : '0px 0px 2px white, 0px 0px 2px white',
                          transition: 'background 0.2s ease',
                        }}
                      >
                        {isEditing ? (
                          <textarea
                            autoFocus
                            value={bubble.translated}
                            onChange={(e) => handleTextChange(currentPageIndex, i, e.target.value)}
                            onBlur={() => setEditingIndex(null)}
                            onKeyDown={(e) => {
                              if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditingIndex(null); }
                            }}
                            className="w-full h-full bg-transparent border-none outline-none resize-none text-center p-0 m-0"
                            style={{ fontSize: 'inherit', fontFamily: 'inherit', lineHeight: 'inherit' }}
                          />
                        ) : (
                          <span className="w-full pointer-events-none">{bubble.translated}</span>
                        )}
                      </div>
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

      {/* --- FEATURE #6: COMMAND PALETTE --- */}
      {isPaletteOpen && (
        <div className="fixed inset-0 z-300 flex items-start justify-center pt-[15vh] px-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-md" 
            onClick={() => setIsPaletteOpen(false)} 
          />
          
          {/* Search Box */}
          <div className="relative w-full max-w-xl bg-[#1a1b1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center px-4 py-4 border-b border-white/5">
              <ScanEye className="text-blue-500 mr-3" size={20} />
              <input 
                autoFocus
                placeholder="Search bubbles, pages, or commands..."
                className="bg-transparent border-none outline-none w-full text-lg font-medium placeholder:text-gray-600"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                      const results = getPaletteResults();
                      if (results.length > 0) {
                        results[0].action();
                        setIsPaletteOpen(false);
                        setPaletteQuery("");
                      }
                  }
                }}
              />
              <div className="text-[10px] font-mono bg-white/5 px-2 py-1 rounded text-gray-500">ESC</div>
            </div>

            {/* Results List */}
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {getPaletteResults().length > 0 ? (
                getPaletteResults().map((res, idx) => (
                  <button
                    key={idx}
                    onClick={() => { res.action(); setIsPaletteOpen(false); setPaletteQuery(""); }}
                    className="w-full flex items-center justify-between p-3 hover:bg-white/5 rounded-xl transition text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-gray-500 group-hover:text-blue-400 transition">{res.icon}</div>
                      <div>
                        <p className="text-sm font-bold text-gray-200 truncate max-w-75">{res.label}</p>
                        {res.sublabel && <p className="text-[10px] text-gray-500 uppercase">{res.sublabel}</p>}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-700 font-mono group-hover:text-gray-400">SELECT</span>
                  </button>
                ))
              ) : (
                <div className="py-12 text-center">
                  <p className="text-xs text-gray-600 font-mono uppercase tracking-widest">
                    {paletteQuery ? "No results found" : "Type to search studio..."}
                  </p>
                </div>
              )}
            </div>

            {/* Footer Tips */}
            <div className="bg-black/20 px-4 py-2 border-t border-white/5 flex gap-4">
              <span className="text-[9px] text-gray-600"><strong>↑↓</strong> to navigate</span>
              <span className="text-[9px] text-gray-600"><strong>ENTER</strong> to select</span>
              <span className="text-[9px] text-gray-600"><strong>P + #</strong> to jump to page</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}