import SwiftUI

// MARK: - Brand Colors
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB,
                  red: Double(r) / 255,
                  green: Double(g) / 255,
                  blue: Double(b) / 255,
                  opacity: Double(a) / 255)
    }

    static let baraPrimary   = Color(hex: "4A7EA5")
    static let baraAccent    = Color(hex: "6FA96C")
    static let baraTeal      = Color(hex: "5E9B8A")
    static let baraTealDark  = Color(hex: "3D7A62")
    static let baraWarning   = Color(hex: "E8A838")
    static let baraDanger    = Color(hex: "D95F5F")
}

// MARK: - Quality Level
struct QualityLevel {
    let label: String
    let color: Color
    let icon: String
}

func qualityLevel(for score: Double) -> QualityLevel {
    switch score {
    case ..<5:        return QualityLevel(label: "ضعيف",    color: Color(hex: "f44336"), icon: "exclamationmark.circle.fill")
    case 5..<7:       return QualityLevel(label: "مقبول",   color: Color(hex: "FF9800"), icon: "minus.circle.fill")
    case 7..<8.5:     return QualityLevel(label: "جيد",     color: Color(hex: "2196F3"), icon: "checkmark.circle")
    case 8.5..<9.5:   return QualityLevel(label: "جيد جداً", color: Color(hex: "8BC34A"), icon: "checkmark.circle.fill")
    default:          return QualityLevel(label: "ممتاز",   color: Color(hex: "4CAF50"), icon: "star.circle.fill")
    }
}

// MARK: - AppConfig
enum AppConfig {
    static let projectName    = "مشروع بارع بجمعية الراحين"
    static let projectSubtitle = "منصة متابعة إنجاز البطاقات وجودة التنفيذ"

    static let executionURL = "https://docs.google.com/spreadsheets/d/1vf5G2SaIHKGA4sAaGivYtgwDCWTm98fGHpyYslG-C08/export?format=csv&gid=1099506066"
    static let qualityURL   = "https://docs.google.com/spreadsheets/d/16VCRbUsKv9NXwH4rDYPEmTnV3Dt9p25j-oT1Ne4EYo4/export?format=csv&gid=790680076"

    // ==================== جدول المستخدمين الموحّد ====================
    // ضع هنا GID التبويب الذي أنشأته في Google Sheet للمستخدمين
    // الأعمدة: username | name | password(base64) | role | team
    static let usersGID = "184007558"
    static let usersURL = "https://docs.google.com/spreadsheets/d/1vf5G2SaIHKGA4sAaGivYtgwDCWTm98fGHpyYslG-C08/export?format=csv&gid=\(usersGID)"

    static let semesters: [Semester] = [
        Semester(id: "1446-1", year: 1446, num: 1, label: "الفصل الأول 1446",
                 startGreg: "2024/08/18", endGreg: "2024/11/16",
                 startHijri: HijriDate(year: 1446, month: 2, day: 14),
                 endHijri:   HijriDate(year: 1446, month: 5, day: 15)),
        Semester(id: "1446-2", year: 1446, num: 2, label: "الفصل الثاني 1446",
                 startGreg: "2024/11/17", endGreg: "2025/03/01",
                 startHijri: HijriDate(year: 1446, month: 5, day: 16),
                 endHijri:   HijriDate(year: 1446, month: 9, day: 2)),
        Semester(id: "1446-3", year: 1446, num: 3, label: "الفصل الثالث 1446",
                 startGreg: "2025/03/02", endGreg: "2025/06/26",
                 startHijri: HijriDate(year: 1446, month: 9, day: 3),
                 endHijri:   HijriDate(year: 1447, month: 1, day: 1)),
        Semester(id: "1447-1", year: 1447, num: 1, label: "الفصل الأول 1447",
                 startGreg: "2025/07/26", endGreg: "2026/01/18",
                 startHijri: HijriDate(year: 1447, month: 2, day: 1),
                 endHijri:   HijriDate(year: 1447, month: 7, day: 29)),
        Semester(id: "1447-2", year: 1447, num: 2, label: "الفصل الثاني 1447",
                 startGreg: "2026/01/19", endGreg: "2026/06/30",
                 startHijri: HijriDate(year: 1447, month: 8, day: 1),
                 endHijri:   HijriDate(year: 1447, month: 12, day: 29)),
    ]

    static let targets: [String: [String: Int]] = [
        "المتوسطة": ["1446-1": 11, "1446-2": 10, "1446-3": 10, "1447-1": 11, "1447-2": 10],
        "الثانوية":  ["1446-1": 16, "1446-2": 15, "1446-3": 15, "1447-1": 16, "1447-2": 15],
    ]

    static let teams: [String: [String]] = [
        "المتوسطة": ["أثر", "نماء", "نهج", "وتد", "وهج", "مجد"],
        "الثانوية":  ["سمو", "عزم", "عطاء", "غيث", "فنار", "نمير"],
    ]

    static let stages = ["المتوسطة", "الثانوية"]

    static func target(stage: String, semesterId: String) -> Int {
        targets[stage]?[semesterId] ?? 10
    }

    static func totalTarget(stage: String, semesterId: String) -> Int {
        let perTeam = target(stage: stage, semesterId: semesterId)
        return perTeam * (teams[stage]?.count ?? 6)
    }

    static var currentSemesterId: String? {
        let today = Date()
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy/MM/dd"
        for sem in semesters {
            if let s = fmt.date(from: sem.startGreg),
               let e = fmt.date(from: sem.endGreg),
               today >= s && today <= e { return sem.id }
        }
        return nil
    }
}
