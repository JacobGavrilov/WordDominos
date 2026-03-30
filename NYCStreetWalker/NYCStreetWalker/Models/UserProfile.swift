import Foundation
import SwiftUI

struct UserProfile: Identifiable, Codable {
    let id: String               // CloudKit record ID
    var displayName: String
    var colorHex: String         // for map overlay color
    var walkedStreetIDs: Set<String>
    var friendIDs: Set<String>
    var joinedAt: Date

    // MARK: - Computed

    var color: Color {
        Color(hex: colorHex) ?? .blue
    }

    var initials: String {
        let parts = displayName.split(separator: " ")
        if parts.count >= 2 {
            return String(parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
        }
        return String(displayName.prefix(2)).uppercased()
    }

    // MARK: - Constants

    static let userColors = [
        "#FF6B6B",
        "#4ECDC4",
        "#45B7D1",
        "#96CEB4",
        "#FFEAA7",
        "#DDA0DD",
        "#98D8C8"
    ]

    static func randomColor() -> String {
        userColors.randomElement() ?? "#4ECDC4"
    }

    // MARK: - Init

    init(id: String,
         displayName: String,
         colorHex: String = UserProfile.randomColor(),
         walkedStreetIDs: Set<String> = [],
         friendIDs: Set<String> = [],
         joinedAt: Date = Date()) {
        self.id = id
        self.displayName = displayName
        self.colorHex = colorHex
        self.walkedStreetIDs = walkedStreetIDs
        self.friendIDs = friendIDs
        self.joinedAt = joinedAt
    }
}

// MARK: - Color Hex Extension

extension Color {
    init?(hex: String) {
        var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("#") { cleaned.removeFirst() }

        guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else { return nil }

        let r = Double((value >> 16) & 0xFF) / 255.0
        let g = Double((value >> 8) & 0xFF) / 255.0
        let b = Double(value & 0xFF) / 255.0
        self.init(red: r, green: g, blue: b)
    }

    var hexString: String {
        guard let components = UIColor(self).cgColor.components, components.count >= 3 else {
            return "#000000"
        }
        let r = Int(components[0] * 255)
        let g = Int(components[1] * 255)
        let b = Int(components[2] * 255)
        return String(format: "#%02X%02X%02X", r, g, b)
    }
}
