from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from transformers import pipeline
from manga_ocr import MangaOcr
from ultralytics import YOLO
from PIL import Image
import io
import numpy as np

app = FastAPI()

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:3000"], # Allow the frontend
#     allow_credentials=True,
#     allow_methods=["*"], # Allow all methods (POST, GET, etc.)
#     allow_headers=["*"], # Allow all headers
# )

# --- 1. SETUP & MODEL LOADING ---
# We load these once at startup so requests are fast.

device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"🚀 Acceleration Status: {device.upper()}")

# A. Translation (English to Spanish for now)
print("⏳ Loading Translator...")
translator = pipeline("translation", model="Helsinki-NLP/opus-mt-ja-en", device=device)

# B. OCR (Japanese Text Reader)
print("⏳ Loading MangaOCR...")
mocr = MangaOcr() 

# C. Detection (Bubble Finder)
print("⏳ Loading YOLO Detector...")
# We use the specific URL that works
yolo_url = 'https://huggingface.co/ogkalu/comic-speech-bubble-detector-yolov8m/resolve/main/comic-speech-bubble-detector.pt'
detector = YOLO(yolo_url)

print("✅ ALL SYSTEMS ONLINE")

# --- 2. DATA MODELS ---

class TranslationRequest(BaseModel):
    text: str

# --- 3. ENDPOINTS ---

@app.get("/")
def home():
    return {"status": "online", "gpu": device}

@app.post("/translate")
async def translate_text(request: TranslationRequest):
    """Text-only translation helper"""
    result = translator(request.text)
    return {"original": request.text, "translated": result[0]['translation_text']}

@app.post("/ocr")
async def ocr_image(file: UploadFile = File(...)):
    """Raw OCR helper (no detection)"""
    content = await file.read()
    image = Image.open(io.BytesIO(content)).convert("RGB")
    text = mocr(image)
    return {"extracted_text": text}

@app.post("/process-page")
async def process_page_pipeline(file: UploadFile = File(...)):
    """
    The Master Endpoint:
    1. Detects bubbles
    2. Crops them
    3. Reads Japanese (OCR)
    4. Translates to Spanish
    """
    # 1. Read Image
    content = await file.read()
    pil_image = Image.open(io.BytesIO(content)).convert("RGB")
    
    # 2. Run Detection (Find coordinates)
    # conf=0.2 filters out low-confidence detections
    results = detector.predict(pil_image, conf=0.2, verbose=False)
    
    detected_bubbles = []
    
    # 3. Process Results
    for result in results:
        for box in result.boxes:
            # Get integer coordinates
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            
            # 4. Crop the Bubble
            crop = pil_image.crop((x1, y1, x2, y2))
            
            # 5. Run OCR on the Crop
            japanese_text = mocr(crop)
            
            # 6. Translate (if text exists)
            english_text = ""
            if japanese_text.strip():
                try:
                    trans_result = translator(japanese_text)
                    english_text = trans_result[0]['translation_text']
                except Exception as e:
                    english_text = "Error translating"

            # 7. Append to list
            detected_bubbles.append({
                "box": [x1, y1, x2, y2],
                "japanese": japanese_text,
                "translated": english_text
            })
            
    return {"bubbles": detected_bubbles}