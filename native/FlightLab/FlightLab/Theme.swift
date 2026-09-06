import SwiftUI

enum FlightTheme {
    static let navy = Color(red: 9 / 255, green: 29 / 255, blue: 54 / 255)
    static let blue = Color(red: 23 / 255, green: 105 / 255, blue: 1)
    static let lime = Color(red: 200 / 255, green: 243 / 255, blue: 75 / 255)
    static let orange = Color(red: 1, green: 113 / 255, blue: 72 / 255)
    static let cyan = Color(red: 67 / 255, green: 220 / 255, blue: 1)
    static let paper = Color(red: 244 / 255, green: 247 / 255, blue: 251 / 255)
    static let muted = Color(red: 101 / 255, green: 119 / 255, blue: 139 / 255)
}

struct FlightCard: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(20)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Color.black.opacity(0.08), lineWidth: 1)
            }
    }
}

extension View {
    func flightCard() -> some View { modifier(FlightCard()) }
}
