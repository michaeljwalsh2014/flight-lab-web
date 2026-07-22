import ARKit
import SceneKit
import SwiftUI

@MainActor
final class ARMeasureSession: NSObject, ObservableObject, ARSCNViewDelegate {
    enum Stage {
        case launch
        case landing
        case complete
    }

    @Published var stage: Stage = .launch
    @Published var distanceFeet: Double = 0
    @Published var message = "Move the iPad slowly until the floor is detected."
    @Published var canPlacePoint = false

    weak var sceneView: ARSCNView?
    private var launchPoint: SIMD3<Float>?
    private var landingPoint: SIMD3<Float>?
    private var markerNodes: [SCNNode] = []

    func connect(to view: ARSCNView) {
        sceneView = view
        view.delegate = self
        view.scene = SCNScene()
        view.automaticallyUpdatesLighting = true

        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal]
        configuration.environmentTexturing = .automatic
        view.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }

    func updatePlacementAvailability() {
        canPlacePoint = currentFloorPoint() != nil
    }

    func markLaunch() {
        guard let point = currentFloorPoint() else {
            message = "Keep the center target on the floor and try again."
            return
        }
        launchPoint = point
        addMarker(at: point, color: UIColor(FlightTheme.lime))
        stage = .landing
        message = "Launch marked. Walk to the airplane while keeping the floor in view."
    }

    func markLanding() {
        guard let start = launchPoint, let end = currentFloorPoint() else {
            message = "Aim the center target at the floor beside the airplane."
            return
        }
        landingPoint = end
        addMarker(at: end, color: UIColor(FlightTheme.cyan))
        addDistanceLine(from: start, to: end)

        let horizontalStart = SIMD2<Float>(start.x, start.z)
        let horizontalEnd = SIMD2<Float>(end.x, end.z)
        distanceFeet = Double(simd_distance(horizontalStart, horizontalEnd)) * 3.28084
        stage = .complete
        message = "Measurement complete."
    }

    func reset() {
        markerNodes.forEach { $0.removeFromParentNode() }
        markerNodes.removeAll()
        launchPoint = nil
        landingPoint = nil
        distanceFeet = 0
        stage = .launch
        message = "Move the iPad slowly until the floor is detected."
    }

    private func currentFloorPoint() -> SIMD3<Float>? {
        guard let sceneView else { return nil }
        let center = CGPoint(x: sceneView.bounds.midX, y: sceneView.bounds.midY)
        guard let query = sceneView.raycastQuery(from: center, allowing: .estimatedPlane, alignment: .horizontal),
              let result = sceneView.session.raycast(query).first else { return nil }
        let transform = result.worldTransform
        return SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
    }

    private func addMarker(at position: SIMD3<Float>, color: UIColor) {
        let marker = SCNNode(geometry: SCNCylinder(radius: 0.075, height: 0.008))
        marker.geometry?.firstMaterial?.diffuse.contents = color
        marker.position = SCNVector3(position.x, position.y + 0.006, position.z)
        sceneView?.scene.rootNode.addChildNode(marker)
        markerNodes.append(marker)
    }

    private func addDistanceLine(from start: SIMD3<Float>, to end: SIMD3<Float>) {
        let midpoint = (start + end) / 2
        let vector = end - start
        let length = simd_length(vector)
        guard length > 0 else { return }

        let cylinder = SCNCylinder(radius: 0.012, height: CGFloat(length))
        cylinder.firstMaterial?.diffuse.contents = UIColor(FlightTheme.cyan)
        let line = SCNNode(geometry: cylinder)
        line.simdPosition = midpoint + SIMD3<Float>(0, 0.018, 0)
        line.simdOrientation = simd_quatf(from: SIMD3<Float>(0, 1, 0), to: simd_normalize(vector))
        sceneView?.scene.rootNode.addChildNode(line)
        markerNodes.append(line)
    }

    nonisolated func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
        Task { @MainActor [weak self] in self?.updatePlacementAvailability() }
    }
}

struct ARMeasurementView: UIViewRepresentable {
    @ObservedObject var session: ARMeasureSession

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        session.connect(to: view)
        return view
    }

    func updateUIView(_ uiView: ARSCNView, context: Context) {}

    static func dismantleUIView(_ uiView: ARSCNView, coordinator: Void) {
        uiView.session.pause()
    }
}

struct MeasureView: View {
    @EnvironmentObject private var store: FlightStore
    @StateObject private var arSession = ARMeasureSession()
    @State private var showingManualEntry = false
    @State private var didSave = false

    var body: some View {
        NavigationStack {
            Group {
                if store.selectedPlane == nil {
                    ContentUnavailableView(
                        "Add a plane first",
                        systemImage: "paperplane",
                        description: Text("Go to My Planes and add the design you want to measure.")
                    )
                } else if !ARWorldTrackingConfiguration.isSupported {
                    unsupportedView
                } else {
                    measurementScreen
                }
            }
            .background(FlightTheme.paper)
            .navigationTitle("Measure a Throw")
            .toolbar {
                if store.selectedPlane != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Enter Manually") { showingManualEntry = true }
                    }
                }
            }
            .sheet(isPresented: $showingManualEntry) { ManualMeasurementView() }
        }
    }

    private var measurementScreen: some View {
        ZStack(alignment: .bottom) {
            ARMeasurementView(session: arSession)
                .ignoresSafeArea(edges: .bottom)

            if arSession.stage != .complete {
                Image(systemName: "plus")
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(arSession.canPlacePoint ? FlightTheme.lime : Color.white)
                    .shadow(radius: 3)
                    .allowsHitTesting(false)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            controls
                .padding(18)
        }
    }

    private var controls: some View {
        VStack(spacing: 13) {
            if arSession.stage == .complete {
                Text(formattedDistance(arSession.distanceFeet))
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .foregroundStyle(FlightTheme.navy)
            }

            Text(instructionTitle)
                .font(.headline)
                .foregroundStyle(FlightTheme.navy)
                .multilineTextAlignment(.center)
            Text(arSession.message)
                .font(.subheadline)
                .foregroundStyle(FlightTheme.muted)
                .multilineTextAlignment(.center)

            HStack(spacing: 12) {
                if arSession.stage != .launch {
                    Button("Start Over") {
                        didSave = false
                        arSession.reset()
                    }
                    .buttonStyle(.bordered)
                }

                Button(action: primaryAction) {
                    Label(primaryButtonTitle, systemImage: primaryButtonIcon)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .tint(didSave ? .green : FlightTheme.blue)
                .disabled((arSession.stage != .complete && !arSession.canPlacePoint) || didSave)
            }
        }
        .padding(20)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var instructionTitle: String {
        switch arSession.stage {
        case .launch: return "Aim at the floor where you threw from"
        case .landing: return "Aim beside the airplane"
        case .complete: return didSave ? "Throw saved!" : "Save this measurement?"
        }
    }

    private var primaryButtonTitle: String {
        switch arSession.stage {
        case .launch: return "Mark Launch Point"
        case .landing: return "Mark Landing Point"
        case .complete: return didSave ? "Saved" : "Save Throw"
        }
    }

    private var primaryButtonIcon: String {
        switch arSession.stage {
        case .launch: return "mappin.and.ellipse"
        case .landing: return "paperplane.fill"
        case .complete: return didSave ? "checkmark" : "square.and.arrow.down"
        }
    }

    private func primaryAction() {
        switch arSession.stage {
        case .launch: arSession.markLaunch()
        case .landing: arSession.markLanding()
        case .complete:
            store.addMeasuredThrow(distanceFeet: arSession.distanceFeet)
            didSave = true
        }
    }

    private var unsupportedView: some View {
        ContentUnavailableView {
            Label("AR measuring is unavailable", systemImage: "arkit")
        } description: {
            Text("Use a recent iPad or iPhone for camera-guided measuring, or enter the distance manually.")
        } actions: {
            Button("Enter Distance Manually") { showingManualEntry = true }
                .buttonStyle(.borderedProminent)
        }
    }

    private func formattedDistance(_ feet: Double) -> String {
        let wholeFeet = Int(feet)
        let inches = Int(((feet - Double(wholeFeet)) * 12).rounded())
        return "\(wholeFeet) ft \(inches) in"
    }
}

private struct ManualMeasurementView: View {
    @EnvironmentObject private var store: FlightStore
    @Environment(\.dismiss) private var dismiss
    @State private var feet = ""
    @State private var inches = ""

    private var totalFeet: Double {
        (Double(feet) ?? 0) + (Double(inches) ?? 0) / 12
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Distance") {
                    TextField("Feet", text: $feet).keyboardType(.numberPad)
                    TextField("Inches", text: $inches).keyboardType(.decimalPad)
                }
                Section {
                    Text("Use this backup when the floor is too dark, shiny, or uneven for the camera measurement.")
                }
            }
            .navigationTitle("Manual Distance")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        store.addMeasuredThrow(distanceFeet: totalFeet)
                        dismiss()
                    }
                    .disabled(totalFeet <= 0)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
