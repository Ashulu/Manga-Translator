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
import cv2
import base64

# helper for cleaning up the old text and replacing with new text
def cleanup_text(image_cv, boxes):
    cleaned = image_cv.copy()
    
    for box in boxes:
        x1, y1, x2, y2 = box
        
        # Safety checks
        h, w = cleaned.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        
        roi = cleaned[y1:y2, x1:x2]
        if roi.size == 0: continue
        
        # 1. Grayscale & Blur
        # Blurring helps connect broken text strokes so they are detected as one blob
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (3,3), 0)
        
        # 2. Thresholding
        _, mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        # 3. Filter Components
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
        
        letter_mask = np.zeros_like(mask)
        roi_h, roi_w = roi.shape[:2]
        roi_area = roi_h * roi_w
        
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            w_blob = stats[i, cv2.CC_STAT_WIDTH]
            h_blob = stats[i, cv2.CC_STAT_HEIGHT]
            x_blob = stats[i, cv2.CC_STAT_LEFT]
            y_blob = stats[i, cv2.CC_STAT_TOP]
            
            # A. Edge Safety: If it touches the box edge, it's likely the bubble border.
            # We relax this slightly (2px margin) to be safe.
            touches_edge = (x_blob <= 2) or (y_blob <= 2) or \
                           (x_blob + w_blob >= roi_w - 2) or \
                           (y_blob + h_blob >= roi_h - 2)
            
            # B. Size Filtering (Aggressive)
            # Min: 3 (catch tiny dots/punctuation)
            # Max: 5000 or 40% of the bubble (catch big dense Kanji)
            if area > 3 and area < 5000 and area < (roi_area * 0.4) and not touches_edge:
                letter_mask[labels == i] = 255

        # 4. Aggressive Dilation (The "Ghost buster")
        # Increase iterations to 4 to eat the gray edges around the text
        kernel = np.ones((3,3), np.uint8)
        dilated_mask = cv2.dilate(letter_mask, kernel, iterations=4)
        
        # 5. Inpaint
        # Radius 5 looks further for clean "white paper" pixels
        roi_inpainted = cv2.inpaint(roi, dilated_mask, 5, cv2.INPAINT_TELEA)
        
        cleaned[y1:y2, x1:x2] = roi_inpainted

    return cleaned

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Allow the frontend
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (POST, GET, etc.)
    allow_headers=["*"], # Allow all headers
)

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
    # 1. Read Image
    content = await file.read()
    # Convert to OpenCV format (numpy) for processing
    nparr = np.frombuffer(content, np.uint8)
    original_cv_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Also keep a PIL version for YOLO/MangaOCR
    pil_image = Image.open(io.BytesIO(content)).convert("RGB")
    
    # 2. Run Detection
    results = detector.predict(pil_image, conf=0.2, verbose=False)
    
    detected_bubbles = []
    box_coordinates = [] # We need a simple list of boxes for the cleaner
    
    # 3. Process Results
    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            box_coordinates.append([x1, y1, x2, y2])
            
            # Crop & OCR logic (same as before)
            crop = pil_image.crop((x1, y1, x2, y2))
            japanese_text = mocr(crop)
            
            english_text = ""
            if japanese_text.strip():
                try:
                    trans_result = translator(japanese_text)
                    english_text = trans_result[0]['translation_text']
                except:
                    english_text = "..."

            detected_bubbles.append({
                "box": [x1, y1, x2, y2],
                "japanese": japanese_text,
                "translated": english_text
            })
    
    # 4. Run the "Eraser" (In-painting)
    cleaned_cv_image = cleanup_text(original_cv_image, box_coordinates)
    
    # 5. Convert Cleaned Image to Base64 (to send to frontend)
    _, buffer = cv2.imencode('.jpg', cleaned_cv_image)
    cleaned_base64 = base64.b64encode(buffer).decode('utf-8')
            
    return {
        "bubbles": detected_bubbles,
        "cleaned_image": f"data:image/jpeg;base64,{cleaned_base64}"
    }