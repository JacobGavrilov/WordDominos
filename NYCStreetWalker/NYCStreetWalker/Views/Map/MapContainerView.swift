import SwiftUI
import MapKit

// MARK: - Tagged Polyline

class TaggedPolyline: MKPolyline {
    var streetID: String = ""
    var streetName: String = ""
    var walkedByUserIDs: Set<String> = []
}

// MARK: - MapContainerView

struct MapContainerView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedStreet: Street?
    @State private var showStreetCallout: Bool = false

    var body: some View {
        ZStack {
            NYCMapView(selectedStreet: $selectedStreet)
                .ignoresSafeArea()

            if let street = selectedStreet {
                VStack {
                    streetCallout(street)
                        .padding(.top, 50)
                        .padding(.horizontal, 16)
                    Spacer()
                }
            }
        }
        .onChange(of: appState.neighborhoods) { _ in
            selectedStreet = nil
        }
    }

    @ViewBuilder
    private func streetCallout(_ street: Street) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(street.name)
                    .font(.headline)
                Spacer()
                Button { selectedStreet = nil } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }

            let walkers = walkersLabel(for: street)
            if walkers.isEmpty {
                Text("Not yet walked")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                Text("Walked by: \(walkers)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .shadow(radius: 4)
    }

    private func walkersLabel(for street: Street) -> String {
        var names: [String] = []
        if let user = appState.currentUser, street.isWalkedBy(user.id) {
            names.append("You")
        }
        for friend in appState.friends where street.isWalkedBy(friend.id) {
            names.append(friend.displayName)
        }
        return names.joined(separator: ", ")
    }
}

// MARK: - UIKit Map Bridge

struct NYCMapView: UIViewRepresentable {
    @EnvironmentObject var appState: AppState
    @Binding var selectedStreet: Street?

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.showsUserLocation = true
        map.showsCompass = true
        map.showsScale = true
        map.isRotateEnabled = true
        map.isPitchEnabled = false

        // Center on Manhattan
        let center = CLLocationCoordinate2D(latitude: 40.7580, longitude: -73.9855)
        let region = MKCoordinateRegion(center: center,
                                        latitudinalMeters: 5000,
                                        longitudinalMeters: 5000)
        map.setRegion(region, animated: false)

        let tap = UITapGestureRecognizer(target: context.coordinator,
                                         action: #selector(Coordinator.handleTap(_:)))
        map.addGestureRecognizer(tap)

        context.coordinator.mapView = map
        return map
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        context.coordinator.updateOverlays(mapView: mapView)
        if appState.isTracking {
            mapView.userTrackingMode = .follow
        } else {
            mapView.userTrackingMode = .none
        }
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, MKMapViewDelegate {
        var parent: NYCMapView
        weak var mapView: MKMapView?
        private var renderedStreetIDs = Set<String>()

        init(parent: NYCMapView) {
            self.parent = parent
        }

        func updateOverlays(mapView: MKMapView) {
            let allStreets = parent.appState.neighborhoods.flatMap(\.streets)
            let newIDs = Set(allStreets.map(\.id))
            guard newIDs != renderedStreetIDs else { return }

            mapView.removeOverlays(mapView.overlays)
            renderedStreetIDs.removeAll()

            for street in allStreets {
                guard street.coordinates.count >= 2 else { continue }
                let poly = TaggedPolyline(coordinates: street.coordinates,
                                          count: street.coordinates.count)
                poly.streetID = street.id
                poly.streetName = street.name
                poly.walkedByUserIDs = street.walkedByUserIDs
                mapView.addOverlay(poly, level: .aboveRoads)
                renderedStreetIDs.insert(street.id)
            }
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let poly = overlay as? TaggedPolyline else {
                return MKOverlayRenderer(overlay: overlay)
            }

            let renderer = StreetPolylineRenderer(polyline: poly)
            let userID = parent.appState.currentUser?.id ?? ""
            let walkedByMe = poly.walkedByUserIDs.contains(userID)
            let friendColors = parent.appState.friends.compactMap { friend -> UIColor? in
                guard poly.walkedByUserIDs.contains(friend.id) else { return nil }
                return UIColor(Color(hex: friend.colorHex) ?? .blue)
            }

            if walkedByMe && !friendColors.isEmpty {
                renderer.walkState = .walkedByBoth(myColor: UIColor.systemGreen,
                                                    friendColor: friendColors.first!)
            } else if walkedByMe {
                renderer.walkState = .walkedByMe
            } else if let fc = friendColors.first {
                renderer.walkState = .walkedByFriend(color: fc)
            } else {
                renderer.walkState = .unwalked
            }

            return renderer
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let mapView else { return }
            let point = gesture.location(in: mapView)
            let coord = mapView.convert(point, toCoordinateFrom: mapView)
            let tapLocation = CLLocation(latitude: coord.latitude, longitude: coord.longitude)

            // Find nearest walked street within 30m
            var nearestStreet: Street?
            var nearestDist = Double.infinity

            let streets = parent.appState.neighborhoods.flatMap(\.streets)
            let service = parent.appState.streetMatchingService
            for street in streets {
                for i in 0..<max(0, street.coordinates.count - 1) {
                    let d = service.distanceToSegment(point: coord,
                                                      segStart: street.coordinates[i],
                                                      segEnd: street.coordinates[i + 1])
                    if d < nearestDist {
                        nearestDist = d
                        nearestStreet = street
                    }
                }
            }

            if nearestDist < 30 {
                DispatchQueue.main.async {
                    self.parent.selectedStreet = nearestStreet
                }
            } else {
                DispatchQueue.main.async {
                    self.parent.selectedStreet = nil
                }
            }
        }
    }
}
