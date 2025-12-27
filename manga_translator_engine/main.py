from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
import torch
from transformers import pipeline
from manga_ocr import MangaOcr
from PIL import Image
import io

app = FastAPI()

# --- LOAD MODELS (Global State) ---
device = "mps" if torch.backends.mps.is_available() else "cpu"

print("⏳ Loading Translation Model...")
translator = pipeline("translation_en_to_es", model="Helsinki-NLP/opus-mt-en-es", device=device)

print("⏳ Loading OCR Model...")
# force_cpu=False ensures it uses MPS if available
mocr = MangaOcr()

print(f"✅ All Systems Online on {device.upper()}")

# --- DATA MODELS ---
class TranslationRequest(BaseModel):
    text: str

# --- ENDPOINTS ---

@app.get("/")
def home():
    return {"status": "online", "gpu": device}

@app.post("/translate")
async def translate_text(request: TranslationRequest):
    result = translator(request.text)
    return {"original": request.text, "translated": result[0]['translation_text']}

@app.post("/ocr")
async def ocr_image(file: UploadFile = File(...)):
    # 1. Read the raw bytes from the uploaded file
    image_data = await file.read()
    
    # 2. Convert bytes to a PIL Image
    image = Image.open(io.BytesIO(image_data))
    
    # 3. Run OCR
    text = mocr(image)
    
    return {"extracted_text": text}