import SwiftUI

struct FriendsView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText: String = ""
    @State private var searchResults: [UserProfile] = []
    @State private var isSearching: Bool = false
    @State private var showInviteSheet: Bool = false
    @State private var isRefreshing: Bool = false

    var body: some View {
        NavigationStack {
            List {
                // Pending requests
                if !appState.pendingRequests.isEmpty {
                    Section("Friend Requests") {
                        ForEach(appState.pendingRequests) { requester in
                            pendingRequestRow(requester)
                        }
                    }
                }

                // Friends list
                Section(appState.friends.isEmpty ? "" : "Friends (\(appState.friends.count))") {
                    if appState.friends.isEmpty {
                        emptyFriendsPrompt
                    } else {
                        ForEach(appState.friends) { friend in
                            NavigationLink(destination: FriendDetailView(friend: friend)) {
                                friendRow(friend)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Friends")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showInviteSheet = true }) {
                        Label("Add Friend", systemImage: "person.badge.plus")
                    }
                }
            }
            .refreshable {
                await appState.loadFriends()
            }
            .sheet(isPresented: $showInviteSheet) {
                AddFriendSheet()
            }
        }
    }

    // MARK: - Subviews

    @ViewBuilder
    private func friendRow(_ friend: UserProfile) -> some View {
        HStack(spacing: 14) {
            AvatarView(user: friend, size: 46)

            VStack(alignment: .leading, spacing: 4) {
                Text(friend.displayName)
                    .font(.body)
                    .fontWeight(.medium)

                Text("\(friend.walkedStreetIDs.count) streets walked")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Mutual streets
            let mutual = mutualStreets(with: friend)
            if mutual > 0 {
                VStack(spacing: 1) {
                    Text("\(mutual)")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundColor(.green)
                    Text("shared")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func pendingRequestRow(_ requester: UserProfile) -> some View {
        HStack(spacing: 14) {
            AvatarView(user: requester, size: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(requester.displayName)
                    .fontWeight(.medium)
                Text("Wants to walk with you")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            HStack(spacing: 8) {
                Button(action: {
                    Task { await appState.acceptFriendRequest(from: requester.id) }
                }) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                        .font(.title2)
                }
                .buttonStyle(.plain)

                Button(action: {
                    // Decline - remove from list
                }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                        .font(.title2)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }

    private var emptyFriendsPrompt: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.2.slash")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            Text("No friends yet")
                .font(.headline)
                .foregroundColor(.secondary)
            Text("Invite friends to see their walked streets on your map!")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button(action: { showInviteSheet = true }) {
                Label("Add a Friend", systemImage: "person.badge.plus")
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(32)
        .listRowBackground(Color.clear)
    }

    private func mutualStreets(with friend: UserProfile) -> Int {
        guard let user = appState.currentUser else { return 0 }
        return user.walkedStreetIDs.intersection(friend.walkedStreetIDs).count
    }
}

// MARK: - Add Friend Sheet

struct AddFriendSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    @State private var searchText: String = ""
    @State private var results: [UserProfile] = []
    @State private var isSearching: Bool = false
    @State private var sentRequests: Set<String> = []

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    TextField("Search by name", text: $searchText)
                        .textInputAutocapitalization(.words)
                        .onSubmit { Task { await search() } }
                    if isSearching {
                        ProgressView()
                    }
                }
                .padding(12)
                .background(Color(.systemGroupedBackground))
                .cornerRadius(10)
                .padding()

                // Share invite link
                ShareLink(item: URL(string: "https://nycstreetwalker.app/invite")!) {
                    HStack {
                        Image(systemName: "link.badge.plus")
                        Text("Share Invite Link")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue.opacity(0.1))
                    .foregroundColor(.blue)
                    .cornerRadius(10)
                    .padding(.horizontal)
                }

                Divider().padding(.vertical, 8)

                List(results) { user in
                    HStack {
                        AvatarView(user: user, size: 40)
                        Text(user.displayName)
                        Spacer()
                        if sentRequests.contains(user.id) {
                            Text("Sent")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            Button("Add") {
                                Task {
                                    await appState.sendFriendRequest(to: user.id)
                                    sentRequests.insert(user.id)
                                }
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }
                }
            }
            .navigationTitle("Add Friend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onChange(of: searchText) { value in
                if value.count >= 2 {
                    Task { await search() }
                } else {
                    results = []
                }
            }
        }
    }

    private func search() async {
        guard !searchText.isEmpty else { return }
        isSearching = true
        defer { isSearching = false }
        results = await appState.searchUsers(by: searchText)
    }
}
