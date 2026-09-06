import PhotosUI
import SwiftUI
import UIKit

private enum PhotoSource: String, Identifiable {
    case camera
    case library
    var id: String { rawValue }
}

private struct PlaneAnalysis {
    let balanceScore: Int
    let title: String
    let notes: [String]
}

struct PhotoAnalyzerView: View {
    @EnvironmentObject private var store: FlightStore
    @State private var photo: UIImage?
    @State private var analysis: PlaneAnalysis?
    @State private var showingChoices = false
    @State private var photoSource: PhotoSource?
    @State private var showingCameraAlert = false
    @State private var flightBehavior = "Not tested yet"

    private let behaviors = ["Not tested yet", "Flies straight", "Turns left", "Turns right", "Dives", "Stalls upward"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    introCard
                    if let photo { photoCard(photo) }
                    if let analysis { reportCard(analysis) }
                }
                .padding(20)
            }
            .background(FlightTheme.paper)
            .navigationTitle("Analyze a Plane")
            .confirmationDialog("Add a plane photo", isPresented: $showingChoices, titleVisibility: .visible) {
                Button("Take a Photo") {
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        photoSource = .camera
                    } else {
                        showingCameraAlert = true
                    }
                }
                Button("Choose from Photo Library") { photoSource = .library }
                Button("Cancel", role: .cancel) {}
            }
            .alert("Camera unavailable", isPresented: $showingCameraAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Choose a photo from the library, or open Flight Lab on an iPad with a camera.")
            }
            .sheet(item: $photoSource) { source in
                switch source {
                case .camera:
                    CameraPicker { picked in handlePhoto(picked) }
                        .ignoresSafeArea()
                case .library:
                    LibraryPicker { picked in handlePhoto(picked) }
                }
            }
        }
    }

    private var introCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("DESIGN CHECK", systemImage: "camera.viewfinder")
                .font(.caption.bold())
                .foregroundStyle(FlightTheme.cyan)
            Text("Photograph your plane from directly above.")
                .font(.title.bold())
                .foregroundStyle(.white)
            Text("Place it on a plain, contrasting surface. Flight Lab checks left-to-right balance and combines that with what happened in the air.")
                .foregroundStyle(.white.opacity(0.75))
            Button {
                showingChoices = true
            } label: {
                Label(photo == nil ? "Add a Photo" : "Replace Photo", systemImage: "camera.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(FlightTheme.lime)
            .foregroundStyle(FlightTheme.navy)
        }
        .padding(22)
        .background(FlightTheme.navy)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func photoCard(_ image: UIImage) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 340)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            Text("WHAT HAPPENS WHEN IT FLIES?")
                .font(.caption.bold())
                .foregroundStyle(FlightTheme.blue)
            Picker("Flight behavior", selection: $flightBehavior) {
                ForEach(behaviors, id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.menu)
            .onChange(of: flightBehavior) { _, _ in analyze(image) }
        }
        .flightCard()
    }

    private func reportCard(_ report: PlaneAnalysis) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading) {
                    Text("BALANCE SCORE").font(.caption.bold()).foregroundStyle(FlightTheme.muted)
                    Text(report.title).font(.title2.bold()).foregroundStyle(FlightTheme.navy)
                }
                Spacer()
                Text("\(report.balanceScore)%")
                    .font(.system(size: 38, weight: .black, design: .rounded))
                    .foregroundStyle(report.balanceScore >= 80 ? FlightTheme.blue : .orange)
            }
            Divider()
            ForEach(report.notes, id: \.self) { note in
                Label(note, systemImage: "wrench.and.screwdriver.fill")
                    .foregroundStyle(FlightTheme.navy)
            }
            Text("Tip: change only one thing at a time, then measure three throws and compare the new average.")
                .font(.footnote)
                .foregroundStyle(FlightTheme.muted)
                .padding(.top, 4)
        }
        .flightCard()
    }

    private func handlePhoto(_ image: UIImage?) {
        photoSource = nil
        guard let image else { return }
        photo = image
        analyze(image)
    }

    private func analyze(_ image: UIImage) {
        let score = image.mirrorBalanceScore()
        var notes: [String] = []

        if score >= 88 {
            notes.append("The wings look evenly balanced. Keep the center crease straight and sharp.")
        } else if score >= 72 {
            notes.append("The two sides are close, but one wing may be folded a little differently. Match the wing edges.")
        } else {
            notes.append("The left and right sides look uneven. Flatten the plane and remake one fold using the center crease as a guide.")
        }

        switch flightBehavior {
        case "Turns left": notes.append("Raise the back edge of the left wing very slightly, or lower the right edge.")
        case "Turns right": notes.append("Raise the back edge of the right wing very slightly, or lower the left edge.")
        case "Dives": notes.append("Bend both rear wing edges upward a tiny amount to add lift.")
        case "Stalls upward": notes.append("Flatten the rear wing edges a little and try a gentler, level throw.")
        case "Flies straight": notes.append("Keep this trim and test small changes to wing width or nose weight for more distance.")
        default: notes.append("Test three throws and choose the flight behavior above for a more specific adjustment.")
        }

        analysis = PlaneAnalysis(
            balanceScore: score,
            title: score >= 88 ? "Well balanced" : score >= 72 ? "Nearly balanced" : "Needs adjustment",
            notes: notes
        )
    }
}

private struct CameraPicker: UIViewControllerRepresentable {
    let onPick: (UIImage?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let onPick: (UIImage?) -> Void
        init(onPick: @escaping (UIImage?) -> Void) { self.onPick = onPick }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onPick(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onPick(nil) }
    }
}

private struct LibraryPicker: UIViewControllerRepresentable {
    let onPick: (UIImage?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var configuration = PHPickerConfiguration(photoLibrary: .shared())
        configuration.filter = .images
        configuration.selectionLimit = 1
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let onPick: (UIImage?) -> Void
        init(onPick: @escaping (UIImage?) -> Void) { self.onPick = onPick }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else {
                onPick(nil)
                return
            }
            provider.loadObject(ofClass: UIImage.self) { object, _ in
                DispatchQueue.main.async { self.onPick(object as? UIImage) }
            }
        }
    }
}

private extension UIImage {
    func mirrorBalanceScore() -> Int {
        let width = 96
        let height = 96
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        guard let cgImage else { return 50 }
        let drewImage = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(
                data: buffer.baseAddress,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.setFillColor(UIColor.white.cgColor)
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drewImage else { return 50 }

        var difference = 0.0
        var comparisons = 0.0
        for y in 0..<height {
            for x in 0..<(width / 2) {
                let left = (y * width + x) * 4
                let right = (y * width + (width - 1 - x)) * 4
                let leftLuma = 0.2126 * Double(pixels[left]) + 0.7152 * Double(pixels[left + 1]) + 0.0722 * Double(pixels[left + 2])
                let rightLuma = 0.2126 * Double(pixels[right]) + 0.7152 * Double(pixels[right + 1]) + 0.0722 * Double(pixels[right + 2])
                difference += abs(leftLuma - rightLuma) / 255
                comparisons += 1
            }
        }
        let similarity = max(0, 1 - difference / max(comparisons, 1))
        return Int((similarity * 100).rounded())
    }
}
