import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: FlightStore
    @State private var selectedTab: AppTab = .hangar

    enum AppTab: Hashable {
        case hangar
        case measure
        case analyze
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            HangarView(onMeasure: { selectedTab = .measure })
                .tabItem { Label("My Planes", systemImage: "paperplane.fill") }
                .tag(AppTab.hangar)

            MeasureView()
                .tabItem { Label("Measure", systemImage: "ruler.fill") }
                .tag(AppTab.measure)

            PhotoAnalyzerView()
                .tabItem { Label("Analyze", systemImage: "camera.viewfinder") }
                .tag(AppTab.analyze)
        }
        .tint(FlightTheme.blue)
    }
}

struct HangarView: View {
    @EnvironmentObject private var store: FlightStore
    @State private var showingAddPlane = false
    let onMeasure: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    HeroPanel(onMeasure: onMeasure, onAddPlane: { showingAddPlane = true })

                    if store.planes.isEmpty {
                        EmptyHangarView { showingAddPlane = true }
                    } else {
                        planePicker
                        StatsView()
                        ThrowsView(onMeasure: onMeasure)
                    }
                }
                .padding(20)
            }
            .background(FlightTheme.paper)
            .navigationTitle("Flight Lab")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Add Plane", systemImage: "plus") { showingAddPlane = true }
                }
            }
            .sheet(isPresented: $showingAddPlane) { AddPlaneView() }
        }
    }

    private var planePicker: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("YOUR HANGAR")
                .font(.caption.bold())
                .foregroundStyle(FlightTheme.blue)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(store.planes) { plane in
                        Button {
                            store.select(plane)
                        } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                Image(systemName: "paperplane.fill")
                                    .font(.title2)
                                    .foregroundStyle(store.selectedPlaneID == plane.id ? FlightTheme.lime : FlightTheme.blue)
                                Text(plane.name).font(.headline)
                                Text("\(store.flightThrows.filter { $0.planeID == plane.id }.count) throws")
                                    .font(.caption)
                                    .foregroundStyle(store.selectedPlaneID == plane.id ? Color.white.opacity(0.7) : FlightTheme.muted)
                            }
                            .frame(width: 150, alignment: .leading)
                            .padding(16)
                            .foregroundStyle(store.selectedPlaneID == plane.id ? Color.white : FlightTheme.navy)
                            .background(store.selectedPlaneID == plane.id ? FlightTheme.navy : Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private struct HeroPanel: View {
    @EnvironmentObject private var store: FlightStore
    let onMeasure: () -> Void
    let onAddPlane: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("READY FOR TAKEOFF", systemImage: "location.north.fill")
                .font(.caption.bold())
                .foregroundStyle(FlightTheme.cyan)
            Text("THROW.\nMEASURE.\nIMPROVE.")
                .font(.system(size: 52, weight: .black, design: .rounded))
                .minimumScaleFactor(0.7)
                .foregroundStyle(Color.white)
                .tracking(-2)
            Text(store.selectedPlane?.name ?? "Add your first plane to begin testing.")
                .font(.headline)
                .foregroundStyle(FlightTheme.lime)
            HStack {
                Button(action: store.selectedPlane == nil ? onAddPlane : onMeasure) {
                    Label(store.selectedPlane == nil ? "Add a Plane" : "Measure a Throw", systemImage: store.selectedPlane == nil ? "plus" : "ruler")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .tint(FlightTheme.lime)
                .foregroundStyle(FlightTheme.navy)
            }
        }
        .padding(26)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .trailing) {
                FlightTheme.navy
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 150))
                    .foregroundStyle(FlightTheme.blue.opacity(0.35))
                    .rotationEffect(.degrees(-15))
                    .offset(x: 35, y: 40)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
    }
}

private struct EmptyHangarView: View {
    let addPlane: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "paperplane")
                .font(.system(size: 54))
                .foregroundStyle(FlightTheme.blue)
            Text("No planes yet").font(.title2.bold())
            Text("Name your first design. Flight Lab will keep its measurements and averages separate.")
                .foregroundStyle(FlightTheme.muted)
                .multilineTextAlignment(.center)
            Button("Add Your First Plane", action: addPlane)
                .buttonStyle(.borderedProminent)
                .tint(FlightTheme.blue)
        }
        .frame(maxWidth: .infinity)
        .flightCard()
    }
}

private struct StatsView: View {
    @EnvironmentObject private var store: FlightStore

    var body: some View {
        HStack(spacing: 12) {
            stat(title: "AVERAGE", value: String(format: "%.1f ft", store.averageDistance))
            stat(title: "BEST", value: String(format: "%.1f ft", store.bestDistance))
            stat(title: "THROWS", value: "\(store.selectedThrows.count)")
        }
    }

    private func stat(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.caption2.bold()).foregroundStyle(FlightTheme.muted)
            Text(value).font(.title2.bold()).foregroundStyle(FlightTheme.navy)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .flightCard()
    }
}

private struct ThrowsView: View {
    @EnvironmentObject private var store: FlightStore
    let onMeasure: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("RECENT THROWS").font(.headline)
                Spacer()
                Button("Measure", systemImage: "ruler", action: onMeasure)
            }
            if store.selectedThrows.isEmpty {
                ContentUnavailableView("No throws yet", systemImage: "ruler", description: Text("Your AR measurements will appear here."))
            } else {
                ForEach(store.selectedThrows.prefix(6)) { item in
                    HStack {
                        Image(systemName: "paperplane.fill").foregroundStyle(FlightTheme.blue)
                        Text(item.measuredAt, style: .date).foregroundStyle(FlightTheme.muted)
                        Spacer()
                        Text(String(format: "%.1f ft", item.distanceFeet)).font(.headline)
                    }
                    if item.id != store.selectedThrows.prefix(6).last?.id { Divider() }
                }
            }
        }
        .flightCard()
    }
}

private struct AddPlaneView: View {
    @EnvironmentObject private var store: FlightStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Plane Name") {
                    TextField("Example: Sky Dart", text: $name)
                        .textInputAutocapitalization(.words)
                }
                Section {
                    Text("Each plane gets its own throw history, average, best distance, and design notes.")
                }
            }
            .navigationTitle("Add a Plane")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        store.addPlane(named: name)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
