import Foundation
import CoreLocation

struct WalkSession: Identifiable, Codable {
    let id: UUID
    let userID: String
    var startTime: Date
    var endTime: Date?
    var gpsTrack: [CLLocationCoordinate2D]  // raw GPS points
    var matchedStreetIDs: Set<String>        // streets matched during walk

    // MARK: - Computed

    var isActive: Bool { endTime == nil }

    var duration: TimeInterval {
        (endTime ?? Date()).timeIntervalSince(startTime)
    }

    /// Sum of distances between consecutive GPS points
    var distanceMeters: Double {
        guard gpsTrack.count >= 2 else { return 0 }
        var total: Double = 0
        for i in 0..<(gpsTrack.count - 1) {
            let a = CLLocation(latitude: gpsTrack[i].latitude, longitude: gpsTrack[i].longitude)
            let b = CLLocation(latitude: gpsTrack[i + 1].latitude, longitude: gpsTrack[i + 1].longitude)
            total += a.distance(from: b)
        }
        return total
    }

    var formattedDuration: String {
        let secs = Int(duration)
        let h = secs / 3600
        let m = (secs % 3600) / 60
        let s = secs % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%02d:%02d", m, s)
    }

    // MARK: - Init

    init(id: UUID = UUID(),
         userID: String,
         startTime: Date = Date(),
         endTime: Date? = nil,
         gpsTrack: [CLLocationCoordinate2D] = [],
         matchedStreetIDs: Set<String> = []) {
        self.id = id
        self.userID = userID
        self.startTime = startTime
        self.endTime = endTime
        self.gpsTrack = gpsTrack
        self.matchedStreetIDs = matchedStreetIDs
    }

    // MARK: - Codable

    enum CodingKeys: String, CodingKey {
        case id, userID, startTime, endTime, gpsTrack, matchedStreetIDs
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        userID = try container.decode(String.self, forKey: .userID)
        startTime = try container.decode(Date.self, forKey: .startTime)
        endTime = try container.decodeIfPresent(Date.self, forKey: .endTime)
        matchedStreetIDs = try container.decode(Set<String>.self, forKey: .matchedStreetIDs)

        let rawCoords = try container.decode([CodableCoordinate].self, forKey: .gpsTrack)
        gpsTrack = rawCoords.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(userID, forKey: .userID)
        try container.encode(startTime, forKey: .startTime)
        try container.encodeIfPresent(endTime, forKey: .endTime)
        try container.encode(matchedStreetIDs, forKey: .matchedStreetIDs)

        let rawCoords = gpsTrack.map { CodableCoordinate(latitude: $0.latitude, longitude: $0.longitude) }
        try container.encode(rawCoords, forKey: .gpsTrack)
    }
}
