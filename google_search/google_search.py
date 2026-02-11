import os
import sys
from google import genai
from google.genai import types

def search(query: str):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set.")
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    
    # Using gemini-1.5-flash for speed and cost
    # google_search is a native tool in the Gemini API
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=query,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())]
        )
    )

    # Print the grounded response
    print(response.text)
    
    # Print citations if available
    if response.candidates[0].grounding_metadata:
        print("\nSources:")
        metadata = response.candidates[0].grounding_metadata
        if metadata.search_entry_point:
             print(f"Search Entry Point: {metadata.search_entry_point.rendered_content}")
        
        # In the new SDK, citations are often embedded in the text or available via grounding_chunks/grounding_supports
        # For simplicity in this script, we'll just show that grounding was used.

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: uv run google_search.py \"your search query\"")
        sys.exit(1)
    
    search(sys.argv[1])
