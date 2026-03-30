import Foundation
import CoreLocation
import MapKit

class StreetMatchingService {
    static let matchThresholdMeters: Double = 15.0
    /// Fraction of a street's segments that must be covered to count it as walked
    static let coverageFraction: Double = 0.50

    // MARK: - Public API

    /// Given a GPS track and a collection of streets, return IDs of streets considered walked.
    func matchStreets(locations: [CLLocation], streets: [Street]) -> Set<String> {
        matchStreets(track: locations, streets: streets)
    }

    func matchStreets(track: [CLLocation], streets: [Street]) -> Set<String> {
        guard track.count >= 2 else { return [] }
        var walked = Set<String>()
        for street in streets {
            if isStreetWalked(track: track, street: street) {
                walked.insert(street.id)
            }
        }
        return walked
    }

    // MARK: - Private

    /// Returns true if the GPS track covers at least `coverageFraction` of the street.
    func isStreetWalked(track: [CLLocation], street: Street) -> Bool {
        let coords = street.coordinates
        guard coords.count >= 2 else { return false }

        var coveredSegments = 0
        let totalSegments = coords.count - 1

        for i in 0..<totalSegments {
            let start = coords[i]
            let end = coords[i + 1]
            if trackCoversSegment(track: track, start: start, end: end) {
                coveredSegments += 1
            }
        }

        return Double(coveredSegments) / Double(totalSegments) >= StreetMatchingService.coverageFraction
    }

    /// Returns true if any GPS point is within threshold distance of the segment.
    private func trackCoversSegment(track: [CLLocation],
                                    start: CLLocationCoordinate2D,
                                    end: CLLocationCoordinate2D) -> Bool {
        for point in track {
            let d = distanceToSegment(point: point.coordinate, segStart: start, segEnd: end)
            if d <= StreetMatchingService.matchThresholdMeters {
                return true
            }
        }
        return false
    }

    /// Perpendicular (or endpoint) distance from `point` to the segment [segStart, segEnd], in meters.
    func distanceToSegment(point: CLLocationCoordinate2D,
                            segStart: CLLocationCoordinate2D,
                            segEnd: CLLocationCoordinate2D) -> Double {
        // Convert to approximate cartesian (metres) using equirectangular projection
        let latRef = (segStart.latitude + segEnd.latitude) / 2
        let cosLat = cos(latRef * .pi / 180)
        let metersPerDegLat = 111_320.0
        let metersPerDegLon = metersPerDegLat * cosLat

        let px = (point.longitude - segStart.longitude) * metersPerDegLon
        let py = (point.latitude  - segStart.latitude)  * metersPerDegLat
        let dx = (segEnd.longitude - segStart.longitude) * metersPerDegLon
        let dy = (segEnd.latitude  - segStart.latitude)  * metersPerDegLat

        let segLen2 = dx * dx + dy * dy
        if segLen2 == 0 {
            // Segment is a point
            return sqrt(px * px + py * py)
        }

        // Project point onto the segment
        let t = max(0, min(1, (px * dx + py * dy) / segLen2))
        let closestX = t * dx
        let closestY = t * dy
        let diffX = px - closestX
        let diffY = py - closestY
        return sqrt(diffX * diffX + diffY * diffY)
    }
}
