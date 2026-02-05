from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
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
import time
import os
from pdf2image import convert_from_bytes
from dotenv import load_dotenv
from supabase import create_client, Client

# --- CONFIGURATION ---
load_dotenv() 
GEMINI_API_KEY = os.getenv("GEMINI_KEY")
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(url, key)

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

print("⏳ Loading Models...")
mocr = MangaOcr()
yolo_url = 'https://huggingface.co/ogkalu/comic-speech-bubble-detector-yolov8m/resolve/main/comic-speech-bubble-detector.pt'
detector = YOLO(yolo_url)
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')
print("✅ ALL SYSTEMS ONLINE")

# --- CORE LOGIC FUNCTIONS ---

def cleanup_text(image_cv, boxes):
    """ The Hungry Eraser Logic """
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
            touches_edge = (stats[i, cv2.CC_STAT_LEFT] <= 2) or (stats[i, cv2.CC_STAT_TOP] <= 2)
            if area > 3 and area < 5000 and area < (roi_area * 0.4) and not touches_edge:
                letter_mask[labels == i] = 255

        dilated_mask = cv2.dilate(letter_mask, np.ones((3,3), np.uint8), iterations=4)
        cleaned[y1:y2, x1:x2] = cv2.inpaint(roi, dilated_mask, 5, cv2.INPAINT_TELEA)
    return cleaned

def translate_batch_with_gemini(text_list, target_language):
    if not text_list: return []

    prompt = f"""
    You are a professional Manga Translator. Translate to {target_language}.
    Context: Shonen manga, casual/slang. "Fairy Tail" (妖精の尻尾) is a proper noun.
    Return ONLY a JSON array of strings.
    Input: {json.dumps(text_list, ensure_ascii=False)}
    """
    
    # Retry Logic (Try 3 times before giving up)
    for attempt in range(3):
        try:
            response = model.generate_content(prompt)
            
            # Check if blocked by safety filters
            if not response.parts:
                print(f"⚠️ Safety Block on attempt {attempt+1}")
                return ["Safety Error"] * len(text_list)
                
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
            
        except Exception as e:
            error_msg = str(e)
            print(f"⚠️ Gemini Error (Attempt {attempt+1}/3): {error_msg}")
            
            # If Rate Limit (429), wait and retry
            if "429" in error_msg or "ResourceExhausted" in error_msg:
                print("⏳ Hit Rate Limit. Cooling down for 5 seconds...")
                time.sleep(5)
            else:
                # If it's another error (like JSON parse), waiting won't help, but we try once more anyway
                time.sleep(1)

    print("❌ Failed all attempts.")
    return ["Translation Error"] * len(text_list)


def process_single_image(pil_image, target_language):
    """
    Reusable function that takes a PIL image and returns the translated data + cleaned Base64
    """
    # Convert PIL to CV2
    original_cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    
    # 1. Detect
    results = detector.predict(pil_image, conf=0.2, verbose=False)
    
    # 2. Extract Text
    bubbles_data = []
    texts_to_translate = []
    
    raw_detections = []
    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            raw_detections.append((x1, y1, x2, y2))
            
    # Sort Top->Bottom, Right->Left
    raw_detections.sort(key=lambda b: (b[1] // 100, -b[0]))

    for box in raw_detections:
        x1, y1, x2, y2 = box
        crop = pil_image.crop((x1, y1, x2, y2))
        japanese_text = mocr(crop)
        if not japanese_text.strip(): japanese_text = "..."
        texts_to_translate.append(japanese_text)
        bubbles_data.append({"box": [x1, y1, x2, y2], "japanese": japanese_text})

    # 3. Translate
    translated_texts = translate_batch_with_gemini(texts_to_translate, target_language)
    
    # 4. Merge
    final_bubbles = []
    for i, data in enumerate(bubbles_data):
        trans = translated_texts[i] if i < len(translated_texts) else "..."
        final_bubbles.append({
            "box": data["box"], "japanese": data["japanese"], "translated": trans
        })

    # 5. Clean
    box_coords = [b["box"] for b in final_bubbles]
    cleaned_cv_image = cleanup_text(original_cv_image, box_coords)
    _, buffer = cv2.imencode('.jpg', cleaned_cv_image)
    cleaned_base64 = base64.b64encode(buffer).decode('utf-8')
    
    return {
        "bubbles": final_bubbles,
        "cleaned_image": f"data:image/jpeg;base64,{cleaned_base64}",
        "original_size": {"width": pil_image.width, "height": pil_image.height}
    }

def save_page_to_supabase(project_id, page_number, image_cv, bubbles_json, width, height):
    """
    1. Uploads cleaned image to Supabase Storage
    2. Saves the page metadata and bubbles to the Database
    """
    # 1. Convert OpenCV image to bytes
    _, buffer = cv2.imencode('.jpg', image_cv)
    image_bytes = buffer.tobytes()

    # 2. Upload to Storage
    file_path = f"{project_id}/page_{page_number}.jpg"
    
    # We use 'upsert' so we can overwrite if we re-process
    storage_response = supabase.storage.from_("manga-images").upload(
        path=file_path,
        file=image_bytes,
        file_options={"content-type": "image/jpeg"}
    )

    # 3. Get the Public URL
    image_url = supabase.storage.from_("manga-images").get_public_url(file_path)

    # 4. Insert into 'pages' table
    page_data = {
        "project_id": project_id,
        "page_number": page_number,
        "image_url": image_url,
        "bubbles_json": bubbles_json,
        "width": width,
        "height": height
    }
    
    db_response = supabase.table("pages").insert(page_data).execute()
    return db_response.data

# --- ENDPOINTS ---

@app.post("/process-page")
async def process_page_pipeline(file: UploadFile = File(...), target_language: str = Form("English")):
    content = await file.read()
    
    # 1. Create a Project in the Database
    # Since we don't have Auth yet, user_id is null
    project_db = supabase.table("projects").insert({"title": file.filename}).execute()
    project_id = project_db.data[0]['id']
    print(f"📁 Created Project: {project_id}")

    # 2. Split PDF or use Image
    if file.filename.endswith(".pdf"):
        pages_images = convert_from_bytes(content)
    else:
        pages_images = [Image.open(io.BytesIO(content)).convert("RGB")]

    results = []

    # 3. The Processing Loop
    for i, page_image in enumerate(pages_images):
        print(f"   Processing Page {i+1}...")
        
        # A. Run your existing processing logic (OCR, Translation, Inpaint)
        # Note: I'm assuming your process_single_image returns a dict with 'bubbles' and 'cleaned_image_cv'
        # Let's adjust process_single_image slightly to return the CV image directly
        
        page_data = process_single_image(page_image, target_language)
        
        # We need the CV image for the cleanup, let's extract it from the data
        # (You might need to tweak process_single_image to return the raw CV image)
        cleaned_cv = cv2.cvtColor(np.array(page_image), cv2.COLOR_RGB2BGR)
        cleaned_cv = cleanup_text(cleaned_cv, [b['box'] for b in page_data['bubbles']])

        # B. SAVE TO CLOUD
        save_page_to_supabase(
            project_id=project_id,
            page_number=i + 1,
            image_cv=cleaned_cv,
            bubbles_json=page_data['bubbles'],
            width=page_image.width,
            height=page_image.height
        )
        
        # For now, we still return the data to the frontend so it works immediately
        results.append(page_data)

    return {"project_id": project_id, "pages": results}