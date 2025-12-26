from fastapi import FastAPI
from pydantic import BaseModel
import torch
from transformers import pipeline

# 1. Initialize the App
app = FastAPI()

# 2. Load the Model ONCE (Global State)
# We do this here so we don't reload the 1GB model every time a user sends a request.
print("⏳ Booting up... Loading model...")
device = "mps" if torch.backends.mps.is_available() else "cpu"
translator = pipeline("translation_en_to_es", model="Helsinki-NLP/opus-mt-en-es", device=device)
print(f"✅ Model loaded on {device.upper()}")

# 3. Define the Data Structure
# Pydantic models ensure that if someone sends garbage data, the server rejects it automatically.
class TranslationRequest(BaseModel):
    text: str

# 4. The Endpoint (The "Door")
@app.post("/translate")
async def translate_text(request: TranslationRequest):
    # This function waits for a request, processes it, and returns JSON.
    
    # Run the model
    # We use [0]['translation_text'] to extract just the string we want.
    result = translator(request.text)
    translated_text = result[0]['translation_text']
    
    return {"original": request.text, "translated": translated_text}

# 5. A Health Check
@app.get("/")
def home():
    return {"status": "online", "message": "Manga Translator Engine is Running"}