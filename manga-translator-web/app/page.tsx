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
                // FIX IS HERE: No 'bg-white'. Added 'pointer-events-none' so clicks pass through.
                className="absolute text-black flex items-center justify-center text-center p-1 z-10 overflow-hidden pointer-events-none"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  fontSize: 'clamp(8px, 1.2vw, 16px)',
                  lineHeight: '1.1',
                  fontWeight: 'bold',
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