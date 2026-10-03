// swift-tools-version: 5.9
import PackageDescription

// STUDY TYPE: Apple・Google でサインイン。Facebook などの部品を入れないよう、自前の小さなプラグインにした
let package = Package(
    name: "StudytypeAuth",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "StudytypeAuth", targets: ["StudyAuthPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", .upToNextMajor(from: "9.0.0"))
    ],
    targets: [
        .target(
            name: "StudyAuthPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS")
            ],
            path: "ios/Sources/StudyAuthPlugin")
    ]
)
