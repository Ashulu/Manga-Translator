from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from manga_ocr import MangaOcr
from ultralytics import YOLO
from PIL import Image
import io
import numpy as np
import cv2
import base64
import google.generativeai as genai
import json
import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
# PASTE YOUR API KEY HERE
GEMINI_API_KEY = os.getenv("GEMINI_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LOAD MODELS ---
device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"🚀 Acceleration Status: {device.upper()}")

# 1. OCR (Eyes)
print("⏳ Loading MangaOCR...")
mocr = MangaOcr()

# 2. Detector (Layout)
print("⏳ Loading YOLO Detector...")
yolo_url = 'https://huggingface.co/ogkalu/comic-speech-bubble-detector-yolov8m/resolve/main/comic-speech-bubble-detector.pt'
detector = YOLO(yolo_url)

# 3. Translator (Brain - Gemini)
print("⏳ Configuring Gemini...")
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

print("✅ ALL SYSTEMS ONLINE")

# --- HELPER FUNCTIONS ---

def cleanup_text(image_cv, boxes):
    """
    Hungry Eraser Logic (Preserved from previous step)
    """
    cleaned = image_cv.copy()
    for box in boxes:
        x1, y1, x2, y2 = box
        h, w = cleaned.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        roi = cleaned[y1:y2, x1:x2]
        if roi.size == 0: continue

        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (3,3), 0)
        _, mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
        letter_mask = np.zeros_like(mask)
        roi_area = roi.shape[0] * roi.shape[1]
        
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            w_blob = stats[i, cv2.CC_STAT_WIDTH]
            h_blob = stats[i, cv2.CC_STAT_HEIGHT]
            x_blob = stats[i, cv2.CC_STAT_LEFT]
            y_blob = stats[i, cv2.CC_STAT_TOP]
            
            touches_edge = (x_blob <= 2) or (y_blob <= 2) or \
                           (x_blob + w_blob >= roi.shape[1] - 2) or \
                           (y_blob + h_blob >= roi.shape[0] - 2)
            
            if area > 3 and area < 5000 and area < (roi_area * 0.4) and not touches_edge:
                letter_mask[labels == i] = 255

        kernel = np.ones((3,3), np.uint8)
        dilated_mask = cv2.dilate(letter_mask, kernel, iterations=4)
        roi_inpainted = cv2.inpaint(roi, dilated_mask, 5, cv2.INPAINT_TELEA)
        cleaned[y1:y2, x1:x2] = roi_inpainted

    return cleaned

def translate_batch_with_gemini(text_list, target_language):
    """
    Sends a list of Japanese strings to Gemini and expects a JSON list of English translations.
    """
    if not text_list:
        return []

    # The Prompt Engineering
    prompt = f"""
    You are a professional Manga Translator. 
    Translate the following list of Japanese text from a manga page into {target_language}.
    
    Context:
    - This is from a Shonen manga (casual, slang, sometimes aggressive).
    - Handle sarcasm and rhetorical questions correctly (e.g., "Ore no sei ka yo" -> "Not my fault!").
    - "Fairy Tail" (妖精の尻尾) is a proper noun (Guild Name).
    - Return ONLY a JSON array of strings. No markdown, no explanations.

    Input: {json.dumps(text_list, ensure_ascii=False)}
    """

    try:
        response = model.generate_content(prompt)
        # Clean up response (sometimes Gemini wraps JSON in ```json ... ```)
        raw_text = response.text.replace("```json", "").replace("```", "").strip()
        translated_list = json.loads(raw_text)
        
        # Safety check: Ensure output list length matches input
        if len(translated_list) != len(text_list):
            print("⚠️ Warning: Gemini returned different number of translations.")
            return ["Error"] * len(text_list)
            
        return translated_list
    except Exception as e:
        print(f"❌ Gemini Error: {e}")
        # Fallback if API fails
        return ["Translation Error"] * len(text_list)


# --- ENDPOINTS ---

@app.post("/process-page")
async def process_page_pipeline(file: UploadFile = File(...),
                                target_language: str = Form("English")):
    # 1. Read Image
    content = await file.read()
    nparr = np.frombuffer(content, np.uint8)
    original_cv_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    pil_image = Image.open(io.BytesIO(content)).convert("RGB")
    
    # 2. Run Detection
    results = detector.predict(pil_image, conf=0.2, verbose=False)
    
    # 3. Extract OCR Text (But don't translate yet)
    bubbles_data = []
    texts_to_translate = []
    
    # We sort bubbles top-to-bottom, right-to-left (Manga reading order)
    # This helps Gemini understand the conversation flow.
    raw_detections = []
    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            raw_detections.append((x1, y1, x2, y2))
    
    # Sort logic: primarily by Y (rows), secondarily by X (reverse for right-to-left)
    # This is a rough approximation of manga reading order
    raw_detections.sort(key=lambda b: (b[1] // 100, -b[0])) 

    for box in raw_detections:
        x1, y1, x2, y2 = box
        
        # Crop & OCR
        crop = pil_image.crop((x1, y1, x2, y2))
        japanese_text = mocr(crop)
        
        if not japanese_text.strip():
            japanese_text = "..."
            
        texts_to_translate.append(japanese_text)
        bubbles_data.append({
            "box": [x1, y1, x2, y2],
            "japanese": japanese_text
        })
    
    # 4. Batch Translate with Gemini
    print(f"🧠 Sending {len(texts_to_translate)} bubbles to Gemini...")
    translated_texts = translate_batch_with_gemini(texts_to_translate, target_language)
    
    # 5. Merge Data
    final_bubbles = []
    for i, data in enumerate(bubbles_data):
        final_bubbles.append({
            "box": data["box"],
            "japanese": data["japanese"],
            "translated": translated_texts[i]
        })
    
    # 6. Cleanup Image
    box_coords = [b["box"] for b in final_bubbles]
    cleaned_cv_image = cleanup_text(original_cv_image, box_coords)
    _, buffer = cv2.imencode('.jpg', cleaned_cv_image)
    cleaned_base64 = base64.b64encode(buffer).decode('utf-8')

    return {
        "bubbles": final_bubbles,
        "cleaned_image": f"data:image/jpeg;base64,{cleaned_base64}"
    }