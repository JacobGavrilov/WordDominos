import Foundation
import CoreLocation
import MapKit

struct Street: Identifiable, Codable, Equatable {
    let id: String               // OSM way ID
    let name: String
    let neighborhoodId: String
    let coordinates: [CLLocationCoordinate2D]  // polyline points
    var walkedByUserIDs: Set<String>           // CloudKit record IDs

    // MARK: - Convenience

    var polyline: MKPolyline {
        MKPolyline(coordinates: coordinates, count: coordinates.count)
    }

    /// Approximate length of the street in meters
    var lengthMeters: Double {
        guard coordinates.count >= 2 else { return 0 }
        var total: Double = 0
        for i in 0..<(coordinates.count - 1) {
            let a = CLLocation(latitude: coordinates[i].latitude,
                               longitude: coordinates[i].longitude)
            let b = CLLocation(latitude: coordinates[i + 1].latitude,
                               longitude: coordinates[i + 1].longitude)
            total += a.distance(from: b)
        }
        return total
    }

    func isWalkedBy(_ userID: String) -> Bool {
        walkedByUserIDs.contains(userID)
    }

    // MARK: - Codable

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case neighborhoodId
        case coordinates
        case walkedByUserIDs
    }

    init(id: String,
         name: String,
         neighborhoodId: String,
         coordinates: [CLLocationCoordinate2D],
         walkedByUserIDs: Set<String> = []) {
        self.id = id
        self.name = name
        self.neighborhoodId = neighborhoodId
        self.coordinates = coordinates
        self.walkedByUserIDs = walkedByUserIDs
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        neighborhoodId = try container.decode(String.self, forKey: .neighborhoodId)
        walkedByUserIDs = try container.decode(Set<String>.self, forKey: .walkedByUserIDs)

        let rawCoords = try container.decode([CodableCoordinate].self, forKey: .coordinates)
        coordinates = rawCoords.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(neighborhoodId, forKey: .neighborhoodId)
        try container.encode(walkedByUserIDs, forKey: .walkedByUserIDs)

        let rawCoords = coordinates.map { CodableCoordinate(latitude: $0.latitude, longitude: $0.longitude) }
        try container.encode(rawCoords, forKey: .coordinates)
    }

    // MARK: - Equatable

    static func == (lhs: Street, rhs: Street) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - CodableCoordinate Helper

struct CodableCoordinate: Codable {
    let latitude: Double
    let longitude: Double
}
