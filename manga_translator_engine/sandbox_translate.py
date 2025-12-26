import torch
from transformers import pipeline

# - setup the Device
# this checks if Mac GPU (Metal Performance Shaders) is available.
# if yes, we use 'mps'. If no, we fall back to 'cpu'.
device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"🚀 Using device: {device.upper()}")

# - load a lightweight Translation Model
# we are using a small Google model (T5) just to test the pipes. 
# we will upgrade to NLLB later.
print("⏳ Loading model... (this might take a minute the first time)")
translator = pipeline("translation_en_to_es", model="Helsinki-NLP/opus-mt-en-es", device=device)

# - input text
text = "This is the start of my manga translation project."

# - the model takes the text, converts it to numbers, processes it, and returns text.
result = translator(text)

print("-" * 30)
print(f"Input: {text}")
print(f"Output: {result[0]['translation_text']}")
print("-" * 30)