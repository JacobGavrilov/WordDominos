import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: Int = 0

    var body: some View {
        if appState.isSignedIn {
            mainTabView
        } else {
            SignInView()
        }
    }

    private var mainTabView: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                mapTab
                    .tabItem {
                        Label("Map", systemImage: "map.fill")
                    }
                    .tag(0)

                NeighborhoodListView()
                    .tabItem {
                        Label("Neighborhoods", systemImage: "building.2.fill")
                    }
                    .tag(1)

                FriendsView()
                    .tabItem {
                        Label("Friends", systemImage: "person.2.fill")
                    }
                    .tag(2)

                ProfileView()
                    .tabItem {
                        Label("Profile", systemImage: "person.circle.fill")
                    }
                    .tag(3)
            }
        }
    }

    private var mapTab: some View {
        ZStack(alignment: .bottom) {
            MapContainerView()

            VStack(spacing: 0) {
                if appState.isTracking {
                    trackingIndicatorBar
                }

                startStopButton
                    .padding(.bottom, 90)
            }
        }
    }

    private var trackingIndicatorBar: some View {
        HStack(spacing: 16) {
            Circle()
                .fill(Color.red)
                .frame(width: 8, height: 8)
                .overlay(
                    Circle()
                        .stroke(Color.red.opacity(0.4), lineWidth: 3)
                        .scaleEffect(1.5)
                )

            if let session = appState.currentSession {
                Text(session.formattedDuration)
                    .font(.system(.caption, design: .monospaced))
                    .fontWeight(.semibold)

                Text("·")
                    .foregroundColor(.secondary)

                Text(String(format: "%.2f km", session.distanceMeters / 1000))
                    .font(.caption)
                    .foregroundColor(.secondary)

                Text("·")
                    .foregroundColor(.secondary)

                Text("\(session.matchedStreetIDs.count) streets")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
        .cornerRadius(12)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private var startStopButton: some View {
        Button(action: {
            if appState.isTracking {
                Task { await appState.stopWalk() }
            } else {
                appState.startWalk()
            }
        }) {
            HStack(spacing: 10) {
                Image(systemName: appState.isTracking ? "stop.circle.fill" : "figure.walk.circle.fill")
                    .font(.title2)

                Text(appState.isTracking ? "Stop Walk" : "Start Walk")
                    .fontWeight(.semibold)
            }
            .foregroundColor(.white)
            .padding(.horizontal, 28)
            .padding(.vertical, 14)
            .background(appState.isTracking ? Color.red : Color.green)
            .clipShape(Capsule())
            .shadow(color: .black.opacity(0.25), radius: 8, x: 0, y: 4)
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Sign In View

struct SignInView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.blue.opacity(0.8), Color.green.opacity(0.6)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 12) {
                    Image(systemName: "map.fill")
                        .font(.system(size: 72))
                        .foregroundColor(.white)

                    Text("NYC Street Walker")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .foregroundColor(.white)

                    Text("Track every street you've walked\nacross New York City")
                        .font(.body)
                        .foregroundColor(.white.opacity(0.85))
                        .multilineTextAlignment(.center)
                }

                Spacer()

                VStack(spacing: 16) {
                    if appState.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .scaleEffect(1.2)
                    } else {
                        SignInWithAppleButton()
                            .environmentObject(appState)
                    }

                    if let error = appState.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.8))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }
                .padding(.bottom, 50)
            }
            .padding()
        }
    }
}

// MARK: - Sign In With Apple Button

struct SignInWithAppleButton: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Button(action: {
            Task { await appState.signInWithApple() }
        }) {
            HStack(spacing: 12) {
                Image(systemName: "applelogo")
                    .font(.title3)
                Text("Sign in with Apple")
                    .fontWeight(.semibold)
            }
            .foregroundColor(.black)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 32)
    }
}
