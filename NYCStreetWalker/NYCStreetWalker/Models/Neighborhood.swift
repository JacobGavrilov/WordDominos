import Foundation
import CoreLocation

struct Neighborhood: Identifiable, Codable {
    let id: String
    let name: String
    let borough: Borough
    var streets: [Street]

    /// Bounding box used for Overpass API queries
    let boundingBox: BoundingBox

    // MARK: - Borough

    enum Borough: String, Codable, CaseIterable {
        case manhattan    = "Manhattan"
        case brooklyn     = "Brooklyn"
        case queens       = "Queens"
        case bronx        = "The Bronx"
        case statenIsland = "Staten Island"

        var color: String {
            switch self {
            case .manhattan:    return "#FF6B6B"
            case .brooklyn:     return "#4ECDC4"
            case .queens:       return "#45B7D1"
            case .bronx:        return "#96CEB4"
            case .statenIsland: return "#FFEAA7"
            }
        }
    }

    // MARK: - BoundingBox

    struct BoundingBox: Codable {
        let minLat: Double
        let minLon: Double
        let maxLat: Double
        let maxLon: Double

        /// Center coordinate of the bounding box
        var center: CLLocationCoordinate2D {
            CLLocationCoordinate2D(
                latitude: (minLat + maxLat) / 2,
                longitude: (minLon + maxLon) / 2
            )
        }

        /// Overpass API bbox string: south,west,north,east
        var overpassString: String {
            "\(minLat),\(minLon),\(maxLat),\(maxLon)"
        }
    }

    // MARK: - Stats

    var totalStreets: Int { streets.count }

    func walkedCount(by userID: String) -> Int {
        streets.filter { $0.isWalkedBy(userID) }.count
    }

    func completionPercentage(by userID: String) -> Double {
        guard totalStreets > 0 else { return 0 }
        return Double(walkedCount(by: userID)) / Double(totalStreets)
    }

    func unwalkedStreets(by userID: String) -> [Street] {
        streets.filter { !$0.isWalkedBy(userID) }
    }

    func walkedStreets(by userID: String) -> [Street] {
        streets.filter { $0.isWalkedBy(userID) }
    }
}

// MARK: - Pre-defined NYC Neighborhoods

extension Neighborhood {
    // swiftlint:disable function_body_length
    static var nycNeighborhoods: [Neighborhood] {
        [
            // MARK: Manhattan
            Neighborhood(id: "manhattan_financial_district",
                         name: "Financial District",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6998, minLon: -74.0200, maxLat: 40.7115, maxLon: -74.0015)),

            Neighborhood(id: "manhattan_tribeca",
                         name: "Tribeca",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7150, minLon: -74.0160, maxLat: 40.7230, maxLon: -74.0040)),

            Neighborhood(id: "manhattan_soho",
                         name: "SoHo",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7228, minLon: -74.0050, maxLat: 40.7280, maxLon: -73.9960)),

            Neighborhood(id: "manhattan_west_village",
                         name: "West Village",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7280, minLon: -74.0080, maxLat: 40.7360, maxLon: -74.0000)),

            Neighborhood(id: "manhattan_greenwich_village",
                         name: "Greenwich Village",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7280, minLon: -74.0000, maxLat: 40.7360, maxLon: -73.9940)),

            Neighborhood(id: "manhattan_east_village",
                         name: "East Village",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7230, minLon: -73.9950, maxLat: 40.7310, maxLon: -73.9780)),

            Neighborhood(id: "manhattan_lower_east_side",
                         name: "Lower East Side",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7150, minLon: -73.9940, maxLat: 40.7240, maxLon: -73.9780)),

            Neighborhood(id: "manhattan_chinatown",
                         name: "Chinatown",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7130, minLon: -74.0030, maxLat: 40.7185, maxLon: -73.9950)),

            Neighborhood(id: "manhattan_noho",
                         name: "NoHo",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7260, minLon: -74.0000, maxLat: 40.7290, maxLon: -73.9920)),

            Neighborhood(id: "manhattan_nolita",
                         name: "Nolita",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7215, minLon: -73.9990, maxLat: 40.7255, maxLon: -73.9920)),

            Neighborhood(id: "manhattan_little_italy",
                         name: "Little Italy",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7185, minLon: -74.0010, maxLat: 40.7225, maxLon: -73.9960)),

            Neighborhood(id: "manhattan_midtown",
                         name: "Midtown",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7480, minLon: -74.0040, maxLat: 40.7630, maxLon: -73.9700)),

            Neighborhood(id: "manhattan_hells_kitchen",
                         name: "Hell's Kitchen",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7540, minLon: -74.0020, maxLat: 40.7680, maxLon: -73.9920)),

            Neighborhood(id: "manhattan_chelsea",
                         name: "Chelsea",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7420, minLon: -74.0040, maxLat: 40.7520, maxLon: -73.9950)),

            Neighborhood(id: "manhattan_flatiron",
                         name: "Flatiron",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7380, minLon: -73.9960, maxLat: 40.7450, maxLon: -73.9860)),

            Neighborhood(id: "manhattan_gramercy",
                         name: "Gramercy",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7360, minLon: -73.9900, maxLat: 40.7450, maxLon: -73.9780)),

            Neighborhood(id: "manhattan_murray_hill",
                         name: "Murray Hill",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7440, minLon: -73.9850, maxLat: 40.7520, maxLon: -73.9720)),

            Neighborhood(id: "manhattan_kips_bay",
                         name: "Kips Bay",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7360, minLon: -73.9840, maxLat: 40.7440, maxLon: -73.9720)),

            Neighborhood(id: "manhattan_upper_east_side",
                         name: "Upper East Side",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7640, minLon: -73.9700, maxLat: 40.7900, maxLon: -73.9480)),

            Neighborhood(id: "manhattan_upper_west_side",
                         name: "Upper West Side",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7640, minLon: -73.9950, maxLat: 40.8000, maxLon: -73.9700)),

            Neighborhood(id: "manhattan_harlem",
                         name: "Harlem",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.8000, minLon: -73.9600, maxLat: 40.8200, maxLon: -73.9300)),

            Neighborhood(id: "manhattan_spanish_harlem",
                         name: "Spanish Harlem",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7940, minLon: -73.9500, maxLat: 40.8060, maxLon: -73.9280)),

            Neighborhood(id: "manhattan_washington_heights",
                         name: "Washington Heights",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.8400, minLon: -73.9450, maxLat: 40.8680, maxLon: -73.9200)),

            Neighborhood(id: "manhattan_inwood",
                         name: "Inwood",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.8680, minLon: -73.9360, maxLat: 40.8820, maxLon: -73.9150)),

            Neighborhood(id: "manhattan_morningside_heights",
                         name: "Morningside Heights",
                         borough: .manhattan,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.8030, minLon: -73.9700, maxLat: 40.8150, maxLon: -73.9540)),

            // MARK: Brooklyn
            Neighborhood(id: "brooklyn_dumbo",
                         name: "DUMBO",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7020, minLon: -73.9920, maxLat: 40.7060, maxLon: -73.9850)),

            Neighborhood(id: "brooklyn_brooklyn_heights",
                         name: "Brooklyn Heights",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6940, minLon: -74.0040, maxLat: 40.7020, maxLon: -73.9920)),

            Neighborhood(id: "brooklyn_cobble_hill",
                         name: "Cobble Hill",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6860, minLon: -74.0020, maxLat: 40.6940, maxLon: -73.9940)),

            Neighborhood(id: "brooklyn_carroll_gardens",
                         name: "Carroll Gardens",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6780, minLon: -74.0040, maxLat: 40.6860, maxLon: -73.9960)),

            Neighborhood(id: "brooklyn_red_hook",
                         name: "Red Hook",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6720, minLon: -74.0200, maxLat: 40.6800, maxLon: -74.0000)),

            Neighborhood(id: "brooklyn_park_slope",
                         name: "Park Slope",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6620, minLon: -73.9960, maxLat: 40.6820, maxLon: -73.9800)),

            Neighborhood(id: "brooklyn_boerum_hill",
                         name: "Boerum Hill",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6850, minLon: -73.9940, maxLat: 40.6920, maxLon: -73.9820)),

            Neighborhood(id: "brooklyn_fort_greene",
                         name: "Fort Greene",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6880, minLon: -73.9820, maxLat: 40.6960, maxLon: -73.9700)),

            Neighborhood(id: "brooklyn_clinton_hill",
                         name: "Clinton Hill",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6880, minLon: -73.9700, maxLat: 40.6980, maxLon: -73.9580)),

            Neighborhood(id: "brooklyn_prospect_heights",
                         name: "Prospect Heights",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6740, minLon: -73.9720, maxLat: 40.6820, maxLon: -73.9580)),

            Neighborhood(id: "brooklyn_crown_heights",
                         name: "Crown Heights",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6660, minLon: -73.9580, maxLat: 40.6780, maxLon: -73.9360)),

            Neighborhood(id: "brooklyn_williamsburg",
                         name: "Williamsburg",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7040, minLon: -73.9660, maxLat: 40.7220, maxLon: -73.9380)),

            Neighborhood(id: "brooklyn_greenpoint",
                         name: "Greenpoint",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7220, minLon: -73.9660, maxLat: 40.7380, maxLon: -73.9440)),

            Neighborhood(id: "brooklyn_bushwick",
                         name: "Bushwick",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6940, minLon: -73.9380, maxLat: 40.7060, maxLon: -73.9120)),

            Neighborhood(id: "brooklyn_bed_stuy",
                         name: "Bed-Stuy",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6800, minLon: -73.9520, maxLat: 40.6980, maxLon: -73.9240)),

            Neighborhood(id: "brooklyn_flatbush",
                         name: "Flatbush",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6340, minLon: -73.9700, maxLat: 40.6580, maxLon: -73.9440)),

            Neighborhood(id: "brooklyn_sunset_park",
                         name: "Sunset Park",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6440, minLon: -74.0160, maxLat: 40.6620, maxLon: -73.9980)),

            Neighborhood(id: "brooklyn_bay_ridge",
                         name: "Bay Ridge",
                         borough: .brooklyn,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6200, minLon: -74.0360, maxLat: 40.6440, maxLon: -74.0060)),

            // MARK: Queens
            Neighborhood(id: "queens_astoria",
                         name: "Astoria",
                         borough: .queens,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7600, minLon: -73.9440, maxLat: 40.7800, maxLon: -73.9080)),

            Neighborhood(id: "queens_long_island_city",
                         name: "Long Island City",
                         borough: .queens,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7380, minLon: -73.9560, maxLat: 40.7620, maxLon: -73.9220)),

            Neighborhood(id: "queens_jackson_heights",
                         name: "Jackson Heights",
                         borough: .queens,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7460, minLon: -73.9020, maxLat: 40.7620, maxLon: -73.8780)),

            Neighborhood(id: "queens_flushing",
                         name: "Flushing",
                         borough: .queens,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7540, minLon: -73.8360, maxLat: 40.7740, maxLon: -73.8020)),

            Neighborhood(id: "queens_forest_hills",
                         name: "Forest Hills",
                         borough: .queens,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.7140, minLon: -73.8560, maxLat: 40.7280, maxLon: -73.8360)),

            Neighborhood(id: "queens_jamaica",
                         name: "Jamaica",
                         borough: .queens,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.6960, minLon: -73.8200, maxLat: 40.7100, maxLon: -73.7860)),

            // MARK: Bronx
            Neighborhood(id: "bronx_south_bronx",
                         name: "South Bronx",
                         borough: .bronx,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.8080, minLon: -73.9300, maxLat: 40.8280, maxLon: -73.8980)),

            Neighborhood(id: "bronx_fordham",
                         name: "Fordham",
                         borough: .bronx,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.8560, minLon: -73.9040, maxLat: 40.8720, maxLon: -73.8780)),

            Neighborhood(id: "bronx_riverdale",
                         name: "Riverdale",
                         borough: .bronx,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.8840, minLon: -73.9240, maxLat: 40.9040, maxLon: -73.9000)),

            Neighborhood(id: "bronx_mott_haven",
                         name: "Mott Haven",
                         borough: .bronx,
                         streets: [],
                         boundingBox: BoundingBox(minLat: 40.8040, minLon: -73.9280, maxLat: 40.8180, maxLon: -73.9100)),
        ]
    }
    // swiftlint:enable function_body_length
}
