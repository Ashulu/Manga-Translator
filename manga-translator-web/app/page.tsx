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
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8 flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-6 text-blue-400 flex items-center gap-3">
        <ScanEye /> MangaPulse
      </h1>

      {/* --- CONTROLS BAR --- */}
      <div className="flex flex-wrap gap-4 mb-6 justify-center w-full max-w-5xl">
        
        {/* Settings */}
        <div className="bg-gray-900 p-3 rounded-lg border border-gray-800 flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] text-gray-500 uppercase font-bold">Font</label>
            <select 
              value={selectedFont} 
              onChange={(e) => setSelectedFont(e.target.value)}
              className="bg-transparent text-sm font-bold outline-none cursor-pointer"
            >
              <option value="font-anime">Anime Ace</option>
              <option value="font-action">Action Man</option>
              <option value="font-smack">Smack</option>
            </select>
          </div>
          <div className="w-px h-8 bg-gray-700"></div>
          <div className="flex flex-col">
            <label className="text-[10px] text-gray-500 uppercase font-bold">Language</label>
            <select 
              value={targetLang} 
              onChange={(e) => setTargetLang(e.target.value)}
              className="bg-transparent text-sm font-bold outline-none cursor-pointer"
            >
              <option value="English">English</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-gray-900 p-3 rounded-lg border border-gray-800 flex items-center gap-3">
          <button 
            onClick={handleSignOut}
            className="px-3 py-2 text-xs text-gray-500 hover:text-red-400 transition"
          >
            Sign Out
          </button>
          <button 
            onClick={() => { setShowHistory(true); fetchHistory(); }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm font-bold transition flex items-center gap-2"
          >
            <ScanEye size={16} /> My History
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-bold transition"
          >
            <Upload size={16}/> Upload PDF/IMG
          </button>
          
          {currentPage && (
            <button 
              onClick={handleDownloadCurrentPage}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-bold transition"
            >
              <Download size={16}/> Save Page
            </button>
          )}
        </div>
      </div>

      {/* SIDEBAR / DRAWER */}
      {showHistory && (
        // We use z-[100] to ensure it is above EVERYTHING else on the page
        <div className="fixed inset-0 z-100 flex justify-end">
          
          {/* Backdrop: This darkens the background and captures clicks */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
            onClick={() => setShowHistory(false)} 
          />
          
          {/* Panel: The actual sidebar */}
          <div className="relative w-80 h-full bg-gray-950 border-l border-gray-800 p-6 shadow-2xl overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold">History</h2>
              <button 
                onClick={() => setShowHistory(false)}
                className="text-gray-500 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {history.length === 0 ? (
                <p className="text-gray-500 text-sm text-center mt-10">No projects yet.</p>
              ) : (
                history.map((project) => (
                  <div 
                    key={project.id}
                    onClick={() => loadProject(project.id)}
                    // Added 'relative' and 'flex-col' to keep everything contained
                    className="p-4 bg-gray-900 border border-gray-800 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-gray-800 transition group relative flex flex-col gap-1"
                  >
                    <div className="flex justify-between items-start gap-2">
                      {/* Title Container */}
                      <p className="font-bold text-sm truncate flex-1 group-hover:text-blue-400 transition">
                        {project.title}
                      </p>

                      {/* DELETE BUTTON: Contained within the flex header of the card */}
                      <button 
                        onClick={(e) => deleteProject(e, project.id)}
                        className="text-gray-600 hover:text-red-500 transition p-1 -mr-1"
                        title="Delete Project"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] text-gray-500 uppercase tracking-tighter">
                        {new Date(project.created_at).toLocaleDateString()}
                      </span>
                      
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                        project.status === 'completed' 
                          ? 'border-green-900/30 text-green-500 bg-green-500/5' 
                          : 'border-yellow-900/30 text-yellow-500 bg-yellow-500/5'
                      }`}>
                        {project.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <input type="file" hidden ref={fileInputRef} accept="image/*,.pdf" onChange={handleFileChange} />

      {loading && (
        <div className="flex flex-col items-center gap-2 text-blue-400 mb-8 animate-pulse">
          <Loader2 className="animate-spin w-8 h-8" />
          <span className="text-lg">Processing... (PDFs take time!)</span>
        </div>
      )}

      {/* --- PAGINATION CONTROLS --- */}
      {pages.length > 0 && (
        <div className="flex items-center gap-4 mb-4">
          <button 
            disabled={currentPageIndex === 0}
            onClick={() => setCurrentPageIndex(p => p - 1)}
            className="p-2 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
          >
            <ChevronLeft />
          </button>
          <span className="font-mono font-bold">
            Page {currentPageIndex + 1} of {pages.length}
          </span>
          <button 
            disabled={currentPageIndex === pages.length - 1}
            onClick={() => setCurrentPageIndex(p => p + 1)}
            className="p-2 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
          >
            <ChevronRight />
          </button>
        </div>
      )}

      {/* --- CANVAS --- */}
      {currentPage && (
        <div 
          ref={containerRef}
          className="relative w-full max-w-4xl border border-gray-800 shadow-2xl bg-white"
        >
          <img 
            src={currentPage.cleaned_image} 
            alt="Manga Page" 
            className="w-full h-auto block"
          />

          {currentPage.bubbles.map((bubble, i) => {
            const [x1, y1, x2, y2] = bubble.box;
            // Use server-provided original dimensions for perfect scaling
            const { width: origW, height: origH } = currentPage.original_size;
            
            const left = (x1 / origW) * 100;
            const top = (y1 / origH) * 100;
            const width = ((x2 - x1) / origW) * 100;
            const height = ((y2 - y1) / origH) * 100;

            const isEditing = editingIndex === i;

            return (
              <div
                key={i}
                onClick={() => setEditingIndex(i)}
                className={`absolute text-black flex items-center justify-center text-center p-1 z-10 overflow-hidden 
                            uppercase tracking-wider ${selectedFont} 
                            ${isEditing ? 'cursor-text ring-2 ring-blue-500 bg-white/90 z-50' : 'cursor-pointer hover:bg-white/10'}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  containerType: 'size',
                  fontSize: 'clamp(9px, 12cqmin, 16px)',
                  lineHeight: '1.0',
                  overflowWrap: 'anywhere',
                  textWrap: 'balance',
                  textShadow: isEditing ? 'none' : '0px 0px 3px white, 0px 0px 3px white',
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
                    className="w-full h-full bg-transparent border-none outline-none resize-none text-center"
                    style={{ fontSize: 'inherit', fontFamily: 'inherit', lineHeight: 'inherit' }}
                  />
                ) : (
                   <span className="w-full">{bubble.translated}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}