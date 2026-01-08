from ultralytics import YOLO
import cv2
import requests
import numpy as np
import os

# 1. CLEANUP: Delete the broken file from previous failed run
# If we don't do this, it will keep trying to load the corrupt 'Error 404' file.
broken_filename = "comic_speech_bubble_detector_yolov8m.pt" 
if os.path.exists(broken_filename):
    os.remove(broken_filename)

# 2. Load the Model (With the CORRECT URL)
print("⏳ Loading YOLOv8 Detector...")
# The file inside the repo is named 'comic-speech-bubble-detector.pt' (hyphens, no yolov8m suffix in filename)
model_url = 'https://huggingface.co/ogkalu/comic-speech-bubble-detector-yolov8m/resolve/main/comic-speech-bubble-detector.pt'
model = YOLO(model_url) 

# 3. Get the Image (Local or URL)
image_path = "fairy_tail_100yr_test_ch1_pg9_raw.png" # <--- Your local file

if os.path.exists(image_path):
    print(f"📂 Loading local image: {image_path}")
    original_image = cv2.imread(image_path)
else:
    print(f"globe Loading image from URL: {image_path}")
    response = requests.get(image_path)
    image_array = np.asarray(bytearray(response.content), dtype="uint8")
    original_image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

# 4. Run Detection
# conf=0.2 means "only show me things you are 20% sure are bubbles"
print("🔍 Scanning image for bubbles...")
results = model.predict(original_image, conf=0.2)

# 5. Visualize the Result
for result in results:
    for box in result.boxes:
        # Get coordinates
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        confidence = box.conf[0]
        label = model.names[int(box.cls[0])]
        
        # Draw Red Box
        cv2.rectangle(original_image, (x1, y1), (x2, y2), (0, 0, 255), 2)
        # Write Label
        cv2.putText(original_image, f"{label} {confidence:.2f}", (x1, y1 - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

# 6. Save the Output
output_filename = "detected_bubbles.jpg"
cv2.imwrite(output_filename, original_image)
print(f"✅ Detection complete! Check {output_filename} to see the boxes.")