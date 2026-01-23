'use client';

import { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, ScanEye, Loader2, Download, Save } from 'lucide-react';
import html2canvas from 'html2canvas';

interface Bubble {
  box: [number, number, number, number]; 
  japanese: string;
  translated: string;
}

export default function Home() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(false);
  const [imgDimensions, setImgDimensions] = useState<{width: number, height: number} | null>(null);
  const [selectedFont, setSelectedFont] = useState('font-anime');
  
  // NEW: Track which bubble is being edited (null = none)
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); // Ref for the image container (to download)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setBubbles([]); 
    setImgDimensions(null); 
    setEditingIndex(null);
    processImage(file);
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setImgDimensions({ width: naturalWidth, height: naturalHeight });
  };

  const processImage = async (file: File) => {
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://127.0.0.1:8000/process-page', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      setBubbles(response.data.bubbles);
      if (response.data.cleaned_image) {
        setImageSrc(response.data.cleaned_image);
      }
    } catch (error) {
      console.error("Error connecting to backend:", error);
      alert("Backend error! Is the Python server running?");
    } finally {
      setLoading(false);
    }
  };

  // --- NEW: EDITING LOGIC ---
  const handleTextChange = (index: number, newText: string) => {
    const updatedBubbles = [...bubbles];
    updatedBubbles[index].translated = newText;
    setBubbles(updatedBubbles);
  };

  // --- NEW: DOWNLOAD LOGIC ---
  const handleDownload = async () => {
    if (!containerRef.current) return;
    
    // 1. Temporarily hide borders/shadows if needed, but here we want to capture exactly what we see.
    // html2canvas takes a snapshot of the DOM element
    const canvas = await html2canvas(containerRef.current, {
      useCORS: true, // Needed if images are blobs/external
      scale: 2, // 2x scale for better resolution (Retina quality)
      backgroundColor: null, // Transparent background if possible
    });

    // 2. Convert to blob/url
    const image = canvas.toDataURL("image/jpeg", 0.9);
    
    // 3. Trigger download
    const link = document.createElement("a");
    link.href = image;
    link.download = "translated_manga.jpg";
    link.click();
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8 flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-8 text-blue-400 flex items-center gap-3">
        <ScanEye /> Manga Translator
      </h1>

      {/* Controls: Fonts & Download */}
      <div className="flex flex-wrap gap-4 mb-6 justify-center w-full max-w-4xl">
        {/* Font Panel */}
        <div className="bg-gray-900 p-3 rounded-lg border border-gray-800 flex items-center gap-4">
          <label className="text-xs text-gray-400 uppercase tracking-wider font-bold">Typography</label>
          <div className="flex gap-2">
            <button onClick={() => setSelectedFont('font-anime')} className={`px-3 py-1 rounded text-xs transition ${selectedFont === 'font-anime' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>Anime Ace</button>
            <button onClick={() => setSelectedFont('font-action')} className={`px-3 py-1 rounded text-xs transition ${selectedFont === 'font-action' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>Action Man</button>
            <button onClick={() => setSelectedFont('font-smack')} className={`px-3 py-1 rounded text-xs transition ${selectedFont === 'font-smack' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>Smack</button>
          </div>
        </div>

        {/* Action Panel */}
        <div className="bg-gray-900 p-3 rounded-lg border border-gray-800 flex items-center gap-2">
          <label className="text-xs text-gray-400 uppercase tracking-wider font-bold">Actions</label>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm transition"
          >
            <Upload size={16}/> New Page
          </button>
          
          {imageSrc && (
            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm transition font-bold"
            >
              <Download size={16}/> Save Image
            </button>
          )}
        </div>
      </div>

      <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={handleFileChange} />

      {loading && (
        <div className="flex items-center gap-2 text-blue-400 mb-8 animate-pulse">
          <Loader2 className="animate-spin" />
          <span>Processing Page...</span>
        </div>
      )}

      {/* --- THE CANVAS AREA --- */}
      {imageSrc && (
        <div 
          ref={containerRef} // This ref allows html2canvas to "see" this div
          className="relative w-full max-w-4xl border border-gray-800 shadow-2xl bg-white" // bg-white ensures no transparency in JPG
        >
          <img 
            src={imageSrc} 
            alt="Uploaded Manga" 
            className="w-full h-auto block"
            onLoad={onImageLoad}
          />

          {imgDimensions && bubbles.map((bubble, i) => {
            const [x1, y1, x2, y2] = bubble.box;
            const left = (x1 / imgDimensions.width) * 100;
            const top = (y1 / imgDimensions.height) * 100;
            const width = ((x2 - x1) / imgDimensions.width) * 100;
            const height = ((y2 - y1) / imgDimensions.height) * 100;

            const isEditing = editingIndex === i;

            return (
              <div
                key={i}
                // Toggle edit mode on click
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
                  fontSize: 'clamp(9px, 10cqmin, 16px)',
                  lineHeight: '1.0',
                  textShadow: isEditing ? 'none' : '0px 0px 3px white, 0px 0px 3px white',
                }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={bubble.translated}
                    onChange={(e) => handleTextChange(i, e.target.value)}
                    onBlur={() => setEditingIndex(null)}
                    onKeyDown={(e) => {
                      if(e.key === 'Enter' && !e.shiftKey) {
                         e.preventDefault(); // Stop newline
                         setEditingIndex(null); // Save on Enter
                      }
                    }}
                    className="w-full h-full bg-transparent border-none outline-none resize-none text-center overflow-hidden"
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