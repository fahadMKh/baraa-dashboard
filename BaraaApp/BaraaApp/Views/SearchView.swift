import SwiftUI

struct SearchView: View {
    @Environment(DataService.self) private var data
    @Environment(\.colorScheme) private var scheme
    @Environment(\.horizontalSizeClass) private var hSizeClass

    @State private var searchText = ""
    @FocusState private var searchFocused: Bool
    @AppStorage("recentSearches") private var recentSearchesData: String = ""

    @State private var selectedTeam: TeamStats? = nil

    private var isIPad: Bool { hSizeClass == .regular }

    // MARK: - Recent Searches

    private var recentSearches: [String] {
        recentSearchesData
            .split(separator: "|")
            .map(String.init)
            .filter { !$0.isEmpty }
    }

    private func addRecentSearch(_ term: String) {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var list = recentSearches.filter { $0 != trimmed }
        list.insert(trimmed, at: 0)
        if list.count > 8 { list = Array(list.prefix(8)) }
        recentSearchesData = list.joined(separator: "|")
    }

    private func removeRecentSearch(_ term: String) {
        let list = recentSearches.filter { $0 != term }
        recentSearchesData = list.joined(separator: "|")
    }

    private func clearRecentSearches() {
        recentSearchesData = ""
    }

    // MARK: - Search Results

    private var query: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var matchingTeams: [TeamStats] {
        guard !query.isEmpty else { return [] }
        return data.stageStatsList.flatMap(\.teams)
            .filter { $0.team.lowercased().contains(query) }
    }

    private struct CardResult: Identifiable {
        let id = UUID()
        let card: String
        let executions: Int
        let team: String
        let stage: String
    }

    private var matchingCards: [CardResult] {
        guard !query.isEmpty else { return [] }
        let exec = data.executionRows.filter { $0.executed }
        var map: [String: (count: Int, team: String, stage: String)] = [:]
        for row in exec {
            if row.card.lowercased().contains(query) {
                let prev = map[row.card]
                map[row.card] = (
                    count: (prev?.count ?? 0) + 1,
                    team: prev?.team ?? row.team,
                    stage: prev?.stage ?? row.stage
                )
            }
        }
        return map.map { CardResult(card: $0.key, executions: $0.value.count, team: $0.value.team, stage: $0.value.stage) }
            .sorted { $0.executions > $1.executions }
    }

    private struct ExecutorResult: Identifiable {
        let id = UUID()
        let name: String
        let executions: Int
        let team: String
        let stage: String
    }

    private var matchingExecutors: [ExecutorResult] {
        guard !query.isEmpty else { return [] }
        let exec = data.executionRows.filter { $0.executed }
        var map: [String: (count: Int, team: String, stage: String)] = [:]
        for row in exec {
            let name = row.executor.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, name.lowercased().contains(query) else { continue }
            let prev = map[name]
            map[name] = (
                count: (prev?.count ?? 0) + 1,
                team: prev?.team ?? row.team,
                stage: prev?.stage ?? row.stage
            )
        }
        return map.map { ExecutorResult(name: $0.key, executions: $0.value.count, team: $0.value.team, stage: $0.value.stage) }
            .sorted { $0.executions > $1.executions }
    }

    private var hasResults: Bool {
        !matchingTeams.isEmpty || !matchingCards.isEmpty || !matchingExecutors.isEmpty
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            AnimatedGradientBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    searchBar
                        .padding(.top, 8)

                    if query.isEmpty {
                        if !recentSearches.isEmpty {
                            recentSearchesSection
                        }
                        suggestionsSection
                    } else if hasResults {
                        resultsContent
                    } else {
                        emptyResultsView
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 32)
            }
        }
        .navigationTitle("البحث")
        .navigationBarTitleDisplayMode(.large)
        .toolbarColorScheme(scheme == .dark ? .dark : .light, for: .navigationBar)
        .navigationDestination(item: $selectedTeam) { team in
            TeamDetailView(team: team.team, stage: team.stage)
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            HStack {
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(Color.primary.opacity(0.4))
                    }
                }
                TextField("ابحث عن فريق، بطاقة، أو منفذ...", text: $searchText)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                    .focused($searchFocused)
                    .submitLabel(.search)
                    .onSubmit {
                        addRecentSearch(searchText)
                    }
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(Color.baraAccent.opacity(0.7))
                    .font(.title3)
            }
            .padding(12)
            .background(Color.primary.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .frame(maxWidth: isIPad ? 500 : .infinity)
        }
    }

    // MARK: - Recent Searches

    private var recentSearchesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionHeader(title: "عمليات البحث الأخيرة")
                Spacer()
                Button {
                    clearRecentSearches()
                } label: {
                    Text("مسح")
                        .font(.caption)
                        .foregroundStyle(Color.baraDanger.opacity(0.8))
                }
            }

            FlowLayout(spacing: 8) {
                ForEach(recentSearches, id: \.self) { term in
                    Button {
                        searchText = term
                        addRecentSearch(term)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "clock.arrow.circlepath")
                                .font(.caption2)
                            Text(term)
                                .font(.subheadline)
                        }
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Color.primary.opacity(0.08))
                        .clipShape(Capsule())
                    }
                }
            }
            .glassCard()
        }
    }

    // MARK: - Suggestions (Empty State)

    private var suggestionsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeader(title: "اقتراحات البحث")

            VStack(alignment: .leading, spacing: 0) {
                suggestionRow(icon: "person.3.fill", text: "ابحث باسم الفريق", example: "فريق الإبداع")
                Divider().padding(.horizontal, 8)
                suggestionRow(icon: "rectangle.on.rectangle.angled", text: "ابحث باسم البطاقة", example: "بطاقة التعاون")
                Divider().padding(.horizontal, 8)
                suggestionRow(icon: "person.fill", text: "ابحث باسم المنفذ", example: "محمد")
            }
            .glassCard(padding: 0)
        }
    }

    private func suggestionRow(icon: String, text: String, example: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.baraAccent)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(text)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                Text(example)
                    .font(.caption)
                    .foregroundStyle(Color.primary.opacity(0.5))
            }
            Spacer()
        }
        .padding(14)
        .contentShape(Rectangle())
        .onTapGesture {
            searchText = example
            searchFocused = true
        }
    }

    // MARK: - Results Content

    @ViewBuilder
    private var resultsContent: some View {
        // Teams
        if !matchingTeams.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "الفرق", subtitle: "\(matchingTeams.count.arabicFormatted) نتيجة")

                ForEach(matchingTeams, id: \.team) { team in
                    Button {
                        addRecentSearch(searchText)
                        selectedTeam = team
                    } label: {
                        teamResultRow(team)
                    }
                    .buttonStyle(.plain)
                }
            }
        }

        // Cards
        if !matchingCards.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "البطاقات", subtitle: "\(matchingCards.count.arabicFormatted) نتيجة")

                ForEach(matchingCards) { card in
                    cardResultRow(card)
                }
            }
        }

        // Executors
        if !matchingExecutors.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "المنفذون", subtitle: "\(matchingExecutors.count.arabicFormatted) نتيجة")

                ForEach(matchingExecutors) { executor in
                    executorResultRow(executor)
                }
            }
        }
    }

    // MARK: - Result Rows

    private func teamResultRow(_ team: TeamStats) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "person.3.fill")
                .font(.title3)
                .foregroundStyle(Color.baraAccent)
                .frame(width: 36)

            VStack(alignment: .leading, spacing: 4) {
                Text(team.team)
                    .font(.headline.bold())
                    .foregroundStyle(.primary)
                HStack(spacing: 8) {
                    Text(team.stage == "المتوسطة" ? "المرحلة المتوسطة" : "المرحلة الثانوية")
                        .font(.caption)
                        .foregroundStyle(Color.primary.opacity(0.6))
                    Text("\(team.totalExecuted.arabicFormatted)/\(team.target.arabicFormatted) بطاقة")
                        .font(.caption)
                        .foregroundStyle(Color.primary.opacity(0.6))
                }
            }

            Spacer()

            ProgressRingView(value: team.completionRate, size: 44,
                             color: team.completionRate >= 80 ? .baraAccent : .baraWarning,
                             lineWidth: 4)
        }
        .glassCard()
    }

    private func cardResultRow(_ card: CardResult) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "rectangle.on.rectangle.angled")
                .font(.title3)
                .foregroundStyle(Color.baraPrimary)
                .frame(width: 36)

            VStack(alignment: .leading, spacing: 4) {
                Text(card.card)
                    .font(.subheadline.bold())
                    .foregroundStyle(.primary)
                Text(card.team)
                    .font(.caption)
                    .foregroundStyle(Color.primary.opacity(0.6))
            }

            Spacer()

            VStack(spacing: 2) {
                Text(card.executions.arabicFormatted)
                    .font(.title3.bold())
                    .foregroundStyle(Color.baraAccent)
                Text("تنفيذ")
                    .font(.caption2)
                    .foregroundStyle(Color.primary.opacity(0.5))
            }
        }
        .glassCard()
    }

    private func executorResultRow(_ executor: ExecutorResult) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "person.fill")
                .font(.title3)
                .foregroundStyle(Color.baraTeal)
                .frame(width: 36)

            VStack(alignment: .leading, spacing: 4) {
                Text(executor.name)
                    .font(.subheadline.bold())
                    .foregroundStyle(.primary)
                Text(executor.team)
                    .font(.caption)
                    .foregroundStyle(Color.primary.opacity(0.6))
            }

            Spacer()

            VStack(spacing: 2) {
                Text(executor.executions.arabicFormatted)
                    .font(.title3.bold())
                    .foregroundStyle(Color.baraTeal)
                Text("تنفيذ")
                    .font(.caption2)
                    .foregroundStyle(Color.primary.opacity(0.5))
            }
        }
        .glassCard()
    }

    // MARK: - Empty Results

    private var emptyResultsView: some View {
        VStack(spacing: 16) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 48))
                .foregroundStyle(Color.primary.opacity(0.3))
            Text("لا توجد نتائج")
                .font(.headline.bold())
                .foregroundStyle(.primary)
            Text("جرّب البحث بكلمات مختلفة")
                .font(.subheadline)
                .foregroundStyle(Color.primary.opacity(0.6))
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }
}

// MARK: - Flow Layout (for recent search chips)

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            guard index < result.positions.count else { break }
            let pos = result.positions[index]
            subview.place(at: CGPoint(x: bounds.minX + pos.x, y: bounds.minY + pos.y),
                          proposal: .unspecified)
        }
    }

    private struct ArrangeResult {
        var size: CGSize
        var positions: [CGPoint]
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> ArrangeResult {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return ArrangeResult(
            size: CGSize(width: maxWidth, height: y + rowHeight),
            positions: positions
        )
    }
}

#Preview {
    NavigationStack {
        SearchView()
            .environment(DataService())
    }
    .environment(\.layoutDirection, .rightToLeft)
}
