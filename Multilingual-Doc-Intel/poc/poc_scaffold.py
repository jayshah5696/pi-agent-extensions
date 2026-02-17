import os
from sarvamai import SarvamAI
from dotenv import load_dotenv

load_dotenv()

def run_poc():
    # Placeholder for POC logic
    print("Multilingual-Doc-Intel POC Scaffold")
    print("Target: Sarvam Vision + RLM Architecture")
    
    # API key check
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        print("MISSING: SARVAM_API_KEY in .env")
    else:
        print("API Key Detected. Ready for extraction tests.")

if __name__ == "__main__":
    run_poc()
