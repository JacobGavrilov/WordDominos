import Foundation
import CoreLocation

// MARK: - OverpassService

class OverpassService {
    private let baseURL = "https://overpass-api.de/api/interpreter"
    private let cacheDirectory: URL
    private var memoryCache: [String: [Street]] = [:]

    init() {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDirectory = caches.appendingPathComponent("OverpassStreets", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDirectory,
                                                  withIntermediateDirectories: true)
    }

    // MARK: - Public API

    func fetchStreets(for neighborhood: Neighborhood) async throws -> [Street] {
        // Return from memory cache if available
        if let cached = memoryCache[neighborhood.id] {
            return cached
        }
        // Return from disk cache if available
        if let cached = cachedStreets(for: neighborhood.id) {
            memoryCache[neighborhood.id] = cached
            return cached
        }

        let streets = try await downloadStreets(for: neighborhood)
        cacheStreets(streets, for: neighborhood.id)
        memoryCache[neighborhood.id] = streets
        return streets
    }

    // MARK: - Cache

    func cachedStreets(for neighborhoodId: String) -> [Street]? {
        let file = cacheFile(for: neighborhoodId)
        guard let data = try? Data(contentsOf: file) else { return nil }
        // Expire after 7 days
        if let attrs = try? FileManager.default.attributesOfItem(atPath: file.path),
           let mod = attrs[.modificationDate] as? Date,
           Date().timeIntervalSince(mod) > 7 * 86400 {
            try? FileManager.default.removeItem(at: file)
            return nil
        }
        return try? JSONDecoder().decode([Street].self, from: data)
    }

    func cacheStreets(_ streets: [Street], for neighborhoodId: String) {
        let file = cacheFile(for: neighborhoodId)
        if let data = try? JSONEncoder().encode(streets) {
            try? data.write(to: file)
        }
    }

    func clearCache() {
        memoryCache.removeAll()
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(at: cacheDirectory,
                                                  withIntermediateDirectories: true)
    }

    // MARK: - Download

    private func downloadStreets(for neighborhood: Neighborhood) async throws -> [Street] {
        let bbox = neighborhood.boundingBox.overpassString
        let query = """
        [out:json][timeout:25];
        way["highway"~"^(residential|primary|secondary|tertiary|unclassified|living_street|pedestrian|footway|path|service)$"]["name"](\(bbox));
        out geom;
        """

        guard let url = URL(string: baseURL) else { throw URLError(.badURL) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = query.data(using: .utf8)
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }

        return try parseOverpassResponse(data, neighborhoodId: neighborhood.id)
    }

    // MARK: - Parsing

    private func parseOverpassResponse(_ data: Data, neighborhoodId: String) throws -> [Street] {
        let response = try JSONDecoder().decode(OverpassResponse.self, from: data)
        return response.elements.compactMap { element -> Street? in
            guard element.type == "way",
                  let name = element.tags?["name"],
                  let geometry = element.geometry,
                  geometry.count >= 2 else { return nil }
            let coords = geometry.map {
                CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon)
            }
            return Street(id: "osm-\(element.id)",
                          name: name,
                          neighborhoodId: neighborhoodId,
                          coordinates: coords)
        }
    }

    // MARK: - Helpers

    private func cacheFile(for neighborhoodId: String) -> URL {
        let safe = neighborhoodId.replacingOccurrences(of: "/", with: "_")
        return cacheDirectory.appendingPathComponent("\(safe).json")
    }
}

// MARK: - Overpass JSON Models (private)

private struct OverpassResponse: Decodable {
    let elements: [OverpassElement]
}

private struct OverpassElement: Decodable {
    let id: Int
    let type: String
    let tags: [String: String]?
    let geometry: [OverpassGeomPoint]?
}

private struct OverpassGeomPoint: Decodable {
    let lat: Double
    let lon: Double
}
