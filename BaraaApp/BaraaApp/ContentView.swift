import SwiftUI

struct ContentView: View {
    @Environment(DataService.self) private var data
    @Environment(AuthService.self) private var auth
    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var hSizeClass
    @State private var showSemesterPicker = false
    @State private var showExportSheet = false
    @State private var showProfileSheet = false
    @State private var pdfData: Data?

    private var userRole: UserRole {
        auth.currentUser?.role ?? .executor // لن يحدث لأن الدخول إلزامي
    }

    private var allowedTabs: [AppTab] {
        AppTab.allowedTabs(for: userRole)
    }

    var body: some View {
        TabView {
            if allowedTabs.contains(.overview) {
                Tab("النظرة العامة", systemImage: "chart.bar.fill") {
                    tabPage { OverviewView() }
                }
            }
            if allowedTabs.contains(.stages) {
                Tab("المراحل", systemImage: "building.2.fill") {
                    tabPage { StagesView() }
                }
            }
            if allowedTabs.contains(.teams) {
                Tab("الفرق", systemImage: "person.3.fill") {
                    tabPage { TeamsView() }
                }
            }
            if allowedTabs.contains(.quality) {
                Tab("الجودة", systemImage: "star.fill") {
                    tabPage { QualityView() }
                }
            }
            if allowedTabs.contains(.analytics) {
                Tab("التحليلات", systemImage: "chart.line.uptrend.xyaxis") {
                    tabPage { AnalyticsView() }
                }
            }
            if allowedTabs.contains(.comparison) {
                Tab("المقارنة", systemImage: "arrow.left.arrow.right") {
                    tabPage { SemesterComparisonView() }
                }
            }
            if allowedTabs.contains(.search) {
                Tab("البحث", systemImage: "magnifyingglass") {
                    tabPage { SearchView() }
                }
            }
            if allowedTabs.contains(.alerts) {
                Tab("التنبيهات", systemImage: "bell.badge.fill") {
                    tabPage { AlertsView() }
                }
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        .background { SyncBanner() }
        .overlay {
            if hSizeClass == .compact {
                DynamicIslandBanner()
            }
        }
        .sheet(isPresented: $showSemesterPicker) {
            FilterSheet()
        }
        .sheet(isPresented: $showExportSheet) {
            if let pdf = pdfData {
                ShareSheet(items: [pdf])
            }
        }
        .sheet(isPresented: $showProfileSheet) {
            ProfileSheet()
        }
        .environment(\.layoutDirection, .rightToLeft)
        .onChange(of: auth.currentUser) { _, newUser in
            applyRoleFilter(newUser)
        }
        .onAppear {
            applyRoleFilter(auth.currentUser)
        }
    }

    private func applyRoleFilter(_ user: AppUser?) {
        guard let user = user else {
            data.roleTeamFilter = nil
            data.roleStageFilter = nil
            return
        }
        switch user.role {
        case .admin:
            data.roleTeamFilter = nil
            data.roleStageFilter = nil
        case .leader:
            data.roleTeamFilter = nil  // قائد الفريق يرى الكل لكن البيانات مفلترة بمرحلته
            data.roleStageFilter = user.stage
        case .executor:
            data.roleTeamFilter = user.team
            data.roleStageFilter = nil
        }
    }

    // MARK: - غلاف مشترك لكل تبويبة
    private func tabPage<V: View>(@ViewBuilder _ content: () -> V) -> some View {
        NavigationStack {
            ZStack {
                AnimatedGradientBackground().ignoresSafeArea()
                VStack(spacing: 0) {
                    if hSizeClass == .compact {
                        SyncStatusBar()
                    }
                    content()
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    profileButton
                }
                ToolbarItem(placement: .topBarLeading) {
                    filterButton
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if userRole == .admin || userRole == .leader {
                        Button {
                            pdfData = PDFExporter.generateReport(data: data)
                            showExportSheet = true
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundStyle(toolbarColor)
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    RefreshButton(isLoading: data.isLoading, color: toolbarColor) {
                        Task { await data.refresh() }
                    }
                }
            }
            .navigationTitle(AppConfig.projectName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(scheme == .dark ? .dark : .light, for: .navigationBar)
        }
    }

    // MARK: - مشترك
    private var profileButton: some View {
        Button { showProfileSheet = true } label: {
            HStack(spacing: 5) {
                Image(systemName: auth.currentUser?.role.icon ?? "person.circle")
                if let user = auth.currentUser {
                    Text(user.name)
                        .font(.caption2)
                        .lineLimit(1)
                }
            }
            .foregroundStyle(toolbarColor)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(toolbarColor.opacity(0.12))
            .clipShape(Capsule())
        }
    }

    private var filterButton: some View {
        Button { showSemesterPicker = true } label: {
            HStack(spacing: 5) {
                Image(systemName: "calendar")
                Text(filterLabel)
                    .font(.subheadline)
                if data.isFiltered {
                    Image(systemName: "line.3.horizontal.decrease.circle.fill")
                        .font(.caption)
                }
            }
            .foregroundStyle(toolbarColor)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(data.isFiltered
                        ? toolbarColor.opacity(0.22)
                        : toolbarColor.opacity(0.12))
            .clipShape(Capsule())
        }
    }

    private var toolbarColor: Color {
        scheme == .dark ? .white : Color.baraTealDark
    }

    private var filterLabel: String {
        if data.dateFrom != nil || data.dateTo != nil {
            return "نطاق مخصص"
        }
        switch data.selectedSemesters.count {
        case 0:  return "جميع الفصول"
        case 1:
            let id = data.selectedSemesters.first!
            return AppConfig.semesters.first { $0.id == id }?.label ?? "فصل"
        default:
            return "\(data.selectedSemesters.count.arabicFormatted) فصول"
        }
    }
}

// MARK: - Refresh Button (toolbar)
struct RefreshButton: View {
    let isLoading: Bool
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(color)
        }
        .disabled(isLoading)
    }
}

// MARK: - Sync Now Button (status bar)
struct SyncNowButton: View {
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: "arrow.clockwise")
                    .font(.caption.bold())
                Text("مزامنة الآن")
                    .font(.caption.bold())
            }
            .foregroundStyle(Color.baraAccent)
        }
        .disabled(isLoading)
    }
}

// MARK: - Sync Status Bar (persistent row below nav bar)
struct SyncStatusBar: View {
    @Environment(DataService.self) private var data
    @Environment(\.colorScheme) private var scheme

    private var isConnected: Bool {
        switch data.syncStatus {
        case .failure: return false
        default:       return data.errorMessage == nil
        }
    }

    private var statusColor: Color { isConnected ? .green : .red }
    private var statusLabel: String { isConnected ? "متصل" : "غير متصل" }

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: 5) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 7, height: 7)
                    .overlay(
                        Circle()
                            .fill(statusColor.opacity(0.35))
                            .frame(width: 13, height: 13)
                    )
                Text(statusLabel)
                    .font(.caption)
                    .foregroundStyle(statusColor)
            }
            Spacer()
            SyncNowButton(isLoading: data.isLoading) {
                Task { await data.refresh() }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(
            scheme == .dark
                ? Color.black.opacity(0.25)
                : Color.white.opacity(0.55)
        )
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.primary.opacity(0.08))
                .frame(height: 0.5)
        }
    }
}

// MARK: - Filter Sheet (multi-semester + date range)
struct FilterSheet: View {
    @Environment(DataService.self) private var data
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    @State private var localSemesters: Set<String> = []
    @State private var useDateRange = false
    @State private var localFrom: Date = Calendar.current.date(byAdding: .month, value: -3, to: Date()) ?? Date()
    @State private var localTo: Date = Date()

    private var textColor: Color { scheme == .dark ? .white : Color.baraTealDark }

    var body: some View {
        ZStack {
            AnimatedGradientBackground()
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Button("إغلاق") { dismiss() }
                        .foregroundStyle(textColor.opacity(0.7))
                    Spacer()
                    Text("خيارات الفلترة")
                        .font(.headline.bold())
                        .foregroundStyle(textColor)
                    Spacer()
                    Button("تطبيق") { apply(); dismiss() }
                        .font(.subheadline.bold())
                        .foregroundStyle(Color.baraAccent)
                }
                .padding()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader(title: "الفصول الدراسية")
                            if let currentId = AppConfig.currentSemesterId {
                                Button {
                                    localSemesters = [currentId]
                                    useDateRange = false
                                } label: {
                                    Label("الفصل الحالي", systemImage: "clock.badge.checkmark")
                                        .font(.subheadline.bold())
                                        .foregroundStyle(Color.baraAccent)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(12)
                                        .background(Color.baraAccent.opacity(0.12))
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
                                }
                                .buttonStyle(.plain)
                            }
                            MultiSelectRow(
                                label: "جميع الفصول",
                                systemImage: "calendar.badge.checkmark",
                                isSelected: localSemesters.isEmpty
                            ) {
                                localSemesters = []
                                useDateRange = false
                            }
                            ForEach(AppConfig.semesters) { sem in
                                MultiSelectRow(
                                    label: sem.label,
                                    systemImage: "calendar",
                                    isSelected: localSemesters.contains(sem.id)
                                ) {
                                    if localSemesters.contains(sem.id) {
                                        localSemesters.remove(sem.id)
                                    } else {
                                        localSemesters.insert(sem.id)
                                    }
                                    useDateRange = false
                                }
                            }
                        }

                        Divider().padding(.vertical, 4)

                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Toggle("", isOn: $useDateRange)
                                    .labelsHidden()
                                    .tint(Color.baraAccent)
                                    .onChange(of: useDateRange) { _, on in
                                        if on { localSemesters = [] }
                                    }
                                Spacer()
                                Text("نطاق مخصص (من تاريخ لتاريخ)")
                                    .font(.subheadline.bold())
                                    .foregroundStyle(textColor)
                            }
                            if useDateRange {
                                VStack(alignment: .leading, spacing: 8) {
                                    DateRow(label: "من", date: $localFrom)
                                    DateRow(label: "إلى", date: $localTo)
                                }
                                .transition(.opacity.combined(with: .move(edge: .top)))
                            }
                        }

                        Divider().padding(.vertical, 4)

                        Button {
                            localSemesters = []
                            useDateRange = false
                            apply()
                            dismiss()
                        } label: {
                            Label("عرض كل البيانات", systemImage: "arrow.counterclockwise")
                                .font(.subheadline)
                                .foregroundStyle(Color.baraDanger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(Color.baraDanger.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding()
                    .animation(.spring(response: 0.35), value: useDateRange)
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .environment(\.layoutDirection, .rightToLeft)
        .onAppear {
            localSemesters = data.selectedSemesters
            useDateRange   = data.dateFrom != nil || data.dateTo != nil
            if let f = data.dateFrom { localFrom = f }
            if let t = data.dateTo   { localTo   = t }
        }
    }

    private func apply() {
        data.selectedSemesters = localSemesters
        if useDateRange {
            data.dateFrom = Calendar.current.startOfDay(for: localFrom)
            data.dateTo   = Calendar.current.startOfDay(for: localTo)
        } else {
            data.dateFrom = nil
            data.dateTo   = nil
        }
    }
}

// MARK: - Multi Select Row
struct MultiSelectRow: View {
    let label: String
    let systemImage: String
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? Color.baraAccent : Color.primary.opacity(0.4))
                Spacer()
                Label(label, systemImage: systemImage)
                    .font(.subheadline)
                    .foregroundStyle(scheme == .dark ? Color.white : Color.baraTealDark)
            }
            .padding(12)
            .background(isSelected ? Color.baraAccent.opacity(0.15) : Color.primary.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.baraAccent.opacity(0.4), lineWidth: 1)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Date Row
struct DateRow: View {
    let label: String
    @Binding var date: Date
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack {
            DatePicker("", selection: $date, displayedComponents: .date)
                .datePickerStyle(.compact)
                .labelsHidden()
                .environment(\.calendar, Calendar(identifier: .islamicUmmAlQura))
                .environment(\.locale, Locale(identifier: "ar_SA"))
            Spacer()
            Text(label)
                .font(.subheadline)
                .foregroundStyle(scheme == .dark ? .white : Color.baraTealDark)
        }
        .padding(10)
        .background(Color.primary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Share Sheet
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

// MARK: - Profile Sheet (الملف الشخصي — عرض فقط بدون إدارة مستخدمين)
struct ProfileSheet: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme

    private var textColor: Color { scheme == .dark ? .white : Color.baraTealDark }

    var body: some View {
        NavigationStack {
            ZStack {
                AnimatedGradientBackground()
                ScrollView {
                    VStack(spacing: 20) {
                        // معلومات المستخدم الحالي
                        if let user = auth.currentUser {
                            // بطاقة المستخدم
                            HStack(spacing: 14) {
                                Image(systemName: user.role.icon)
                                    .font(.title)
                                    .foregroundStyle(Color.baraTealDark)
                                    .frame(width: 52, height: 52)
                                    .background(Color.baraAccent.opacity(0.15))
                                    .clipShape(Circle())

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(user.name)
                                        .font(.headline.bold())
                                    Text(user.role.label)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                    if let team = user.team {
                                        Text("فريق \(team)")
                                            .font(.caption)
                                            .foregroundStyle(Color.baraAccent)
                                    }
                                    if let stage = user.stage {
                                        Text("المرحلة \(stage)")
                                            .font(.caption)
                                            .foregroundStyle(Color.baraPrimary)
                                    }
                                }
                                Spacer()
                            }
                            .glassCard(padding: 16)

                            // الصلاحيات
                            VStack(alignment: .leading, spacing: 8) {
                                SectionHeader(title: "صلاحياتك")
                                Text(user.role.description)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)

                                let tabs = AppTab.allowedTabs(for: user.role)
                                FlowLayout(spacing: 4) {
                                    ForEach(tabs, id: \.self) { tab in
                                        Text(tab.rawValue)
                                            .font(.caption2)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.baraAccent.opacity(0.15))
                                            .clipShape(Capsule())
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .glassCard(padding: 14)

                            // مصدر الدخول
                            HStack(spacing: 6) {
                                Image(systemName: auth.isUnifiedMode ? "globe" : "internaldrive")
                                    .foregroundStyle(auth.isUnifiedMode ? .green : .orange)
                                Text(auth.isUnifiedMode ? "دخول موحّد مع المنصة" : "دخول محلي")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(auth.isUnifiedMode ? Color.green.opacity(0.08) : Color.orange.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 8))

                            // ملاحظة إدارة الحسابات
                            HStack(spacing: 8) {
                                Image(systemName: "info.circle.fill")
                                    .foregroundStyle(Color.baraPrimary)
                                Text("لإدارة الحسابات والصلاحيات، استخدم لوحة التحكم في منصة الويب")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(Color.baraPrimary.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 8))

                            // زر تسجيل الخروج
                            Button {
                                auth.logout()
                                dismiss()
                            } label: {
                                Label("تسجيل الخروج", systemImage: "rectangle.portrait.and.arrow.forward")
                                    .font(.subheadline.bold())
                                    .foregroundStyle(Color.baraDanger)
                                    .frame(maxWidth: .infinity)
                                    .padding(14)
                                    .background(Color.baraDanger.opacity(0.12))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("الملف الشخصي")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("إغلاق") { dismiss() }
                        .foregroundStyle(textColor)
                }
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}

// FlowLayout معرّف في SearchView.swift
