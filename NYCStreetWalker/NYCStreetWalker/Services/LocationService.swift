import Foundation
import CoreLocation
import Combine

class LocationService: NSObject, ObservableObject {
    private let manager = CLLocationManager()

    @Published var currentLocation: CLLocation?
    @Published var locationTrack: [CLLocation] = []
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var isTracking: Bool = false

    private let minAccuracyMeters: Double = 30

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = 5
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
    }

    func requestAuthorization() {
        manager.requestAlwaysAuthorization()
    }

    func startTracking() {
        guard !isTracking else { return }
        locationTrack.removeAll()
        manager.startUpdatingLocation()
        isTracking = true
    }

    func stopTracking() {
        guard isTracking else { return }
        manager.stopUpdatingLocation()
        isTracking = false
    }

    func clearTrack() {
        locationTrack.removeAll()
    }
}

extension LocationService: CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        DispatchQueue.main.async {
            self.authorizationStatus = manager.authorizationStatus
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let valid = locations.filter {
            $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy <= minAccuracyMeters
        }
        guard !valid.isEmpty else { return }
        DispatchQueue.main.async {
            self.currentLocation = valid.last
            if self.isTracking {
                self.locationTrack.append(contentsOf: valid)
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[LocationService] \(error.localizedDescription)")
    }
}
