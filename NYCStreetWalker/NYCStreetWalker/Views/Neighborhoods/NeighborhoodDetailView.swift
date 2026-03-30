import SwiftUI
import MapKit

struct NeighborhoodDetailView: View {
    let neighborhood: Neighborhood
    @EnvironmentObject var appState: AppState
    @State private var filter: StreetFilter = .all
    @State private var isLoadingStreets: Bool = false
    @State private var searchText: String = ""

    enum StreetFilter: String, CaseIterable {
        case all = "All"
        case walked = "Walked"
        case unwalked = "Not Walked"
    }

    private var userID: String { appState.currentUser?.id ?? "" }

    private var liveNeighborhood: Neighborhood {
        appState.neighborhoods.first(where: { $0.id == neighborhood.id }) ?? neighborhood
    }

    private var filteredStreets: [Street] {
        let streets: [Street]
        switch filter {
        case .all:      streets = liveNeighborhood.streets
        case .walked:   streets = liveNeighborhood.streets.filter { $0.isWalkedBy(userID) }
        case .unwalked: streets = liveNeighborhood.streets.filter { !$0.isWalkedBy(userID) }
        }
        if searchText.isEmpty { return streets.sorted { $0.name < $1.name } }
        return streets.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
            .sorted { $0.name < $1.name }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                headerSection
                filterBar
                if liveNeighborhood.streets.isEmpty {
                    loadButton
                } else {
                    streetsList
                }
            }
        }
        .navigationTitle(neighborhood.name)
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $searchText, prompt: "Search streets")
        .task {
            if liveNeighborhood.streets.isEmpty {
                await loadStreets()
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(spacing: 24) {
            CircularProgressView(
                progress: liveNeighborhood.completionPercentage(by: userID),
                color: .green,
                size: 80
            )

            VStack(alignment: .leading, spacing: 6) {
                Text(neighborhood.borough.rawValue)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.secondary)
                    .textCase(.uppercase)
                    .tracking(0.5)

                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("\(liveNeighborhood.walkedCount(by: userID)) streets walked")
                        .font(.subheadline)
                }

                HStack(spacing: 4) {
                    Image(systemName: "circle")
                        .foregroundColor(.secondary)
                    Text("\(liveNeighborhood.totalStreets - liveNeighborhood.walkedCount(by: userID)) remaining")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                if !appState.friends.isEmpty {
                    friendProgress
                }
            }

            Spacer()
        }
        .padding()
        .background(Color(.systemGroupedBackground))
    }

    @ViewBuilder
    private var friendProgress: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Friends")
                .font(.caption2)
                .foregroundColor(.secondary)
            HStack(spacing: 6) {
                ForEach(appState.friends.prefix(4)) { friend in
                    VStack(spacing: 2) {
                        AvatarView(user: friend, size: 24)
                        Text("\(Int(liveNeighborhood.completionPercentage(by: friend.id) * 100))%")
                            .font(.system(size: 9))
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        Picker("Filter", selection: $filter) {
            ForEach(StreetFilter.allCases, id: \.self) { f in
                Text(f.rawValue).tag(f)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Streets List

    private var streetsList: some View {
        LazyVStack(spacing: 0) {
            ForEach(filteredStreets) { street in
                StreetRowView(street: street, userID: userID, friends: appState.friends)
                Divider().padding(.leading, 52)
            }
        }
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .padding()
    }

    // MARK: - Load Button

    private var loadButton: some View {
        VStack(spacing: 16) {
            Image(systemName: "map.fill")
                .font(.largeTitle)
                .foregroundColor(.secondary)
            Text("Street data not loaded yet")
                .foregroundColor(.secondary)
            Button(action: { Task { await loadStreets() } }) {
                if isLoadingStreets {
                    ProgressView()
                        .padding(.horizontal, 24)
                } else {
                    Label("Load Streets", systemImage: "arrow.down.circle.fill")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isLoadingStreets)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
    }

    private func loadStreets() async {
        isLoadingStreets = true
        await appState.loadNeighborhoodStreets(liveNeighborhood)
        isLoadingStreets = false
    }
}

// MARK: - Street Row

struct StreetRowView: View {
    let street: Street
    let userID: String
    let friends: [UserProfile]

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(street.isWalkedBy(userID) ? Color.green.opacity(0.15) : Color.secondary.opacity(0.1))
                    .frame(width: 36, height: 36)
                Image(systemName: street.isWalkedBy(userID) ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(street.isWalkedBy(userID) ? .green : .secondary)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(street.name)
                    .font(.body)

                let walkers = friendsWhoWalked
                if !walkers.isEmpty {
                    HStack(spacing: -4) {
                        ForEach(walkers.prefix(3)) { friend in
                            AvatarView(user: friend, size: 18)
                        }
                    }
                }
            }

            Spacer()

            Text(String(format: "%.0fm", street.lengthMeters))
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var friendsWhoWalked: [UserProfile] {
        friends.filter { street.isWalkedBy($0.id) }
    }
}

// MARK: - Avatar View

struct AvatarView: View {
    let user: UserProfile
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(hex: user.colorHex) ?? .blue)
            Text(user.initials)
                .font(.system(size: size * 0.4, weight: .bold))
                .foregroundColor(.white)
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 1))
    }
}
