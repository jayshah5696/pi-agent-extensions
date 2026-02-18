//
//  SadhanaApp.swift
//  Sadhana - The Unified Local AI Instrument
//  Phase 1: Hollow Shell (Pure Swift)
//

import SwiftUI
import KeyboardShortcuts

// Global Hotkey Definitions
extension KeyboardShortcuts.Name {
    static let toggleDictation = Self("toggleDictation", default: .init(.d, modifiers: [.command, .shift]))
    static let toggleSearch = Self("toggleSearch", default: .init(.f, modifiers: [.command, .shift]))
    static let toggleMeetings = Self("toggleMeetings", default: .init(.m, modifiers: [.command, .shift]))
}

@main
struct SadhanaApp: App {
    // Shared State (Use @Observable for performance)
    @StateObject private var appState = AppState()
    
    // Global Hotkey Manager
    private let shortcuts = KeyboardShortcuts.onKeyUp(for: .toggleDictation) {
        // Dhvani Trigger
        print("[Sadhana] Trigger: Dhvani (Dictation)")
        NotificationCenter.default.post(name: .toggleOverlay, object: Module.dhvani)
    }

    // Launch Time Optimization: Keep init light
    init() {
        // Deferred heavy initialization logic goes here if needed
        print("[Sadhana] Launching native host...")
    }
    
    var body: some Scene {
        MenuBarExtra("Sadhana", systemImage: "brain.head.profile") {
            // Main Menu
            Button("Toggle Dictation (Cmd+Shift+D)") {
                NotificationCenter.default.post(name: .toggleOverlay, object: Module.dhvani)
            }
            .keyboardShortcut("d", modifiers: [.command, .shift])
            
            Button("Search Vault (Cmd+Shift+F)") {
                NotificationCenter.default.post(name: .toggleOverlay, object: Module.sanchay)
            }
            
            Button("Record Meeting (Cmd+Shift+M)") {
                NotificationCenter.default.post(name: .toggleOverlay, object: Module.granola)
            }
            
            Divider()
            
            SettingsLink {
                Text("Settings...")
            }
            
            Button("Quit Sadhana") {
                NSApplication.shared.terminate(nil)
            }
        }
        .menuBarExtraStyle(.menu) // Start simple, evolve to .window later for rich UI
        
        // Settings Window
        Settings {
            SettingsView()
        }
    }
}

// Module Enum
enum Module {
    case dhvani
    case sanchay
    case granola
}

// Notification Extension for Overlay Management
extension Notification.Name {
    static let toggleOverlay = Notification.Name("ToggleOverlay")
}

// App State (Observable Object for UI updates)
class AppState: ObservableObject {
    @Published var activeModule: Module? = nil
    @Published var isRecording: Bool = false
    @Published var lastTranscript: String = ""
}

struct SettingsView: View {
    var body: some View {
        Form {
            KeyboardShortcuts.Recorder("Dictation:", name: .toggleDictation)
            KeyboardShortcuts.Recorder("Search:", name: .toggleSearch)
            KeyboardShortcuts.Recorder("Meetings:", name: .toggleMeetings)
        }
        .padding()
        .frame(width: 300, height: 200)
    }
}
