'use client';

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Upload, ScanEye, Loader2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPages([]);
    setCurrentPageIndex(0);
    setEditingIndex(null);
    processFile(file);
  };

  const processFile = async (file: File) => {
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target_language', targetLang);

    try {
      // Note: This might take a while for PDFs!
      const response = await axios.post('http://127.0.0.1:8000/process-page', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      // The backend now always returns { pages: [...] }
      setPages(response.data.pages);
      
    } catch (error) {
      console.error("Backend error:", error);
      alert("Error! If uploading a PDF, it might be taking too long.");
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

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8 flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-6 text-blue-400 flex items-center gap-3">
        <ScanEye /> Manga Translator
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
        <div className="fixed inset-0 z- flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowHistory(false)} />
          
          {/* Panel */}
          <div className="relative w-80 h-full bg-gray-950 border-l border-gray-800 p-6 overflow-y-auto">
            <h2 className="text-xl font-bold mb-6">Translation History</h2>
            <div className="flex flex-col gap-4">
              {history.map((project) => (
                <div 
                  key={project.id}
                  onClick={() => loadProject(project.id)}
                  className="p-4 bg-gray-900 border border-gray-800 rounded-lg cursor-pointer hover:border-blue-500 transition"
                >
                  <p className="font-bold text-sm truncate">{project.title}</p>
                  <p className="text-[10px] text-gray-500">
                    {new Date(project.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
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