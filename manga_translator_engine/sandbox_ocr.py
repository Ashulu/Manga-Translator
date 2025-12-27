import torch
from manga_ocr import MangaOcr
from PIL import Image
import requests
from io import BytesIO

# 1. Setup Device
# MangaOCR builds on top of PyTorch, so we use the same MPS trick.
device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"🚀 Using device: {device.upper()}")

# 2. Load the Vision Model
# This will download the weights (approx 400MB) from HuggingFace the first time.
print("⏳ Loading MangaOCR... (Downloading weights...)")
mocr = MangaOcr()

# 3. Get a Sample Image
# I'm downloading a specific example of vertical Japanese text for you.
url = "https://github.com/kha-white/manga-ocr/raw/master/assets/examples/00.jpg"
response = requests.get(url)
image = Image.open(BytesIO(response.content))

# 4. The Magic (Vision to Text)
text = mocr(image)

print("-" * 30)
print(f"Detected Text: {text}")
print("-" * 30)