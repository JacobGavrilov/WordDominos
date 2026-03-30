import Foundation
import CloudKit

class CloudKitService {
    // MARK: - Constants

    static let containerIdentifier = "iCloud.com.nycstreetwalker.app"

    private let container: CKContainer
    private let publicDB: CKDatabase
    private let privateDB: CKDatabase

    // MARK: - CKRecord type names

    private enum RecordType {
        static let userProfile   = "UserProfile"
        static let walkedStreet  = "WalkedStreet"
        static let friendRequest = "FriendRequest"
    }

    // MARK: - Init

    init() {
        container = CKContainer(identifier: CloudKitService.containerIdentifier)
        publicDB  = container.publicCloudDatabase
        privateDB = container.privateCloudDatabase
    }

    // MARK: - iCloud Availability

    private func checkiCloudAvailable() async throws {
        let status = try await container.accountStatus()
        guard status == .available else {
            throw CloudKitError.iCloudNotAvailable
        }
    }

    // MARK: - User Profile

    /// Fetches the current user's profile record or creates one on first launch.
    func fetchOrCreateUserProfile() async throws -> UserProfile {
        try await checkiCloudAvailable()

        let userRecordID = try await container.userRecordID()
        let recordName = userRecordID.recordName

        do {
            let record = try await publicDB.record(for: CKRecord.ID(recordName: "profile-\(recordName)"))
            return userProfile(from: record, fallbackID: recordName)
        } catch let error as CKError where error.code == .unknownItem {
            let newProfile = UserProfile(
                id: recordName,
                displayName: "NYC Walker",
                colorHex: UserProfile.randomColor()
            )
            let record = profileToRecord(newProfile)
            try await publicDB.save(record)
            return newProfile
        }
    }

    /// Updates the user's display name and color in CloudKit.
    func updateUserProfile(_ profile: UserProfile) async throws {
        try await checkiCloudAvailable()
        let record = profileToRecord(profile)
        try await publicDB.save(record)
    }

    // MARK: - Walked Streets

    /// Records that the user has walked the given streets.
    func saveWalkedStreets(_ streetIDs: Set<String>, userID: String) async throws {
        try await checkiCloudAvailable()

        var recordsToSave: [CKRecord] = []
        for streetID in streetIDs {
            let recordName = "walked-\(userID)-\(streetID)"
            let record = CKRecord(recordType: RecordType.walkedStreet,
                                  recordID: CKRecord.ID(recordName: recordName))
            record["userID"]   = userID as CKRecordValue
            record["streetID"] = streetID as CKRecordValue
            record["walkedAt"] = Date() as CKRecordValue
            recordsToSave.append(record)
        }

        try await saveRecords(recordsToSave, in: publicDB)
    }

    /// Returns the set of street IDs that `friendID` has walked.
    func fetchFriendWalkedStreets(friendID: String) async throws -> Set<String> {
        try await checkiCloudAvailable()

        let predicate = NSPredicate(format: "userID == %@", friendID)
        let query = CKQuery(recordType: RecordType.walkedStreet, predicate: predicate)

        let (results, _) = try await publicDB.records(matching: query,
                                                       resultsLimit: CKQueryOperation.maximumResults)
        var streetIDs = Set<String>()
        for (_, result) in results {
            if case .success(let record) = result,
               let streetID = record["streetID"] as? String {
                streetIDs.insert(streetID)
            }
        }
        return streetIDs
    }

    // MARK: - Friends

    /// Returns full profiles for all accepted friends of `userID`.
    func fetchFriends(for userID: String) async throws -> [UserProfile] {
        try await checkiCloudAvailable()

        let predicate = NSPredicate(format: "fromUserID == %@ AND status == 'accepted'", userID)
        let query = CKQuery(recordType: RecordType.friendRequest, predicate: predicate)

        let (results, _) = try await publicDB.records(matching: query, resultsLimit: 200)
        let friendIDs = results.compactMap { _, result -> String? in
            guard case .success(let record) = result else { return nil }
            return record["toUserID"] as? String
        }

        var profiles: [UserProfile] = []
        for fid in friendIDs {
            if let profile = try? await fetchPublicProfile(userID: fid) {
                profiles.append(profile)
            }
        }
        return profiles
    }

    /// Sends a friend request from the current user to `toUserID`.
    func sendFriendRequest(to toUserID: String) async throws {
        try await checkiCloudAvailable()
        let fromUserID = try await container.userRecordID().recordName

        let recordName = "fr-\(fromUserID)-\(toUserID)"
        let record = CKRecord(recordType: RecordType.friendRequest,
                              recordID: CKRecord.ID(recordName: recordName))
        record["fromUserID"] = fromUserID as CKRecordValue
        record["toUserID"]   = toUserID as CKRecordValue
        record["status"]     = "pending" as CKRecordValue
        record["createdAt"]  = Date() as CKRecordValue

        try await publicDB.save(record)
    }

    /// Accepts a friend request from `fromUserID`.
    func acceptFriendRequest(from fromUserID: String) async throws {
        try await checkiCloudAvailable()
        let currentUserID = try await container.userRecordID().recordName

        // Update pending request to accepted
        let reqRecordName = "fr-\(fromUserID)-\(currentUserID)"
        if let reqRecord = try? await publicDB.record(for: CKRecord.ID(recordName: reqRecordName)) {
            reqRecord["status"] = "accepted" as CKRecordValue
            try await publicDB.save(reqRecord)
        }

        // Create reverse link so both can find each other
        let reverseID = CKRecord.ID(recordName: "fr-\(currentUserID)-\(fromUserID)")
        let reverse = CKRecord(recordType: RecordType.friendRequest, recordID: reverseID)
        reverse["fromUserID"] = currentUserID as CKRecordValue
        reverse["toUserID"]   = fromUserID as CKRecordValue
        reverse["status"]     = "accepted" as CKRecordValue
        reverse["createdAt"]  = Date() as CKRecordValue
        try await publicDB.save(reverse)
    }

    /// Searches for users whose display name contains `name`.
    func searchUsers(by name: String) async throws -> [UserProfile] {
        try await checkiCloudAvailable()

        let predicate = NSPredicate(format: "displayName CONTAINS[cd] %@", name)
        let query = CKQuery(recordType: RecordType.userProfile, predicate: predicate)

        let (results, _) = try await publicDB.records(matching: query, resultsLimit: 20)

        return results.compactMap { _, result -> UserProfile? in
            guard case .success(let record) = result else { return nil }
            return userProfile(from: record, fallbackID: record.recordID.recordName)
        }
    }

    // MARK: - Pending Friend Requests

    func fetchPendingRequests() async throws -> [FriendRequestInfo] {
        try await checkiCloudAvailable()
        let currentUserID = try await container.userRecordID().recordName

        let predicate = NSPredicate(format: "toUserID == %@ AND status == 'pending'", currentUserID)
        let query = CKQuery(recordType: RecordType.friendRequest, predicate: predicate)

        let (results, _) = try await publicDB.records(matching: query, resultsLimit: 50)

        var requests: [FriendRequestInfo] = []
        for (_, result) in results {
            guard case .success(let record) = result,
                  let fromID = record["fromUserID"] as? String,
                  let createdAt = record["createdAt"] as? Date else { continue }

            let senderName: String
            if let senderProfile = try? await fetchPublicProfile(userID: fromID) {
                senderName = senderProfile.displayName
            } else {
                senderName = "Unknown User"
            }
            requests.append(FriendRequestInfo(fromUserID: fromID,
                                               fromDisplayName: senderName,
                                               createdAt: createdAt))
        }
        return requests
    }

    // MARK: - Push Subscriptions

    /// Subscribes to CloudKit push notifications when friends walk new streets.
    func subscribeToFriendUpdates() async throws {
        try await checkiCloudAvailable()

        let predicate = NSPredicate(value: true)
        let subscription = CKQuerySubscription(
            recordType: RecordType.walkedStreet,
            predicate: predicate,
            subscriptionID: "friend-walked-streets",
            options: [.firesOnRecordCreation]
        )

        let notificationInfo = CKSubscription.NotificationInfo()
        notificationInfo.shouldSendContentAvailable = true
        notificationInfo.shouldBadge = false
        subscription.notificationInfo = notificationInfo

        try await publicDB.save(subscription)
    }

    // MARK: - Private Helpers

    private func fetchPublicProfile(userID: String) async throws -> UserProfile {
        let record = try await publicDB.record(for: CKRecord.ID(recordName: "profile-\(userID)"))
        return userProfile(from: record, fallbackID: userID)
    }

    private func profileToRecord(_ profile: UserProfile) -> CKRecord {
        let record = CKRecord(recordType: RecordType.userProfile,
                              recordID: CKRecord.ID(recordName: "profile-\(profile.id)"))
        record["displayName"] = profile.displayName as CKRecordValue
        record["colorHex"]    = profile.colorHex as CKRecordValue
        record["joinedAt"]    = profile.joinedAt as CKRecordValue
        record["userID"]      = profile.id as CKRecordValue
        return record
    }

    private func userProfile(from record: CKRecord, fallbackID: String) -> UserProfile {
        let id          = record["userID"]      as? String ?? fallbackID
        let displayName = record["displayName"] as? String ?? "NYC Walker"
        let colorHex    = record["colorHex"]    as? String ?? UserProfile.randomColor()
        let joinedAt    = record["joinedAt"]    as? Date   ?? Date()
        return UserProfile(id: id, displayName: displayName, colorHex: colorHex, joinedAt: joinedAt)
    }

    /// Saves records in batches of 400 (CloudKit limit).
    private func saveRecords(_ records: [CKRecord], in database: CKDatabase) async throws {
        let batchSize = 400
        var index = 0
        while index < records.count {
            let batch = Array(records[index..<min(index + batchSize, records.count)])
            let op = CKModifyRecordsOperation(recordsToSave: batch)
            op.savePolicy = .changedKeys
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                op.modifyRecordsResultBlock = { result in
                    switch result {
                    case .success: continuation.resume()
                    case .failure(let error): continuation.resume(throwing: error)
                    }
                }
                database.add(op)
            }
            index += batchSize
        }
    }
}

// MARK: - Supporting Types

struct FriendRequestInfo {
    let fromUserID: String
    let fromDisplayName: String
    let createdAt: Date
}

enum CloudKitError: LocalizedError {
    case iCloudNotAvailable
    case recordParsingFailed

    var errorDescription: String? {
        switch self {
        case .iCloudNotAvailable:
            return "iCloud is not available. Please sign into iCloud in Settings."
        case .recordParsingFailed:
            return "Failed to read data from iCloud."
        }
    }
}
