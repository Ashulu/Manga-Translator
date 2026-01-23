'use client';

import { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, ScanEye, Loader2 } from 'lucide-react';

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
  const [selectedFont, setSelectedFont] = useState('anime');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setBubbles([]); 
    setImgDimensions(null); 
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
      
      // Crucial: Use the cleaned image from backend if available
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

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8 flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-8 text-blue-400 flex items-center gap-3">
        <ScanEye /> Manga Translator
      </h1>

      {/* Font Control Panel */}
      <div className="flex gap-4 mb-6 bg-gray-900 p-4 rounded-lg border border-gray-800">
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-400 uppercase tracking-wider font-bold">Typography</label>
          <div className="flex gap-2">
            <button 
              onClick={() => setSelectedFont('anime')}
              className={`px-4 py-2 rounded text-sm transition ${selectedFont === 'anime' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              Anime Ace
            </button>
            <button 
              onClick={() => setSelectedFont('action')}
              className={`px-4 py-2 rounded text-sm transition ${selectedFont === 'action' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              Action Man
            </button>
            <button 
              onClick={() => setSelectedFont('smack')}
              className={`px-4 py-2 rounded text-sm transition ${selectedFont === 'smack' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              Smack Attack
            </button>
          </div>
        </div>
      </div>

      <div 
        onClick={() => fileInputRef.current?.click()}
        className="w-full max-w-xl p-8 border-2 border-dashed border-gray-700 rounded-xl 
                   hover:border-blue-500 hover:bg-gray-900 cursor-pointer transition
                   flex flex-col items-center justify-center gap-4 mb-8"
      >
        <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={handleFileChange} />
        <Upload className="w-10 h-10 text-gray-500" />
        <p className="text-gray-400">Click to upload a Manga Page</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-blue-400 mb-4">
          <Loader2 className="animate-spin" />
          <span>Scanning, reading, and translating...</span>
        </div>
      )}

      {imageSrc && (
        <div className="relative w-full max-w-4xl border border-gray-800 rounded-lg shadow-2xl">
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

            return (
              <div
                key={i}
                className={`absolute text-black flex items-center justify-center text-center p-1 z-10 overflow-hidden pointer-events-none uppercase tracking-wider ${
                  selectedFont === 'anime' ? 'font-anime' : 
                  selectedFont === 'action' ? 'font-action' : 
                  'font-smack'
                }`}                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  fontSize: 'clamp(9px, 2cqw, 14px)',
                  lineHeight: '1.1',
                  overflowWrap: 'anywhere',
                  textWrap: 'balance',
                  // White halo around text to make it readable over artifacts
                  textShadow: '0px 0px 3px white, 0px 0px 3px white, 0px 0px 3px white' 
                }}
              >
                {bubble.translated}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}