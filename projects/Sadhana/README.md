# Sadhana (साधना) - The Unified Local AI Instrument

**Phase 1: The Hollow Shell**

This is a native macOS application built with **Swift 6** and **SwiftUI**. It serves as a modular host for local AI capabilities, starting with Dictation (Dhvani), Search (Sanchay), and Meeting Notes (Granola).

## 🏗 System Design & Architecture

### 1. The Entry Point (`SadhanaApp.swift`)
- **Technology:** `MenuBarExtra` (macOS 13+)
- **Why?** Instead of a heavy windowed app (like Chrome/Electron), we use a lightweight menu bar agent. It runs in the background, consuming minimal RAM (~20MB idle), and waits for user intent.
- **Responsibility:** Handles the App Lifecycle and global hotkey listening.

### 2. The Brain (`InferenceEngine.swift`)
- **Technology:** Swift `GlobalActor`
- **Why?** AI models (Whisper, LLMs) are heavy and stateful. We don't want two features trying to use the GPU at the exact same time. An `actor` serializes access—like a traffic cop—ensuring thread safety without complex locks.
- **Responsibility:** Loads models lazily (on demand), runs inference, and manages memory.

### 3. The Glue (`Package.swift`)
- **Technology:** Swift Package Manager (SPM)
- **Why?** We avoid the bloated `.xcodeproj` file format. This text-based manifest declares our dependencies (`mlx-swift`, `KeyboardShortcuts`) clearly. It makes the project portable and git-friendly.

## 🚀 How to Run (On Your Mac)

1. **Open in Xcode:**
   Double-click `Package.swift`. Xcode will recognize it as a project and start resolving dependencies (MLX is large, give it a minute).

2. **Build & Run:**
   Select the `My Mac` target and press `Cmd+R`.
   *Note: You might need to enable "Developer Mode" in System Settings if prompted.*

3. **Test:**
   - Look for the "Brain" icon 🧠 in your menu bar.
   - Press `Cmd+Shift+D` (Dictation) -> Check the Xcode Console for the trigger log.
   - Press `Cmd+Shift+M` (Meetings) -> Check logs.

## 🔜 Next Steps: The Audio Pipeline
We need to connect the microphone to the `InferenceEngine`.
- **Challenge:** Capturing audio buffers efficiently without dropping frames.
- **Plan:** Use `AVAudioEngine` to create a tap on the microphone input node, convert the buffer to an `MLXArray`, and feed it to the model.
