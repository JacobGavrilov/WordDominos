import SwiftUI
import Charts

struct ProfileView: View {
    @EnvironmentObject var appState: AppState
    @State private var isEditingName: Bool = false
    @State private var editedName: String = ""
    @State private var showColorPicker: Bool = false

    private var user: UserProfile? { appState.currentUser }
    private var allStreets: [Street] { appState.neighborhoods.flatMap(\.streets) }

    var body: some View {
        NavigationStack {
            List {
                profileHeaderSection
                statsSection
                boroughBreakdownSection
                topNeighborhoodsSection
                settingsSection
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Profile")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(isEditingName ? "Save" : "Edit") {
                        if isEditingName {
                            Task { await appState.updateDisplayName(editedName) }
                        } else {
                            editedName = user?.displayName ?? ""
                        }
                        isEditingName.toggle()
                    }
                }
            }
        }
    }

    // MARK: - Profile Header

    private var profileHeaderSection: some View {
        Section {
            HStack(spacing: 16) {
                ZStack {
                    AvatarView(user: user ?? UserProfile(id: "", displayName: "?"), size: 64)
                    Button(action: { showColorPicker = true }) {
                        Image(systemName: "pencil.circle.fill")
                            .font(.title3)
                            .foregroundColor(.white)
                            .offset(x: 20, y: 20)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    if isEditingName {
                        TextField("Display name", text: $editedName)
                            .textFieldStyle(.roundedBorder)
                            .font(.title3)
                    } else {
                        Text(user?.displayName ?? "NYC Walker")
                            .font(.title3)
                            .fontWeight(.semibold)
                    }
                    Text("Member since \(user?.joinedAt.formatted(.dateTime.month().year()) ?? "today")")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 8)

            if showColorPicker {
                colorPickerRow
            }
        }
    }

    private var colorPickerRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Map Color")
                .font(.caption)
                .foregroundColor(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(UserProfile.userColors, id: \.self) { hex in
                        Button(action: {
                            Task { await appState.updateColor(hex) }
                            showColorPicker = false
                        }) {
                            Circle()
                                .fill(Color(hex: hex) ?? .blue)
                                .frame(width: 32, height: 32)
                                .overlay(
                                    Circle().stroke(Color.white, lineWidth: user?.colorHex == hex ? 3 : 0)
                                )
                                .shadow(radius: 2)
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    // MARK: - Stats Section

    private var statsSection: some View {
        Section("Your Stats") {
            let uid = user?.id ?? ""
            statsRow(icon: "figure.walk", color: .green,
                     label: "Streets Walked",
                     value: "\(user?.walkedStreetIDs.count ?? 0)")
            statsRow(icon: "building.2", color: .blue,
                     label: "Neighborhoods Completed",
                     value: "\(completedNeighborhoods)")
            statsRow(icon: "arrow.triangle.2.circlepath", color: .orange,
                     label: "Current Streak",
                     value: "\(currentStreak) days")
            statsRow(icon: "map", color: .purple,
                     label: "Boroughs Explored",
                     value: "\(boroughsExplored)")
        }
    }

    @ViewBuilder
    private func statsRow(icon: String, color: Color, label: String, value: String) -> some View {
        HStack {
            Image(systemName: icon)
                .frame(width: 28)
                .foregroundColor(color)
            Text(label)
            Spacer()
            Text(value)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Borough Breakdown Chart

    private var boroughBreakdownSection: some View {
        Section("Borough Breakdown") {
            Chart(boroughData, id: \.borough) { item in
                BarMark(
                    x: .value("Borough", item.shortName),
                    y: .value("Streets", item.walked)
                )
                .foregroundStyle(by: .value("Borough", item.shortName))
                .cornerRadius(4)
            }
            .frame(height: 160)
            .padding(.vertical, 8)
            .chartLegend(.hidden)
        }
    }

    // MARK: - Top Neighborhoods

    private var topNeighborhoodsSection: some View {
        let uid = user?.id ?? ""
        let top = appState.neighborhoods
            .filter { !$0.streets.isEmpty }
            .sorted { $0.completionPercentage(by: uid) > $1.completionPercentage(by: uid) }
            .prefix(5)

        return Section("Top Neighborhoods") {
            ForEach(Array(top)) { hood in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(hood.name).font(.subheadline)
                        Text(hood.borough.rawValue).font(.caption).foregroundColor(.secondary)
                    }
                    Spacer()
                    CircularProgressView(
                        progress: hood.completionPercentage(by: uid),
                        color: .green,
                        size: 36
                    )
                }
            }

            if top.isEmpty {
                Text("Start walking to see your top neighborhoods!")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }

    // MARK: - Settings

    private var settingsSection: some View {
        Section("Account") {
            Button(role: .destructive, action: { appState.signOut() }) {
                HStack {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                    Text("Sign Out")
                }
            }
        }
    }

    // MARK: - Computed Stats

    private var completedNeighborhoods: Int {
        guard let uid = user?.id else { return 0 }
        return appState.neighborhoods.filter {
            $0.completionPercentage(by: uid) >= 1.0 && !$0.streets.isEmpty
        }.count
    }

    private var currentStreak: Int {
        // Simplified: return count of recent walk sessions
        // In a full implementation this would use persistent session history
        return 0
    }

    private var boroughsExplored: Int {
        guard let uid = user?.id else { return 0 }
        return Set(appState.neighborhoods
            .filter { $0.walkedCount(by: uid) > 0 }
            .map(\.borough)).count
    }

    private var boroughData: [(borough: Neighborhood.Borough, shortName: String, walked: Int)] {
        guard let uid = user?.id else { return [] }
        return Neighborhood.Borough.allCases.map { borough in
            let walked = appState.neighborhoods
                .filter { $0.borough == borough }
                .reduce(0) { $0 + $1.walkedCount(by: uid) }
            let short: String
            switch borough {
            case .manhattan:    short = "MN"
            case .brooklyn:     short = "BK"
            case .queens:       short = "QN"
            case .bronx:        short = "BX"
            case .statenIsland: short = "SI"
            }
            return (borough, short, walked)
        }
    }
}
