import SwiftUI

struct NeighborhoodListView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText: String = ""
    @State private var sortOrder: SortOrder = .borough

    enum SortOrder: String, CaseIterable {
        case borough = "Borough"
        case name = "Name"
        case completion = "Completion"
    }

    private var userID: String { appState.currentUser?.id ?? "" }

    private var filtered: [Neighborhood] {
        let base = searchText.isEmpty
            ? appState.neighborhoods
            : appState.neighborhoods.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
        switch sortOrder {
        case .borough:    return base
        case .name:       return base.sorted { $0.name < $1.name }
        case .completion: return base.sorted {
            $0.completionPercentage(by: userID) > $1.completionPercentage(by: userID)
        }
        }
    }

    private var grouped: [(Neighborhood.Borough, [Neighborhood])] {
        if sortOrder != .borough {
            return [(.manhattan, filtered)] // flat list under dummy key
        }
        let dict = Dictionary(grouping: filtered, by: \.borough)
        return Neighborhood.Borough.allCases.compactMap { borough in
            guard let hoods = dict[borough], !hoods.isEmpty else { return nil }
            return (borough, hoods.sorted { $0.name < $1.name })
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if sortOrder == .borough {
                    ForEach(grouped, id: \.0) { borough, hoods in
                        Section(header: Text(borough.rawValue).font(.headline)) {
                            ForEach(hoods) { neighborhood in
                                neighborhoodRow(neighborhood)
                            }
                        }
                    }
                } else {
                    ForEach(filtered) { neighborhood in
                        neighborhoodRow(neighborhood)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Neighborhoods")
            .searchable(text: $searchText, prompt: "Search neighborhoods")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        ForEach(SortOrder.allCases, id: \.self) { order in
                            Button(action: { sortOrder = order }) {
                                HStack {
                                    Text(order.rawValue)
                                    if sortOrder == order { Image(systemName: "checkmark") }
                                }
                            }
                        }
                    } label: {
                        Label("Sort", systemImage: "arrow.up.arrow.down")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func neighborhoodRow(_ neighborhood: Neighborhood) -> some View {
        NavigationLink(destination: NeighborhoodDetailView(neighborhood: neighborhood)) {
            HStack(spacing: 14) {
                CircularProgressView(
                    progress: neighborhood.completionPercentage(by: userID),
                    color: .green,
                    size: 44
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(neighborhood.name)
                        .font(.body)
                        .fontWeight(.medium)

                    HStack(spacing: 4) {
                        Text("\(neighborhood.walkedCount(by: userID)) / \(neighborhood.totalStreets) streets")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        if sortOrder != .borough {
                            Text("·")
                                .foregroundColor(.secondary)
                            Text(neighborhood.borough.rawValue)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Spacer()

                if neighborhood.streets.isEmpty {
                    Image(systemName: "arrow.down.circle")
                        .foregroundColor(.secondary)
                        .font(.caption)
                }
            }
            .padding(.vertical, 4)
        }
        .swipeActions(edge: .trailing) {
            Button {
                Task { await appState.loadNeighborhoodStreets(neighborhood) }
            } label: {
                Label("Load Streets", systemImage: "arrow.down.circle")
            }
            .tint(.blue)
        }
    }
}

// MARK: - Circular Progress View

struct CircularProgressView: View {
    let progress: Double    // 0.0 – 1.0
    let color: Color
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(color.opacity(0.2), lineWidth: 3)

            Circle()
                .trim(from: 0, to: progress)
                .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeInOut, value: progress)

            Text("\(Int(progress * 100))%")
                .font(.system(size: size * 0.28, weight: .semibold, design: .rounded))
                .foregroundColor(color)
        }
        .frame(width: size, height: size)
    }
}
