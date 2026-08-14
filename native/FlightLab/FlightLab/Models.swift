import Combine
import Foundation

struct Plane: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    let createdAt: Date

    init(id: UUID = UUID(), name: String, createdAt: Date = Date()) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
    }
}

struct FlightThrow: Identifiable, Codable, Hashable {
    let id: UUID
    let planeID: UUID
    let distanceFeet: Double
    let measuredAt: Date

    init(id: UUID = UUID(), planeID: UUID, distanceFeet: Double, measuredAt: Date = Date()) {
        self.id = id
        self.planeID = planeID
        self.distanceFeet = distanceFeet
        self.measuredAt = measuredAt
    }
}

@MainActor
final class FlightStore: ObservableObject {
    @Published var planes: [Plane] = [] { didSet { save() } }
    @Published var flightThrows: [FlightThrow] = [] { didSet { save() } }
    @Published var selectedPlaneID: UUID? { didSet { save() } }

    private let storageKey = "flight-lab-native-data-v1"
    private var hasLoaded = false

    init() {
        load()
    }

    var selectedPlane: Plane? {
        planes.first { $0.id == selectedPlaneID }
    }

    var selectedThrows: [FlightThrow] {
        flightThrows
            .filter { $0.planeID == selectedPlaneID }
            .sorted { $0.measuredAt > $1.measuredAt }
    }

    var averageDistance: Double {
        guard !selectedThrows.isEmpty else { return 0 }
        return selectedThrows.map(\.distanceFeet).reduce(0, +) / Double(selectedThrows.count)
    }

    var bestDistance: Double {
        selectedThrows.map(\.distanceFeet).max() ?? 0
    }

    func addPlane(named name: String) {
        let plane = Plane(name: name.trimmingCharacters(in: .whitespacesAndNewlines))
        guard !plane.name.isEmpty else { return }
        planes.append(plane)
        selectedPlaneID = plane.id
    }

    func addMeasuredThrow(distanceFeet: Double) {
        guard let planeID = selectedPlaneID, distanceFeet > 0 else { return }
        flightThrows.append(FlightThrow(planeID: planeID, distanceFeet: distanceFeet))
    }

    func select(_ plane: Plane) {
        selectedPlaneID = plane.id
    }

    private struct Snapshot: Codable {
        var planes: [Plane]
        var flightThrows: [FlightThrow]
        var selectedPlaneID: UUID?
    }

    private func load() {
        defer { hasLoaded = true }
        guard
            let data = UserDefaults.standard.data(forKey: storageKey),
            let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data)
        else { return }
        planes = snapshot.planes
        flightThrows = snapshot.flightThrows
        selectedPlaneID = snapshot.selectedPlaneID ?? snapshot.planes.first?.id
    }

    private func save() {
        guard hasLoaded else { return }
        let snapshot = Snapshot(planes: planes, flightThrows: flightThrows, selectedPlaneID: selectedPlaneID)
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
