import SwiftUI

@main
struct FlightLabApp: App {
    @StateObject private var store = FlightStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .preferredColorScheme(.light)
        }
    }
}
