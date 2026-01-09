import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_KEY")

try:
    genai.configure(api_key=API_KEY)
    print(f"✅ Authenticated successfully with key ending in ...{API_KEY[-4:]}")

    print("\n🔍 Fetching available models...")
    
    found_flash = False
    
    for m in genai.list_models():
        # We only care about models that can generate text (generateContent)
        if 'generateContent' in m.supported_generation_methods:
            print(f"   • {m.name}")
            if "gemini-1.5-flash" in m.name:
                found_flash = True

    print("-" * 30)
    if found_flash:
        print("✅ SUCCESS: 'gemini-1.5-flash' is available!")
        print("   (You can use 'gemini-1.5-flash' in main.py)")
    else:
        print("❌ ERROR: Could not find 'gemini-1.5-flash'.")
        print("   Please use one of the model names listed above.")

except Exception as e:
    print("\n❌ CRITICAL ERROR:")
    print(e)