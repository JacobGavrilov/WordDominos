import Foundation
import SwiftUI
import Combine
import CoreLocation

@MainActor
class AppState: ObservableObject {
    // MARK: - Auth
    @Published var currentUser: UserProfile?
    @Published var isSignedIn: Bool = false

    // MARK: - Tracking
    @Published var isTracking: Bool = false
    @Published var currentSession: WalkSession?

    // MARK: - Data
    @Published var neighborhoods: [Neighborhood] = Neighborhood.nycNeighborhoods
    @Published var friends: [UserProfile] = []
    @Published var pendingRequests: [UserProfile] = []
    @Published var selectedNeighborhood: Neighborhood?
    @Published var selectedFriend: UserProfile?

    // MARK: - UI State
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    // MARK: - Services

    let locationService = LocationService()
    let streetMatchingService = StreetMatchingService()
    let cloudKitService = CloudKitService()
    let overpassService = OverpassService()

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    func initialize() {
        locationService.requestAuthorization()
        bindLocationUpdates()
        Task { await silentSignIn() }
    }

    // MARK: - Sign In

    func signInWithApple() async {
        isLoading = true
        defer { isLoading = false }
        errorMessage = nil

        do {
            let profile = try await cloudKitService.fetchOrCreateUserProfile()
            currentUser = profile
            isSignedIn = true
            persistUserID(profile.id)
            await loadFriends()
            try? await cloudKitService.subscribeToFriendUpdates()
            await restoreWalkedStreets()
        } catch {
            errorMessage = "Sign in failed: \(error.localizedDescription)"
        }
    }

    private func silentSignIn() async {
        guard savedUserID() != nil else { return }
        do {
            let profile = try await cloudKitService.fetchOrCreateUserProfile()
            currentUser = profile
            isSignedIn = true
            await loadFriends()
            await restoreWalkedStreets()
        } catch {
            // Not signed into iCloud – stay on sign-in screen
        }
    }

    func signOut() {
        currentUser = nil
        isSignedIn = false
        clearUserID()
    }

    // MARK: - Walk Tracking

    func startWalk() {
        guard !isTracking, let user = currentUser else { return }
        let session = WalkSession(id: UUID(), userID: user.id, startTime: Date())
        currentSession = session
        isTracking = true
        locationService.startTracking()
    }

    func stopWalk() async {
        guard isTracking, var session = currentSession, let user = currentUser else { return }
        locationService.stopTracking()
        isTracking = false
        session.endTime = Date()
        session.gpsTrack = locationService.locationTrack.map(\.coordinate)

        let loadedStreets = neighborhoods.flatMap(\.streets)
        let newStreetIDs = streetMatchingService.matchStreets(
            locations: locationService.locationTrack,
            streets: loadedStreets
        )

        session.matchedStreetIDs = newStreetIDs
        currentSession = session

        if var u = currentUser {
            u.walkedStreetIDs.formUnion(newStreetIDs)
            currentUser = u
            applyWalkedStreets(for: u)
        }

        queuePendingStreets(newStreetIDs)

        do {
            try await cloudKitService.saveWalkedStreets(newStreetIDs, userID: user.id)
            clearPendingStreets()
        } catch {
            // Streets remain queued for retry
        }

        locationService.clearTrack()
    }

    // MARK: - Neighborhood Streets

    func loadNeighborhoodStreets(_ neighborhood: Neighborhood) async {
        guard let idx = neighborhoods.firstIndex(where: { $0.id == neighborhood.id }) else { return }
        guard neighborhoods[idx].streets.isEmpty else { return }

        do {
            var streets = try await overpassService.fetchStreets(for: neighborhood)
            if let user = currentUser {
                for i in streets.indices {
                    if user.walkedStreetIDs.contains(streets[i].id) {
                        streets[i].walkedByUserIDs.insert(user.id)
                    }
                    for friend in friends {
                        if friend.walkedStreetIDs.contains(streets[i].id) {
                            streets[i].walkedByUserIDs.insert(friend.id)
                        }
                    }
                }
            }
            neighborhoods[idx].streets = streets
        } catch {
            errorMessage = "Could not load streets: \(error.localizedDescription)"
        }
    }

    // MARK: - Friends

    func loadFriends() async {
        guard let user = currentUser else { return }
        do {
            friends = try await cloudKitService.fetchFriends(for: user.id)
            pendingRequests = try await cloudKitService.fetchPendingRequests()
        } catch {
            // Non-fatal
        }
    }

    func sendFriendRequest(to userID: String) async {
        do {
            try await cloudKitService.sendFriendRequest(to: userID)
        } catch {
            errorMessage = "Could not send friend request: \(error.localizedDescription)"
        }
    }

    func inviteFriend(userID: String) async {
        await sendFriendRequest(to: userID)
    }

    func acceptFriendRequest(from senderID: String) async {
        do {
            try await cloudKitService.acceptFriendRequest(from: senderID)
            pendingRequests.removeAll { $0.id == senderID }
            await loadFriends()
        } catch {
            errorMessage = "Could not accept request: \(error.localizedDescription)"
        }
    }

    func searchUsers(by query: String) async -> [UserProfile] {
        guard !query.isEmpty else { return [] }
        do {
            return try await cloudKitService.searchUsers(by: query)
        } catch {
            return []
        }
    }

    func searchUsers(query: String) async -> [UserProfile] {
        await searchUsers(by: query)
    }

    // MARK: - Profile

    func updateProfile(displayName: String, colorHex: String) async {
        guard var user = currentUser else { return }
        user.displayName = displayName
        user.colorHex    = colorHex
        currentUser = user
        do {
            try await cloudKitService.updateUserProfile(user)
        } catch {
            errorMessage = "Could not save profile: \(error.localizedDescription)"
        }
    }

    func updateDisplayName(_ name: String) async {
        await updateProfile(displayName: name, colorHex: currentUser?.colorHex ?? UserProfile.randomColor())
    }

    func updateColor(_ hex: String) async {
        await updateProfile(displayName: currentUser?.displayName ?? "NYC Walker", colorHex: hex)
    }

    // MARK: - Stats

    var totalWalkedStreets: Int {
        currentUser?.walkedStreetIDs.count ?? 0
    }

    var totalDistanceMeters: Double {
        guard let userID = currentUser?.id else { return 0 }
        return neighborhoods
            .flatMap(\.streets)
            .filter { $0.isWalkedBy(userID) }
            .reduce(0) { $0 + $1.lengthMeters }
    }

    var completedNeighborhoods: Int {
        guard let userID = currentUser?.id else { return 0 }
        return neighborhoods.filter { n in
            n.totalStreets > 0 && n.completionPercentage(by: userID) >= 100.0
        }.count
    }

    var currentStreak: Int {
        UserDefaults.standard.integer(forKey: "walkStreakDays")
    }

    // MARK: - Private Helpers

    private func bindLocationUpdates() {
        locationService.$locationTrack
            .debounce(for: .seconds(3), scheduler: RunLoop.main)
            .sink { [weak self] track in
                guard let self, self.isTracking else { return }
                let loadedStreets = self.neighborhoods.flatMap(\.streets)
                let matched = self.streetMatchingService.matchStreets(
                    locations: track,
                    streets: loadedStreets
                )
                if !matched.isEmpty {
                    self.currentSession?.matchedStreetIDs.formUnion(matched)
                }
            }
            .store(in: &cancellables)
    }

    private func restoreWalkedStreets() async {
        guard let user = currentUser else { return }
        do {
            let ids = try await cloudKitService.fetchFriendWalkedStreets(friendID: user.id)
            if var u = currentUser {
                u.walkedStreetIDs = ids
                currentUser = u
            }
        } catch {
            // Use locally cached version from UserDefaults
        }
    }

    private func applyWalkedStreets(for user: UserProfile) {
        for i in neighborhoods.indices {
            for j in neighborhoods[i].streets.indices {
                if user.walkedStreetIDs.contains(neighborhoods[i].streets[j].id) {
                    neighborhoods[i].streets[j].walkedByUserIDs.insert(user.id)
                }
            }
        }
    }

    // MARK: - Persistence

    private func savedUserID() -> String? {
        UserDefaults.standard.string(forKey: "currentUserID")
    }

    private func persistUserID(_ id: String) {
        UserDefaults.standard.set(id, forKey: "currentUserID")
    }

    private func clearUserID() {
        UserDefaults.standard.removeObject(forKey: "currentUserID")
    }

    private func queuePendingStreets(_ ids: Set<String>) {
        var pending = Set(UserDefaults.standard.stringArray(forKey: "pendingStreetIDs") ?? [])
        pending.formUnion(ids)
        UserDefaults.standard.set(Array(pending), forKey: "pendingStreetIDs")
    }

    private func clearPendingStreets() {
        UserDefaults.standard.removeObject(forKey: "pendingStreetIDs")
    }
}
