'use client';

import { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, ScanEye, Loader2 } from 'lucide-react';

// Define the shape of the data coming from Python
interface Bubble {
  box: [number, number, number, number]; // [x1, y1, x2, y2]
  japanese: string;
  translated: string;
}

export default function Home() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setBubbles([]); // Clear old boxes

    // Start processing automatically
    processImage(file);
  };

  // 2. Send to Python Backend
  const processImage = async (file: File) => {
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://127.0.0.1:8000/process-page', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBubbles(response.data.bubbles);
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

      {/* Upload Zone */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="w-full max-w-xl p-8 border-2 border-dashed border-gray-700 rounded-xl 
                   hover:border-blue-500 hover:bg-gray-900 cursor-pointer transition
                   flex flex-col items-center justify-center gap-4 mb-8"
      >
        <input 
          type="file" 
          hidden 
          ref={fileInputRef} 
          accept="image/*"
          onChange={handleFileChange} 
        />
        <Upload className="w-10 h-10 text-gray-500" />
        <p className="text-gray-400">Click to upload a Manga Page</p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center gap-2 text-blue-400 mb-4">
          <Loader2 className="animate-spin" />
          <span>Scanning, reading, and translating...</span>
        </div>
      )}

      {/* Result Display */}
      {imageSrc && (
        <div className="relative w-full max-w-4xl border border-gray-800 rounded-lg overflow-hidden shadow-2xl">
          {/* The Original Image */}
          <img src={imageSrc} alt="Uploaded Manga" className="w-full h-auto block" />

          {/* The Overlays (Translated Text) */}
          {bubbles.map((bubble, i) => {
            const [x1, y1, x2, y2] = bubble.box;
            
            // Calculate relative positions (CSS %) so it scales with the image
            // We need the natural image size, but for a quick hack, we use absolute if image is loaded natural size
            // To make this responsive perfectly, we usually need more CSS tricks.
            // For now, let's try a direct absolute mapping assuming the container fits the image.
            
            return (
              <div
                key={i}
                className="absolute bg-white text-black flex items-center justify-center text-center p-1 rounded z-10 opacity-90 hover:opacity-100 hover:z-20 transition"
                style={{
                  // Note: This coordinate system mapping relies on the image being displayed 
                  // at 'natural' resolution or we need JS to calculate scaling.
                  // For this step, we will use a simplified visual overlay.
                  // See note below on Scaling.
                  left: `${x1}px`,
                  top: `${y1}px`,
                  width: `${x2 - x1}px`,
                  height: `${y2 - y1}px`,
                  fontSize: '12px',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
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