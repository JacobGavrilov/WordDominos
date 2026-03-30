import Foundation
import CoreLocation

// MARK: - Neighborhood Bounding Box

struct NeighborhoodBounds: Codable {
    let minLat: Double
    let minLon: Double
    let maxLat: Double
    let maxLon: Double
}

// MARK: - Overpass Response Types

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

    // MARK: - Fetch

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

        guard let bounds = NYCNeighborhoodData.bounds[neighborhood.id] else {
            return []
        }

        let query = buildQuery(bounds: bounds)
        guard let url = URL(string: baseURL) else { throw URLError(.badURL) }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = query.data(using: .utf8)
        request.timeoutInterval = 30

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }

        let streets = try parseOverpassResponse(data, neighborhoodId: neighborhood.id)
        cacheStreets(streets, for: neighborhood.id)
        memoryCache[neighborhood.id] = streets
        return streets
    }

    // MARK: - Cache

    func cachedStreets(for neighborhoodId: String) -> [Street]? {
        let file = cacheFile(for: neighborhoodId)
        guard let data = try? Data(contentsOf: file) else { return nil }
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

    // MARK: - Private

    private func cacheFile(for neighborhoodId: String) -> URL {
        let safe = neighborhoodId.replacingOccurrences(of: "/", with: "_")
        return cacheDirectory.appendingPathComponent("\(safe).json")
    }

    private func buildQuery(bounds: NeighborhoodBounds) -> String {
        let bbox = "\(bounds.minLat),\(bounds.minLon),\(bounds.maxLat),\(bounds.maxLon)"
        return """
        [out:json][timeout:25];
        way["highway"~"^(residential|primary|secondary|tertiary|unclassified|living_street|pedestrian|footway|path|service)$"]["name"](\(bbox));
        out geom;
        """
    }

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
}

// MARK: - NYC Neighborhood Catalog

enum NYCNeighborhoodData {
    static let bounds: [String: NeighborhoodBounds] = [
        // Manhattan
        "financial-district":   NeighborhoodBounds(minLat: 40.6990, minLon: -74.0200, maxLat: 40.7090, maxLon: -74.0050),
        "tribeca":              NeighborhoodBounds(minLat: 40.7150, minLon: -74.0120, maxLat: 40.7220, maxLon: -74.0020),
        "soho":                 NeighborhoodBounds(minLat: 40.7220, minLon: -74.0050, maxLat: 40.7280, maxLon: -73.9980),
        "west-village":         NeighborhoodBounds(minLat: 40.7330, minLon: -74.0070, maxLat: 40.7380, maxLon: -74.0010),
        "greenwich-village":    NeighborhoodBounds(minLat: 40.7280, minLon: -74.0010, maxLat: 40.7350, maxLon: -73.9950),
        "east-village":         NeighborhoodBounds(minLat: 40.7230, minLon: -73.9950, maxLat: 40.7300, maxLon: -73.9800),
        "lower-east-side":      NeighborhoodBounds(minLat: 40.7140, minLon: -73.9920, maxLat: 40.7230, maxLon: -73.9780),
        "chinatown":            NeighborhoodBounds(minLat: 40.7130, minLon: -74.0040, maxLat: 40.7180, maxLon: -73.9960),
        "noho":                 NeighborhoodBounds(minLat: 40.7270, minLon: -73.9980, maxLat: 40.7300, maxLon: -73.9930),
        "nolita":               NeighborhoodBounds(minLat: 40.7230, minLon: -73.9970, maxLat: 40.7260, maxLon: -73.9930),
        "little-italy":         NeighborhoodBounds(minLat: 40.7185, minLon: -74.0010, maxLat: 40.7230, maxLon: -73.9960),
        "midtown":              NeighborhoodBounds(minLat: 40.7480, minLon: -73.9990, maxLat: 40.7620, maxLon: -73.9730),
        "hells-kitchen":        NeighborhoodBounds(minLat: 40.7540, minLon: -74.0050, maxLat: 40.7680, maxLon: -73.9950),
        "chelsea":              NeighborhoodBounds(minLat: 40.7420, minLon: -74.0050, maxLat: 40.7520, maxLon: -73.9960),
        "flatiron":             NeighborhoodBounds(minLat: 40.7380, minLon: -73.9960, maxLat: 40.7440, maxLon: -73.9880),
        "gramercy":             NeighborhoodBounds(minLat: 40.7360, minLon: -73.9890, maxLat: 40.7420, maxLon: -73.9820),
        "murray-hill":          NeighborhoodBounds(minLat: 40.7460, minLon: -73.9860, maxLat: 40.7520, maxLon: -73.9760),
        "upper-east-side":      NeighborhoodBounds(minLat: 40.7640, minLon: -73.9680, maxLat: 40.7960, maxLon: -73.9490),
        "upper-west-side":      NeighborhoodBounds(minLat: 40.7740, minLon: -73.9920, maxLat: 40.8000, maxLon: -73.9680),
        "harlem":               NeighborhoodBounds(minLat: 40.8040, minLon: -73.9640, maxLat: 40.8240, maxLon: -73.9330),
        "spanish-harlem":       NeighborhoodBounds(minLat: 40.7920, minLon: -73.9490, maxLat: 40.8040, maxLon: -73.9340),
        "washington-heights":   NeighborhoodBounds(minLat: 40.8380, minLon: -73.9460, maxLat: 40.8680, maxLon: -73.9190),
        "inwood":               NeighborhoodBounds(minLat: 40.8680, minLon: -73.9330, maxLat: 40.8740, maxLon: -73.9130),
        "morningside-heights":  NeighborhoodBounds(minLat: 40.8050, minLon: -73.9700, maxLat: 40.8130, maxLon: -73.9580),
        // Brooklyn
        "dumbo":                NeighborhoodBounds(minLat: 40.7010, minLon: -73.9920, maxLat: 40.7050, maxLon: -73.9830),
        "brooklyn-heights":     NeighborhoodBounds(minLat: 40.6940, minLon: -73.9990, maxLat: 40.7030, maxLon: -73.9930),
        "cobble-hill":          NeighborhoodBounds(minLat: 40.6860, minLon: -73.9970, maxLat: 40.6930, maxLon: -73.9920),
        "carroll-gardens":      NeighborhoodBounds(minLat: 40.6780, minLon: -73.9990, maxLat: 40.6850, maxLon: -73.9940),
        "red-hook":             NeighborhoodBounds(minLat: 40.6710, minLon: -74.0120, maxLat: 40.6810, maxLon: -74.0010),
        "park-slope":           NeighborhoodBounds(minLat: 40.6640, minLon: -73.9900, maxLat: 40.6840, maxLon: -73.9780),
        "boerum-hill":          NeighborhoodBounds(minLat: 40.6850, minLon: -73.9920, maxLat: 40.6920, maxLon: -73.9840),
        "fort-greene":          NeighborhoodBounds(minLat: 40.6860, minLon: -73.9800, maxLat: 40.6940, maxLon: -73.9730),
        "clinton-hill":         NeighborhoodBounds(minLat: 40.6860, minLon: -73.9720, maxLat: 40.6950, maxLon: -73.9620),
        "prospect-heights":     NeighborhoodBounds(minLat: 40.6740, minLon: -73.9690, maxLat: 40.6850, maxLon: -73.9610),
        "crown-heights":        NeighborhoodBounds(minLat: 40.6620, minLon: -73.9560, maxLat: 40.6780, maxLon: -73.9360),
        "williamsburg":         NeighborhoodBounds(minLat: 40.7030, minLon: -73.9700, maxLat: 40.7200, maxLon: -73.9430),
        "greenpoint":           NeighborhoodBounds(minLat: 40.7220, minLon: -73.9560, maxLat: 40.7340, maxLon: -73.9440),
        "bushwick":             NeighborhoodBounds(minLat: 40.6940, minLon: -73.9260, maxLat: 40.7070, maxLon: -73.9070),
        "bed-stuy":             NeighborhoodBounds(minLat: 40.6770, minLon: -73.9560, maxLat: 40.6970, maxLon: -73.9230),
        "flatbush":             NeighborhoodBounds(minLat: 40.6360, minLon: -73.9740, maxLat: 40.6540, maxLon: -73.9510),
        "sunset-park":          NeighborhoodBounds(minLat: 40.6420, minLon: -74.0120, maxLat: 40.6590, maxLon: -73.9930),
        "bay-ridge":            NeighborhoodBounds(minLat: 40.6130, minLon: -74.0340, maxLat: 40.6370, maxLon: -74.0130),
        // Queens
        "astoria":              NeighborhoodBounds(minLat: 40.7670, minLon: -73.9390, maxLat: 40.7830, maxLon: -73.9090),
        "long-island-city":     NeighborhoodBounds(minLat: 40.7400, minLon: -73.9530, maxLat: 40.7560, maxLon: -73.9280),
        "jackson-heights":      NeighborhoodBounds(minLat: 40.7490, minLon: -73.8980, maxLat: 40.7590, maxLon: -73.8750),
        "flushing":             NeighborhoodBounds(minLat: 40.7610, minLon: -73.8380, maxLat: 40.7710, maxLon: -73.8180),
        "forest-hills":         NeighborhoodBounds(minLat: 40.7140, minLon: -73.8570, maxLat: 40.7260, maxLon: -73.8340),
        "jamaica":              NeighborhoodBounds(minLat: 40.6940, minLon: -73.8160, maxLat: 40.7120, maxLon: -73.7880),
        // The Bronx
        "south-bronx":          NeighborhoodBounds(minLat: 40.8090, minLon: -73.9290, maxLat: 40.8230, maxLon: -73.9060),
        "fordham":              NeighborhoodBounds(minLat: 40.8570, minLon: -73.9010, maxLat: 40.8700, maxLon: -73.8820),
        "riverdale":            NeighborhoodBounds(minLat: 40.8830, minLon: -73.9290, maxLat: 40.9020, maxLon: -73.9060),
        "mott-haven":           NeighborhoodBounds(minLat: 40.8040, minLon: -73.9280, maxLat: 40.8120, maxLon: -73.9130),
    ]

    static let neighborhoods: [Neighborhood] = {
        let manhattan: [(String, String, Neighborhood.Borough)] = [
            ("financial-district",  "Financial District",  .manhattan),
            ("tribeca",             "Tribeca",             .manhattan),
            ("soho",                "SoHo",                .manhattan),
            ("west-village",        "West Village",        .manhattan),
            ("greenwich-village",   "Greenwich Village",   .manhattan),
            ("east-village",        "East Village",        .manhattan),
            ("lower-east-side",     "Lower East Side",     .manhattan),
            ("chinatown",           "Chinatown",           .manhattan),
            ("noho",                "NoHo",                .manhattan),
            ("nolita",              "Nolita",              .manhattan),
            ("little-italy",        "Little Italy",        .manhattan),
            ("midtown",             "Midtown",             .manhattan),
            ("hells-kitchen",       "Hell's Kitchen",      .manhattan),
            ("chelsea",             "Chelsea",             .manhattan),
            ("flatiron",            "Flatiron",            .manhattan),
            ("gramercy",            "Gramercy",            .manhattan),
            ("murray-hill",         "Murray Hill",         .manhattan),
            ("upper-east-side",     "Upper East Side",     .manhattan),
            ("upper-west-side",     "Upper West Side",     .manhattan),
            ("harlem",              "Harlem",              .manhattan),
            ("spanish-harlem",      "Spanish Harlem",      .manhattan),
            ("washington-heights",  "Washington Heights",  .manhattan),
            ("inwood",              "Inwood",              .manhattan),
            ("morningside-heights", "Morningside Heights", .manhattan),
        ]
        let brooklyn: [(String, String, Neighborhood.Borough)] = [
            ("dumbo",           "DUMBO",            .brooklyn),
            ("brooklyn-heights","Brooklyn Heights", .brooklyn),
            ("cobble-hill",     "Cobble Hill",      .brooklyn),
            ("carroll-gardens", "Carroll Gardens",  .brooklyn),
            ("red-hook",        "Red Hook",         .brooklyn),
            ("park-slope",      "Park Slope",       .brooklyn),
            ("boerum-hill",     "Boerum Hill",      .brooklyn),
            ("fort-greene",     "Fort Greene",      .brooklyn),
            ("clinton-hill",    "Clinton Hill",     .brooklyn),
            ("prospect-heights","Prospect Heights", .brooklyn),
            ("crown-heights",   "Crown Heights",    .brooklyn),
            ("williamsburg",    "Williamsburg",     .brooklyn),
            ("greenpoint",      "Greenpoint",       .brooklyn),
            ("bushwick",        "Bushwick",         .brooklyn),
            ("bed-stuy",        "Bed-Stuy",         .brooklyn),
            ("flatbush",        "Flatbush",         .brooklyn),
            ("sunset-park",     "Sunset Park",      .brooklyn),
            ("bay-ridge",       "Bay Ridge",        .brooklyn),
        ]
        let queens: [(String, String, Neighborhood.Borough)] = [
            ("astoria",          "Astoria",         .queens),
            ("long-island-city", "Long Island City",.queens),
            ("jackson-heights",  "Jackson Heights", .queens),
            ("flushing",         "Flushing",        .queens),
            ("forest-hills",     "Forest Hills",    .queens),
            ("jamaica",          "Jamaica",         .queens),
        ]
        let bronx: [(String, String, Neighborhood.Borough)] = [
            ("south-bronx", "South Bronx", .bronx),
            ("fordham",     "Fordham",     .bronx),
            ("riverdale",   "Riverdale",   .bronx),
            ("mott-haven",  "Mott Haven",  .bronx),
        ]
        return (manhattan + brooklyn + queens + bronx).map { id, name, borough in
            Neighborhood(id: id, name: name, borough: borough)
        }
    }()
}
