import Foundation
import SwiftUI
import Combine
import CloudKit
import AuthenticationServices

@MainActor
class AppState: ObservableObject {
    // MARK: - Auth
    @Published var currentUser: UserProfile?
    @Published var isSignedIn: Bool = false

    // MARK: - Tracking
    @Published var isTracking: Bool = false
    @Published var currentSession: WalkSession?

    // MARK: - Data
    @Published var neighborhoods: [Neighborhood] = NYCNeighborhoodData.neighborhoods
    @Published var friends: [UserProfile] = []
    @Published var pendingRequests: [UserProfile] = []
    @Published var selectedNeighborhood: Neighborhood?

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
        bindLocationUpdates()
        Task { await checkCloudKitAndSignIn() }
    }

    // MARK: - Auth

    func signInWithApple() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let profile = try await cloudKitService.fetchOrCreateUserProfile(
                displayName: savedDisplayName() ?? "NYC Walker"
            )
            currentUser = profile
            isSignedIn = true
            persistUserID(profile.id)
            locationService.requestAuthorization()
            await loadFriends()
            await restoreWalkedStreets()
        } catch {
            errorMessage = "Sign in failed: \(error.localizedDescription)"
        }
    }

    private func checkCloudKitAndSignIn() async {
        await cloudKitService.checkAvailability()
        if cloudKitService.isAvailable, let savedID = savedUserID() {
            do {
                let profile = try await cloudKitService.fetchOrCreateUserProfile(
                    displayName: savedDisplayName() ?? "NYC Walker"
                )
                currentUser = profile
                isSignedIn = true
                locationService.requestAuthorization()
                await loadFriends()
                await restoreWalkedStreets()
            } catch {
                // Not an error - user just hasn't signed in yet
            }
        }
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

        // Match streets for all neighborhoods that have been loaded
        let loadedStreets = neighborhoods.flatMap(\.streets)
        let newStreetIDs = streetMatchingService.matchStreets(
            track: locationService.locationTrack,
            streets: loadedStreets
        )

        session.matchedStreetIDs = newStreetIDs
        currentSession = session

        // Update local user data
        if var updatedUser = currentUser {
            updatedUser.walkedStreetIDs.formUnion(newStreetIDs)
            currentUser = updatedUser
            applyWalkedStreets(for: updatedUser)
        }

        // Save to CloudKit
        do {
            try await cloudKitService.saveWalkedStreets(newStreetIDs, userID: user.id)
        } catch {
            // Queue for later (persist locally)
            queuePendingStreets(newStreetIDs)
        }

        locationService.clearTrack()
    }

    // MARK: - Neighborhood Streets

    func loadNeighborhoodStreets(_ neighborhood: Neighborhood) async {
        guard let idx = neighborhoods.firstIndex(where: { $0.id == neighborhood.id }) else { return }
        if !neighborhoods[idx].streets.isEmpty { return }

        do {
            var streets = try await overpassService.fetchStreets(for: neighborhood)
            // Mark which streets the current user has walked
            if let user = currentUser {
                for i in 0..<streets.count {
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
            let fetched = try await cloudKitService.fetchFriends(for: user.id)
            friends = fetched
            let requests = try await cloudKitService.fetchPendingRequests(for: user.id)
            pendingRequests = requests
        } catch {
            // Non-fatal
        }
    }

    func sendFriendRequest(to friendID: String) async {
        guard let user = currentUser else { return }
        do {
            try await cloudKitService.sendFriendRequest(from: user.id, to: friendID)
        } catch {
            errorMessage = "Could not send friend request: \(error.localizedDescription)"
        }
    }

    func acceptFriendRequest(from senderID: String) async {
        guard let user = currentUser else { return }
        do {
            try await cloudKitService.acceptFriendRequest(from: senderID, myID: user.id)
            await loadFriends()
        } catch {
            errorMessage = "Could not accept request: \(error.localizedDescription)"
        }
    }

    func searchUsers(by name: String) async -> [UserProfile] {
        do {
            return try await cloudKitService.searchUsers(by: name)
        } catch {
            return []
        }
    }

    // MARK: - Profile

    func updateDisplayName(_ name: String) async {
        guard var user = currentUser else { return }
        user.displayName = name
        currentUser = user
        saveDisplayName(name)
        do {
            try await cloudKitService.updateUserProfile(user)
        } catch {
            errorMessage = "Could not update profile"
        }
    }

    func updateColor(_ hex: String) async {
        guard var user = currentUser else { return }
        user.colorHex = hex
        currentUser = user
        do {
            try await cloudKitService.updateUserProfile(user)
        } catch {}
    }

    func signOut() {
        currentUser = nil
        isSignedIn = false
        clearUserID()
    }

    // MARK: - Private Helpers

    private func bindLocationUpdates() {
        locationService.$locationTrack
            .debounce(for: .seconds(2), scheduler: RunLoop.main)
            .sink { [weak self] track in
                guard let self, self.isTracking, let user = self.currentUser else { return }
                let loadedStreets = self.neighborhoods.flatMap(\.streets)
                let matched = self.streetMatchingService.matchStreets(track: track, streets: loadedStreets)
                if !matched.isEmpty {
                    self.currentSession?.matchedStreetIDs.formUnion(matched)
                }
            }
            .store(in: &cancellables)
    }

    private func restoreWalkedStreets() async {
        guard let user = currentUser else { return }
        do {
            let ids = try await cloudKitService.fetchWalkedStreetIDs(for: user.id)
            if var u = currentUser {
                u.walkedStreetIDs = ids
                currentUser = u
            }
        } catch {
            // Use locally cached version
        }
    }

    private func applyWalkedStreets(for user: UserProfile) {
        for i in 0..<neighborhoods.count {
            for j in 0..<neighborhoods[i].streets.count {
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

    private func savedDisplayName() -> String? {
        UserDefaults.standard.string(forKey: "currentUserDisplayName")
    }

    private func saveDisplayName(_ name: String) {
        UserDefaults.standard.set(name, forKey: "currentUserDisplayName")
    }

    private func queuePendingStreets(_ ids: Set<String>) {
        var pending = Set(UserDefaults.standard.stringArray(forKey: "pendingStreetIDs") ?? [])
        pending.formUnion(ids)
        UserDefaults.standard.set(Array(pending), forKey: "pendingStreetIDs")
    }
}
