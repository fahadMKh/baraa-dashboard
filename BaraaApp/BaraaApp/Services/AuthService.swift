import Foundation
import Observation

// MARK: - أدوار المستخدمين
enum UserRole: String, Codable, CaseIterable, Identifiable {
    case admin    = "admin"
    case leader   = "leader"
    case executor = "executor"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .admin:    return "مشرف"
        case .leader:   return "قائد فريق"
        case .executor: return "منفذ"
        }
    }

    var icon: String {
        switch self {
        case .admin:    return "shield.checkered"
        case .leader:   return "person.badge.key.fill"
        case .executor: return "person.fill"
        }
    }

    var description: String {
        switch self {
        case .admin:    return "يرى كل شيء + لوحة التحكم"
        case .leader:   return "يرى بيانات فريقه والإحصائيات العامة"
        case .executor: return "يرى بطاقاته والنظرة العامة فقط"
        }
    }
}

// MARK: - مستخدم
struct AppUser: Codable, Identifiable, Equatable {
    var id: String { username }
    let name: String
    let username: String
    let passwordHash: String
    let role: UserRole
    /// الفريق — مطلوب لقائد الفريق والمنفذ
    let team: String?
    /// المرحلة — مشتقة من الفريق
    let stage: String?

    static func == (lhs: AppUser, rhs: AppUser) -> Bool {
        lhs.username == rhs.username
    }
}

// MARK: - التبويبات المسموحة لكل دور
enum AppTab: String, CaseIterable {
    case overview    = "النظرة العامة"
    case stages      = "المراحل"
    case teams       = "الفرق"
    case quality     = "الجودة"
    case analytics   = "التحليلات"
    case comparison  = "المقارنة"
    case search      = "البحث"
    case alerts      = "التنبيهات"

    static func allowedTabs(for role: UserRole) -> [AppTab] {
        switch role {
        case .admin:
            return AppTab.allCases
        case .leader:
            return [.overview, .stages, .teams, .quality, .analytics, .comparison, .search, .alerts]
        case .executor:
            return [.overview, .search]
        }
    }
}

// MARK: - خدمة المصادقة
@Observable
@MainActor
final class AuthService {
    // MARK: - حالة الجلسة
    var currentUser: AppUser? = nil
    var isLoggedIn: Bool { currentUser != nil }

    /// هل انتهى تحميل المستخدمين وأصبح التطبيق جاهزاً؟
    var isReady: Bool = false

    // MARK: - قائمة المستخدمين
    private(set) var users: [AppUser] = []

    /// مصدر المستخدمين: "sheet" = موحّد من Google Sheet, "local" = محلي فقط
    private(set) var usersSource: String = "local"

    /// هل تم تحميل المستخدمين من الشيت بنجاح؟
    var isUnifiedMode: Bool { usersSource == "sheet" }

    // MARK: - مفاتيح التخزين
    private let usersKey = "baraa_app_users"
    private let sessionKey = "baraa_app_session"

    init() {
        loadUsers()
        restoreSession()
        // إنشاء مشرف افتراضي إن لم يوجد مستخدمون
        if users.isEmpty {
            let defaultAdmin = AppUser(
                name: "المشرف",
                username: "admin",
                passwordHash: Self.hash("1234"),
                role: .admin,
                team: nil,
                stage: nil
            )
            users.append(defaultAdmin)
            saveUsers()
        }
    }

    // MARK: - جلب المستخدمين الموحّدين من Google Sheet
    /// يجلب قائمة المستخدمين من Google Sheet الموحّد
    /// الأعمدة: username | name | password(base64) | role | team
    func fetchSharedUsers() async {
        guard AppConfig.usersGID != "USERS_GID_HERE" else {
            print("⚠️ لم يتم إعداد GID جدول المستخدمين الموحّد")
            usersSource = "local"
            return
        }

        guard let url = URL(string: AppConfig.usersURL) else { return }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let text = String(data: data, encoding: .utf8) else { return }
            let rows = parseCSV(text)

            // تخطي الصف الأول (العناوين)
            let dataRows = rows.count > 1 ? Array(rows.dropFirst()) : []

            // تحويل الأدوار العربية للإنجليزية
            let arabicRoleMap: [String: UserRole] = [
                "مشرف": .admin,
                "قائد فريق": .leader,
                "قائد": .leader,
                "منفذ": .executor,
            ]

            var sharedUsers: [AppUser] = []
            for row in dataRows {
                guard row.count >= 4 else { continue }
                let username = row[0].trimmingCharacters(in: .whitespaces)
                let name = row[1].trimmingCharacters(in: .whitespaces)
                let rawPassword = row[2].trimmingCharacters(in: .whitespaces)
                let roleStr = row[3].trimmingCharacters(in: .whitespaces)
                let team = row.count > 4 ? row[4].trimmingCharacters(in: .whitespaces) : ""

                guard !username.isEmpty, !name.isEmpty else { continue }

                // دعم الأدوار بالعربي والإنجليزي
                let role = arabicRoleMap[roleStr]
                    ?? UserRole(rawValue: roleStr.lowercased())
                    ?? .executor

                // إذا كلمة المرور غير مشفرة بـ Base64، شفّرها
                let passwordHash: String
                if Data(base64Encoded: rawPassword) != nil && rawPassword.count > 2 {
                    passwordHash = rawPassword // مشفرة بالفعل
                } else {
                    passwordHash = Data(rawPassword.utf8).base64EncodedString() // شفّرها
                }
                let teamVal = team.isEmpty ? nil : team
                let stage = teamVal.flatMap { t in
                    AppConfig.teams.first(where: { $0.value.contains(t) })?.key
                }

                sharedUsers.append(AppUser(
                    name: name,
                    username: username,
                    passwordHash: passwordHash,
                    role: role,
                    team: teamVal,
                    stage: stage
                ))
            }

            if !sharedUsers.isEmpty {
                users = sharedUsers
                usersSource = "sheet"
                saveUsers() // حفظ نسخة محلية كاحتياطي
                print("✅ تم تحميل \(sharedUsers.count) مستخدم من Google Sheet")

                // تحقق أن الجلسة لا تزال صالحة
                if let current = currentUser,
                   !users.contains(where: { $0.username == current.username }) {
                    print("⚠️ المستخدم الحالي غير موجود في القائمة الموحّدة")
                    logout()
                } else if let current = currentUser,
                          let updated = users.first(where: { $0.username == current.username }) {
                    // تحديث بيانات المستخدم الحالي (ربما تغير دوره أو فريقه)
                    currentUser = updated
                    saveSession()
                }
            }
        } catch {
            print("❌ فشل جلب المستخدمين من Google Sheet: \(error)")
            usersSource = "local"
        }
    }

    // MARK: - تحليل CSV بسيط
    private func parseCSV(_ text: String) -> [[String]] {
        var rows: [[String]] = []
        var current = ""
        var inQuotes = false
        var row: [String] = []

        let chars = Array(text)
        var i = 0
        while i < chars.count {
            let char = chars[i]
            let next: Character? = (i + 1 < chars.count) ? chars[i + 1] : nil

            if inQuotes {
                if char == "\"" && next == "\"" {
                    current.append("\"")
                    i += 1
                } else if char == "\"" {
                    inQuotes = false
                } else {
                    current.append(char)
                }
            } else {
                if char == "\"" {
                    inQuotes = true
                } else if char == "," {
                    row.append(current.trimmingCharacters(in: .whitespaces))
                    current = ""
                } else if char == "\n" || (char == "\r" && next == "\n") {
                    row.append(current.trimmingCharacters(in: .whitespaces))
                    if row.contains(where: { !$0.isEmpty }) { rows.append(row) }
                    row = []
                    current = ""
                    if char == "\r" { i += 1 }
                } else {
                    current.append(char)
                }
            }
            i += 1
        }
        if !current.isEmpty || !row.isEmpty {
            row.append(current.trimmingCharacters(in: .whitespaces))
            if row.contains(where: { !$0.isEmpty }) { rows.append(row) }
        }
        return rows
    }

    // MARK: - تسجيل الدخول
    func login(username: String, password: String) -> Bool {
        let hash = Self.hash(password)
        guard let user = users.first(where: { $0.username == username && $0.passwordHash == hash }) else {
            return false
        }
        currentUser = user
        saveSession()
        return true
    }

    // MARK: - تسجيل الخروج
    func logout() {
        currentUser = nil
        UserDefaults.standard.removeObject(forKey: sessionKey)
    }

    // MARK: - إدارة المستخدمين
    func addUser(name: String, username: String, password: String, role: UserRole, team: String?) -> Bool {
        guard !users.contains(where: { $0.username == username }) else { return false }
        let stage = team.flatMap { t in
            AppConfig.teams.first(where: { $0.value.contains(t) })?.key
        }
        let user = AppUser(
            name: name,
            username: username,
            passwordHash: Self.hash(password),
            role: role,
            team: team,
            stage: stage
        )
        users.append(user)
        saveUsers()
        return true
    }

    func removeUser(_ user: AppUser) {
        users.removeAll { $0.username == user.username }
        saveUsers()
        // إذا كان المستخدم الحالي هو المحذوف
        if currentUser?.username == user.username {
            logout()
        }
    }

    func updateUser(_ user: AppUser, name: String, role: UserRole, team: String?, newPassword: String?) {
        guard let idx = users.firstIndex(where: { $0.username == user.username }) else { return }
        let stage = team.flatMap { t in
            AppConfig.teams.first(where: { $0.value.contains(t) })?.key
        }
        let updated = AppUser(
            name: name,
            username: user.username,
            passwordHash: newPassword.map { Self.hash($0) } ?? user.passwordHash,
            role: role,
            team: team,
            stage: stage
        )
        users[idx] = updated
        saveUsers()
        // تحديث الجلسة إن كان المستخدم الحالي
        if currentUser?.username == user.username {
            currentUser = updated
            saveSession()
        }
    }

    // MARK: - التحقق من الصلاحيات
    func canAccess(_ tab: AppTab) -> Bool {
        guard let user = currentUser else { return true } // غير مسجل = مشرف
        return AppTab.allowedTabs(for: user.role).contains(tab)
    }

    /// هل المستخدم يرى بيانات فريق معيّن؟
    func canViewTeam(_ teamName: String) -> Bool {
        guard let user = currentUser else { return true }
        switch user.role {
        case .admin:    return true
        case .leader:   return user.team == teamName
        case .executor: return user.team == teamName
        }
    }

    /// هل المستخدم يرى بيانات مرحلة معيّنة؟
    func canViewStage(_ stageName: String) -> Bool {
        guard let user = currentUser else { return true }
        switch user.role {
        case .admin:    return true
        case .leader:   return user.stage == stageName
        case .executor: return user.stage == stageName
        }
    }

    /// الفرق المسموح للمستخدم رؤيتها
    var allowedTeams: [String]? {
        guard let user = currentUser else { return nil } // nil = الكل
        switch user.role {
        case .admin:    return nil
        case .leader:   return user.team.map { [$0] }
        case .executor: return user.team.map { [$0] }
        }
    }

    /// المرحلة المسموح للمستخدم رؤيتها (nil = الكل)
    var allowedStage: String? {
        guard let user = currentUser else { return nil }
        switch user.role {
        case .admin: return nil
        default:     return user.stage
        }
    }

    // MARK: - تشفير بسيط
    private static func hash(_ password: String) -> String {
        // SHA-like simple hash (base64 لأغراض العرض)
        Data(password.utf8).base64EncodedString()
    }

    // MARK: - حفظ/استعادة
    private func loadUsers() {
        guard let data = UserDefaults.standard.data(forKey: usersKey),
              let decoded = try? JSONDecoder().decode([AppUser].self, from: data) else { return }
        users = decoded
    }

    private func saveUsers() {
        if let encoded = try? JSONEncoder().encode(users) {
            UserDefaults.standard.set(encoded, forKey: usersKey)
        }
    }

    private func saveSession() {
        if let encoded = try? JSONEncoder().encode(currentUser) {
            UserDefaults.standard.set(encoded, forKey: sessionKey)
        }
    }

    private func restoreSession() {
        guard let data = UserDefaults.standard.data(forKey: sessionKey),
              let user = try? JSONDecoder().decode(AppUser.self, from: data) else { return }
        // تأكد أن المستخدم لا يزال موجوداً
        if users.contains(where: { $0.username == user.username }) {
            currentUser = user
        }
    }
}
