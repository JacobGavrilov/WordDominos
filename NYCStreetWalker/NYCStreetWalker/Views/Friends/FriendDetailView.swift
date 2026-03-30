import SwiftUI
import MapKit

struct FriendDetailView: View {
    let friend: UserProfile
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: Int = 0
    @State private var friendWalkedIDs: Set<String> = []
    @State private var isLoading: Bool = true

    private var myID: String { appState.currentUser?.id ?? "" }
    private var allStreets: [Street] { appState.neighborhoods.flatMap(\.streets) }

    private var onlyIWalked: [Street] {
        allStreets.filter { $0.isWalkedBy(myID) && !$0.isWalkedBy(friend.id) }
    }
    private var onlyFriendWalked: [Street] {
        allStreets.filter { $0.isWalkedBy(friend.id) && !$0.isWalkedBy(myID) }
    }
    private var bothWalked: [Street] {
        allStreets.filter { $0.isWalkedBy(myID) && $0.isWalkedBy(friend.id) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                headerCard
                statsGrid
                comparisonSection
            }
        }
        .navigationTitle(friend.displayName)
        .navigationBarTitleDisplayMode(.large)
        .task { await loadFriendStreets() }
    }

    // MARK: - Header

    private var headerCard: some View {
        HStack(spacing: 20) {
            AvatarView(user: friend, size: 64)

            VStack(alignment: .leading, spacing: 8) {
                Text(friend.displayName)
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Member since \(friend.joinedAt.formatted(.dateTime.month().year()))")
                    .font(.caption)
                    .foregroundColor(.secondary)

                HStack(spacing: 16) {
                    statBadge("\(friend.walkedStreetIDs.count)", label: "Streets")
                    statBadge("\(neighborhoodsCompleted)", label: "Neighborhoods")
                }
            }

            Spacer()
        }
        .padding()
        .background(Color(.systemBackground))
    }

    @ViewBuilder
    private func statBadge(_ value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.headline)
                .fontWeight(.bold)
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }

    private var neighborhoodsCompleted: Int {
        appState.neighborhoods.filter {
            $0.completionPercentage(by: friend.id) >= 1.0 && !$0.streets.isEmpty
        }.count
    }

    // MARK: - Stats Grid

    private var statsGrid: some View {
        VStack(spacing: 1) {
            HStack(spacing: 1) {
                comparisonCard(
                    count: bothWalked.count,
                    label: "Streets Together",
                    color: .purple,
                    icon: "person.2.fill"
                )
                comparisonCard(
                    count: onlyFriendWalked.count,
                    label: "They Explored",
                    color: Color(hex: friend.colorHex) ?? .blue,
                    icon: "figure.walk"
                )
                comparisonCard(
                    count: onlyIWalked.count,
                    label: "You Explored",
                    color: .green,
                    icon: "figure.walk.motion"
                )
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    @ViewBuilder
    private func comparisonCard(_ count: Int, label: String, color: Color, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)
            Text("\(count)")
                .font(.title)
                .fontWeight(.bold)
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(color.opacity(0.08))
        .cornerRadius(12)
    }

    // MARK: - Comparison Section

    private var comparisonSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Picker("View", selection: $selectedTab) {
                Text("Both Walked (\(bothWalked.count))").tag(0)
                Text("Only \(friend.displayName) (\(onlyFriendWalked.count))").tag(1)
                Text("Only You (\(onlyIWalked.count))").tag(2)
            }
            .pickerStyle(.segmented)
            .padding()

            let streets: [Street]
            switch selectedTab {
            case 0: streets = bothWalked
            case 1: streets = onlyFriendWalked
            default: streets = onlyIWalked
            }

            if streets.isEmpty {
                Text("No streets in this category yet")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(32)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(streets.prefix(50)) { street in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(street.name)
                                    .font(.body)
                                if let hood = appState.neighborhoods.first(where: { $0.id == street.neighborhoodId }) {
                                    Text(hood.name)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        Divider().padding(.leading, 16)
                    }
                }
                .background(Color(.systemBackground))
                .cornerRadius(12)
                .padding(.horizontal)
            }
        }
    }

    private func loadFriendStreets() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let ids = try await appState.cloudKitService.fetchWalkedStreetIDs(for: friend.id)
            friendWalkedIDs = ids
            // Apply to streets
            for i in 0..<appState.neighborhoods.count {
                for j in 0..<appState.neighborhoods[i].streets.count {
                    if ids.contains(appState.neighborhoods[i].streets[j].id) {
                        appState.neighborhoods[i].streets[j].walkedByUserIDs.insert(friend.id)
                    }
                }
            }
        } catch {}
    }
}
