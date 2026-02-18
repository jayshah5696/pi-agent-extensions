// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "Sadhana",
    platforms: [
        .macOS(.v14) // Target modern macOS (Sonoma+) for MenuBarExtra and MLX optimization
    ],
    products: [
        .executable(name: "Sadhana", targets: ["Sadhana"])
    ],
    dependencies: [
        // MLX Swift: The engine for local inference (Whisper, LLMs, Embeddings)
        .package(url: "https://github.com/ml-explore/mlx-swift", from: "0.10.0"),
        
        // KeyboardShortcuts: Global hotkey management
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "1.19.0")
    ],
    targets: [
        .executableTarget(
            name: "Sadhana",
            dependencies: [
                .product(name: "MLX", package: "mlx-swift"),
                .product(name: "MLXRandom", package: "mlx-swift"),
                .product(name: "MLXNN", package: "mlx-swift"),
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts")
            ],
            path: "Sources/Sadhana", // Explicit path for clarity
            resources: [
                // Future: Bundle localized strings, icons, or quantized models here if needed
            ]
        )
    ]
)
