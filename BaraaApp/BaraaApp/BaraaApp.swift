// BaraaApp.swift
// مشروع بارع بجمعية الراحين
// iOS 26 - Liquid Glass Design

import SwiftUI

@main
struct BaraaApp: App {
    @State private var dataService = DataService()
    @State private var authService = AuthService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(dataService)
                .environment(authService)
                .environment(\.layoutDirection, .rightToLeft)
                .task {
                    // جلب المستخدمين الموحّدين والبيانات بالتوازي
                    async let usersTask: () = authService.fetchSharedUsers()
                    async let dataTask: () = dataService.loadData()
                    _ = await (usersTask, dataTask)
                    authService.isReady = true
                    SmartAlerts.scheduleWeeklyNotification()
                }
        }
    }
}

// MARK: - الشاشة الجذرية: تسجيل الدخول أو المحتوى
struct RootView: View {
    @Environment(AuthService.self) private var auth
    @Environment(DataService.self) private var data

    var body: some View {
        Group {
            if !auth.isReady {
                // شاشة تحميل أثناء جلب المستخدمين
                SplashView()
            } else if auth.isLoggedIn {
                ContentView()
            } else {
                LoginView()
            }
        }
        .animation(.smooth(duration: 0.4), value: auth.isLoggedIn)
        .animation(.smooth(duration: 0.4), value: auth.isReady)
    }
}

// MARK: - شاشة التحميل
struct SplashView: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack {
            AnimatedGradientBackground().ignoresSafeArea()
            VStack(spacing: 20) {
                Image(systemName: "shield.checkered")
                    .font(.system(size: 64))
                    .foregroundStyle(Color.baraTealDark)

                Text(AppConfig.projectName)
                    .font(.title2.bold())
                    .foregroundStyle(scheme == .dark ? .white : Color.baraTealDark)

                ProgressView()
                    .tint(Color.baraTealDark)

                Text("جارٍ تحميل البيانات...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }
}
