/**
 * التطبيق الرئيسي - منصة متابعة الشخصية المتكاملة
 */

class App {
  constructor() {
    this.engine = new DataEngine();
    this.currentView = 'overview';
    this.currentSemesters = new Set(); // فارغة = جميع الفصول
    this.dateFrom = null;
    this.dateTo = null;
    this.teamSearch = '';
    this.charts = {};
    this._closeFilterHandler = null;
  }

  /** كائن الفلتر الحالي لتمريره إلى محرك البيانات */
  getCurrentFilter() {
    return {
      semesters: [...this.currentSemesters],
      dateFrom:  this.dateFrom,
      dateTo:    this.dateTo,
    };
  }

  async init() {
    this.showLoading(true);
    this._loadAdminSettings();
    try {
      await this.engine.fetchAll();
      // افتح على الفصل الدراسي الحالي تلقائياً
      const curSem = this.engine.getCurrentSemesterId();
      if (curSem) this.currentSemesters = new Set([curSem]);
      this.buildFilterUI();
      this.renderCurrentView();
      this.setupAutoRefresh();
      this.updateLastFetchTime();
      this.showToast('تم تحميل البيانات بنجاح');
    } catch (err) {
      console.error(err);
      this.showToast('خطأ في تحميل البيانات - تحقق من الاتصال');
    } finally {
      this.showLoading(false);
    }
  }

  /** تحميل الإعدادات المحلية */
  _loadAdminSettings() {
    // تحميل المستهدفات المحفوظة
    const targets = JSON.parse(localStorage.getItem('baraa_targets') || '{}');
    for (const [stage, sems] of Object.entries(targets)) {
      if (!CONFIG.targets[stage]) CONFIG.targets[stage] = {};
      for (const [semId, val] of Object.entries(sems)) {
        CONFIG.targets[stage][semId] = val;
      }
    }
    // تحميل الفرق المحفوظة
    const teams = JSON.parse(localStorage.getItem('baraa_teams') || 'null');
    if (teams) CONFIG.teams = teams;
  }

  // ==================== التنقل ====================
  setupNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        this.navigateTo(view);
      });
    });
  }

  navigateTo(view, params = {}) {
    this.currentView = view;
    this.viewParams = params;

    // تحديث التبويبات
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.nav-tab[data-view="${view}"]`);
    if (activeTab) activeTab.classList.add('active');

    // إخفاء جميع العروض
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const activeView = document.getElementById(`view-${view}`);
    if (activeView) activeView.classList.add('active');

    this.renderCurrentView();
  }

  renderCurrentView() {
    switch (this.currentView) {
      case 'overview': this.renderOverview(); break;
      case 'stages': this.renderStages(); break;
      case 'teams': this.renderTeams(); break;
      case 'quality': this.renderQuality(); break;
      case 'team-detail': this.renderTeamDetail(this.viewParams); break;
      case 'analytics': this.renderAnalytics(); break;
      case 'comparison': this.renderComparison(); break;
      case 'search': this.renderSearch(); break;
      case 'alerts': this.renderAlerts(); break;
      case 'admin': this.renderAdmin(); break;
    }
  }

  // ==================== النظرة العامة ====================
  renderOverview() {
    const stats = this.engine.getOverallStats(this.getCurrentFilter());
    const container = document.getElementById('view-overview');

    const qualLevel = stats.qualityLevel || { label: '-', color: '#999', icon: '⚪' };
    const qualScore = stats.qualityDetails ? stats.qualityDetails.overall.toFixed(1) : '-';

    let html = `
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-icon">📋</span>
          <div class="stat-label">إجمالي عمليات التنفيذ</div>
          <div class="stat-value">${stats.totalExecutions}</div>
          <div class="stat-sub">عدد البطاقات المنفذة</div>
        </div>
        <div class="stat-card accent">
          <span class="stat-icon">👥</span>
          <div class="stat-label">الفرق النشطة</div>
          <div class="stat-value">${stats.activeTeams}</div>
          <div class="stat-sub">من أصل ${Object.values(CONFIG.teams).flat().length} فريق</div>
        </div>
        <div class="stat-card warning">
          <span class="stat-icon">🎯</span>
          <div class="stat-label">إجمالي المستفيدين</div>
          <div class="stat-value">${stats.totalBeneficiaries.toLocaleString('ar-SA')}</div>
          <div class="stat-sub">من جميع الأنشطة</div>
        </div>
        <div class="stat-card" style="border-right-color: ${qualLevel.color}">
          <span class="stat-icon">⭐</span>
          <div class="stat-label">مستوى الجودة العام</div>
          <div class="stat-value">${qualScore}<span style="font-size:0.8rem;color:var(--text-light)">/10</span></div>
          <div class="stat-sub"><span class="quality-badge" style="background:${qualLevel.color}">${qualLevel.icon} ${qualLevel.label}</span></div>
        </div>
      </div>

      <!-- إحصائيات المراحل -->
      <div class="section-header">
        <h2 class="section-title">إنجاز المراحل</h2>
      </div>
      <div class="cards-grid">
    `;

    for (const [stageName, stageConf] of Object.entries(CONFIG.stages)) {
      const s = stats.stageStats[stageName];
      if (!s) continue;
      const avgCompletion = s.teams.length > 0
        ? (s.teams.reduce((sum, t) => sum + t.completionRate, 0) / s.teams.length).toFixed(0)
        : 0;
      const qualAvg = s.qualityAvg !== null ? s.qualityAvg.toFixed(1) : '-';
      const qualLvl = this.engine.getQualityLevel(s.qualityAvg);

      html += `
        <div class="info-card" onclick="app.navigateTo('stages', {stage: '${stageName}'})">
          <div class="card-header">
            <div class="card-title">${stageConf.icon} ${stageConf.label}</div>
            <span class="card-badge" style="background:${stageConf.color}">${s.teams.length} فرق</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-label">
              <span>متوسط الإنجاز</span>
              <span>${avgCompletion}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${avgCompletion < 40 ? 'low' : avgCompletion < 70 ? 'medium' : 'high'}"
                   style="width:${avgCompletion}%"></div>
            </div>
          </div>
          <div class="card-stats">
            <div class="card-stat">
              <div class="val">${s.totalExecutions}</div>
              <div class="lbl">تنفيذ</div>
            </div>
            <div class="card-stat">
              <div class="val">${s.uniqueCards}</div>
              <div class="lbl">بطاقة فريدة</div>
            </div>
            <div class="card-stat">
              <div class="val">${s.beneficiaries.toLocaleString('ar-SA')}</div>
              <div class="lbl">مستفيد</div>
            </div>
            <div class="card-stat">
              <div class="val" style="color:${qualLvl.color}">${qualAvg}</div>
              <div class="lbl">الجودة</div>
            </div>
          </div>
        </div>
      `;
    }

    html += '</div>';

    // رسم بياني: مقارنة الفرق
    html += `
      <div class="charts-row">
        <div class="chart-container">
          <div class="chart-title">نسبة إنجاز البطاقات لكل فريق</div>
          <canvas id="chart-completion"></canvas>
        </div>
        <div class="chart-container">
          <div class="chart-title">مستوى الجودة لكل فريق</div>
          <canvas id="chart-quality"></canvas>
        </div>
      </div>
    `;

    // الفرق التي لم تنفذ
    const nonExec = this.engine.getNonExecutingTeams(this.getCurrentFilter());
    if (Object.keys(nonExec).length > 0) {
      html += `
        <div class="data-table-wrapper">
          <div class="table-header">
            <h3>الفرق التي أبلغت بعدم التنفيذ</h3>
          </div>
          <table class="data-table">
            <thead><tr><th>الفريق</th><th>عدد مرات عدم التنفيذ</th></tr></thead>
            <tbody>
      `;
      for (const [team, count] of Object.entries(nonExec).sort((a, b) => b[1] - a[1])) {
        html += `<tr><td>${team}</td><td>${count}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }

    container.innerHTML = html;
    this.renderOverviewCharts(stats);
  }

  renderOverviewCharts(stats) {
    // جمع كل الفرق
    const allTeams = [];
    for (const [stageName, stageConf] of Object.entries(CONFIG.stages)) {
      const s = stats.stageStats[stageName];
      if (!s) continue;
      s.teams.forEach(t => allTeams.push({ ...t, stage: stageName, stageColor: stageConf.color }));
    }

    // رسم الإنجاز
    this.destroyChart('chart-completion');
    const ctx1 = document.getElementById('chart-completion');
    if (ctx1) {
      this.charts['chart-completion'] = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: allTeams.map(t => t.name),
          datasets: [{
            label: 'نسبة الإنجاز %',
            data: allTeams.map(t => t.completionRate.toFixed(1)),
            backgroundColor: allTeams.map(t => t.stageColor + 'CC'),
            borderColor: allTeams.map(t => t.stageColor),
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } },
            x: { ticks: { font: { family: 'Tajawal' } } },
          },
        },
      });
    }

    // رسم الجودة
    this.destroyChart('chart-quality');
    const ctx2 = document.getElementById('chart-quality');
    if (ctx2) {
      this.charts['chart-quality'] = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: allTeams.map(t => t.name),
          datasets: [{
            label: 'متوسط الجودة',
            data: allTeams.map(t => t.qualityAvg !== null ? t.qualityAvg.toFixed(1) : 0),
            backgroundColor: allTeams.map(t => {
              const lvl = this.engine.getQualityLevel(t.qualityAvg);
              return lvl.color + 'CC';
            }),
            borderColor: allTeams.map(t => {
              const lvl = this.engine.getQualityLevel(t.qualityAvg);
              return lvl.color;
            }),
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, max: 10, ticks: { callback: v => v + '/10' } },
            x: { ticks: { font: { family: 'Tajawal' } } },
          },
        },
      });
    }
  }

  // ==================== عرض المراحل ====================
  renderStages() {
    const container = document.getElementById('view-stages');
    const selectedStage = this.viewParams?.stage || Object.keys(CONFIG.stages)[0];
    const stats = this.engine.getOverallStats(this.getCurrentFilter());

    let tabsHtml = '<div class="sub-tabs">';
    for (const [name, conf] of Object.entries(CONFIG.stages)) {
      tabsHtml += `<button class="sub-tab ${name === selectedStage ? 'active' : ''}"
        onclick="app.navigateTo('stages', {stage: '${name}'})">${conf.icon} ${conf.label}</button>`;
    }
    tabsHtml += '</div>';

    const s = stats.stageStats[selectedStage];
    if (!s) {
      container.innerHTML = tabsHtml + '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">لا توجد بيانات لهذه المرحلة</div></div>';
      return;
    }

    const stageConf = CONFIG.stages[selectedStage];
    let html = tabsHtml;

    // جدول الفرق
    html += `
      <div class="data-table-wrapper">
        <div class="table-header">
          <h3>فرق ${stageConf.label}</h3>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>الفريق</th>
              <th>البطاقات المنفذة</th>
              <th>كل الإدخالات</th>
              <th>المستهدف</th>
              <th>نسبة الإنجاز</th>
              <th>المستفيدون</th>
              <th>الجودة</th>
              <th>زيارات الجودة</th>
            </tr>
          </thead>
          <tbody>
    `;

    s.teams.sort((a, b) => b.completionRate - a.completionRate).forEach(team => {
      const qualLvl = team.qualityLevel;
      html += `
        <tr>
          <td class="clickable" onclick="app.showTeamDetail('${team.name}')">${team.name}</td>
          <td>${team.uniqueCards}${team.uniqueCards > team.cardNames.length ? `<span title="${team.uniqueCards - team.cardNames.length} تنفيذ متكرر" style="margin-right:5px;color:#FF9800;font-size:0.8em">🔁</span>` : ''}</td>
          <td>${team.totalSubmissions}</td>
          <td>${team.target || '-'}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="progress-bar" style="width:100px;height:8px">
                <div class="progress-fill ${team.completionRate < 40 ? 'low' : team.completionRate < 70 ? 'medium' : 'high'}"
                     style="width:${team.completionRate}%"></div>
              </div>
              <span>${team.completionRate.toFixed(0)}%</span>
            </div>
          </td>
          <td>${team.beneficiaries.toLocaleString('ar-SA')}</td>
          <td><span class="quality-badge" style="background:${qualLvl.color}">${qualLvl.icon} ${team.qualityAvg !== null ? team.qualityAvg.toFixed(1) : '-'}</span></td>
          <td>${team.qualityVisits}</td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';

    // رسم بياني للمرحلة
    html += `
      <div class="charts-row">
        <div class="chart-container">
          <div class="chart-title">مقارنة الإنجاز بين الفرق - ${stageConf.label}</div>
          <canvas id="chart-stage-completion"></canvas>
        </div>
        <div class="chart-container">
          <div class="chart-title">توزيع المستفيدين</div>
          <canvas id="chart-stage-beneficiaries"></canvas>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // رسم البيانات
    const teams = s.teams;
    this.destroyChart('chart-stage-completion');
    const c1 = document.getElementById('chart-stage-completion');
    if (c1) {
      this.charts['chart-stage-completion'] = new Chart(c1, {
        type: 'bar',
        data: {
          labels: teams.map(t => t.name),
          datasets: [
            {
              label: 'المنفذ',
              data: teams.map(t => t.uniqueCards),
              backgroundColor: stageConf.color + 'CC',
              borderColor: stageConf.color,
              borderWidth: 1,
              borderRadius: 4,
            },
            {
              label: 'المستهدف',
              data: teams.map(t => t.target),
              backgroundColor: '#e0e0e0',
              borderColor: '#bdbdbd',
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { font: { family: 'Tajawal' } } } },
          scales: {
            y: { beginAtZero: true },
            x: { ticks: { font: { family: 'Tajawal' } } },
          },
        },
      });
    }

    this.destroyChart('chart-stage-beneficiaries');
    const c2 = document.getElementById('chart-stage-beneficiaries');
    if (c2) {
      this.charts['chart-stage-beneficiaries'] = new Chart(c2, {
        type: 'doughnut',
        data: {
          labels: teams.map(t => t.name),
          datasets: [{
            data: teams.map(t => t.beneficiaries),
            backgroundColor: CONFIG.display.chartColors.slice(0, teams.length),
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal' } } } },
        },
      });
    }
  }

  // ==================== عرض الفرق ====================
  searchTeams(query) {
    this.teamSearch = query;
    this.renderTeams();
  }

  renderTeams() {
    const container = document.getElementById('view-teams');
    const stats = this.engine.getOverallStats(this.getCurrentFilter());
    const search = this.teamSearch.trim();

    let html = `
      <div class="search-row">
        <input type="text" class="team-search-input" placeholder="ابحث عن فريق..."
          value="${search.replace(/"/g, '&quot;')}"
          oninput="app.searchTeams(this.value)">
      </div>
      <div class="cards-grid">
    `;

    for (const [stageName, stageConf] of Object.entries(CONFIG.stages)) {
      const s = stats.stageStats[stageName];
      if (!s) continue;

      const filtered = s.teams
        .filter(t => !search || t.name.includes(search))
        .sort((a, b) => b.completionRate - a.completionRate);

      filtered.forEach(team => {
        const qualLvl = team.qualityLevel;
        html += `
          <div class="info-card" onclick="app.showTeamDetail('${team.name}')">
            <div class="card-header">
              <div class="card-title">${team.name}</div>
              <span class="card-badge" style="background:${stageConf.color}">${stageConf.shortLabel}</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-label">
                <span>الإنجاز: ${team.uniqueCards}/${team.target || '?'}</span>
                <span>${team.completionRate.toFixed(0)}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${team.completionRate < 40 ? 'low' : team.completionRate < 70 ? 'medium' : 'high'}"
                     style="width:${team.completionRate}%"></div>
              </div>
            </div>
            <div class="card-stats">
              <div class="card-stat">
                <div class="val">${team.executions}</div>
                <div class="lbl">تنفيذ</div>
              </div>
              <div class="card-stat">
                <div class="val">${team.beneficiaries}</div>
                <div class="lbl">مستفيد</div>
              </div>
              <div class="card-stat">
                <div class="val" style="color:${qualLvl.color}">${team.qualityAvg !== null ? team.qualityAvg.toFixed(1) : '-'}</div>
                <div class="lbl">${qualLvl.label}</div>
              </div>
              <div class="card-stat">
                <div class="val">${team.qualityVisits}</div>
                <div class="lbl">زيارة</div>
              </div>
            </div>
          </div>
        `;
      });
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // ==================== عرض الجودة ====================
  renderQuality() {
    const container = document.getElementById('view-quality');
    const stats = this.engine.getOverallStats(this.getCurrentFilter());

    let html = '';

    // إحصائيات عامة للجودة
    if (stats.qualityDetails) {
      const qd = stats.qualityDetails;
      const qualLvl = this.engine.getQualityLevel(qd.overall);

      html += `
        <div class="stats-grid">
          <div class="stat-card" style="border-right-color:${qualLvl.color}">
            <span class="stat-icon">⭐</span>
            <div class="stat-label">المتوسط العام للجودة</div>
            <div class="stat-value">${qd.overall.toFixed(1)}<span style="font-size:0.8rem;color:var(--text-light)">/10</span></div>
            <div class="stat-sub"><span class="quality-badge" style="background:${qualLvl.color}">${qualLvl.icon} ${qualLvl.label}</span></div>
          </div>
          <div class="stat-card accent">
            <span class="stat-icon">👁</span>
            <div class="stat-label">إجمالي الزيارات</div>
            <div class="stat-value">${qd.visitCount}</div>
            <div class="stat-sub">زيارة تقييم جودة</div>
          </div>
          <div class="stat-card">
            <span class="stat-icon">📊</span>
            <div class="stat-label">تفاعل المشاركين</div>
            <div class="stat-value">${qd.engagement.toFixed(1)}</div>
            <div class="stat-sub">من 10</div>
          </div>
          <div class="stat-card warning">
            <span class="stat-icon">📚</span>
            <div class="stat-label">استيعاب المنفذين</div>
            <div class="stat-value">${qd.comprehension.toFixed(1)}</div>
            <div class="stat-sub">من 10</div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-icon">🎯</span>
            <div class="stat-label">مطابقة المحتوى (الأدوات)</div>
            <div class="stat-value">${qd.content.toFixed(1)}<span style="font-size:0.8rem;color:var(--text-light)">/10</span></div>
          </div>
          <div class="stat-card accent">
            <span class="stat-icon">✅</span>
            <div class="stat-label">مطابقة التقويم</div>
            <div class="stat-value">${qd.eval.toFixed(1)}<span style="font-size:0.8rem;color:var(--text-light)">/10</span></div>
          </div>
        </div>
      `;
    }

    // رسم بياني للجودة
    html += `
      <div class="charts-row">
        <div class="chart-container">
          <div class="chart-title">معايير الجودة التفصيلية</div>
          <canvas id="chart-quality-criteria"></canvas>
        </div>
        <div class="chart-container">
          <div class="chart-title">مقارنة جودة الفرق</div>
          <canvas id="chart-quality-teams"></canvas>
        </div>
      </div>
    `;

    // جدول تفصيلي للزيارات
    const qualRows = this.engine.filterQuality({ filter: this.getCurrentFilter() });
    if (qualRows.length > 0) {
      const qcol = CONFIG.qualityColumns;
      html += `
        <div class="data-table-wrapper">
          <div class="table-header">
            <h3>سجل زيارات الجودة (${qualRows.length} زيارة)</h3>
          </div>
          <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الفريق</th>
                <th>النشاط</th>
                <th>المقيّم</th>
                <th>التفاعل</th>
                <th>الاستيعاب</th>
                <th>المحتوى</th>
                <th>التقويم</th>
                <th>المتوسط</th>
              </tr>
            </thead>
            <tbody>
      `;

      qualRows.forEach(row => {
        const scores = [
          parseFloat(row[qcol.participantEngagement]) || 0,
          parseFloat(row[qcol.executorComprehension]) || 0,
          parseFloat(row[qcol.contentCompliance]) || 0,
          parseFloat(row[qcol.evalCompliance]) || 0,
        ];
        const avg = scores.reduce((a, b) => a + b, 0) / 4;
        const lvl = this.engine.getQualityLevel(avg);

        html += `
          <tr>
            <td>${row[qcol.visitDate] || '-'}</td>
            <td>${row[qcol.team] || '-'}</td>
            <td>${row[qcol.activityName] || '-'}</td>
            <td>${row[qcol.evaluator] || '-'}</td>
            <td>${row[qcol.participantEngagement]}</td>
            <td>${row[qcol.executorComprehension]}</td>
            <td>${row[qcol.contentCompliance]}</td>
            <td>${row[qcol.evalCompliance]}</td>
            <td><span class="quality-badge" style="background:${lvl.color}">${avg.toFixed(1)}</span></td>
          </tr>
        `;
      });

      html += '</tbody></table></div></div>';
    }

    container.innerHTML = html;

    // الرسوم البيانية
    if (stats.qualityDetails) {
      const qd = stats.qualityDetails;

      this.destroyChart('chart-quality-criteria');
      const ctx1 = document.getElementById('chart-quality-criteria');
      if (ctx1) {
        this.charts['chart-quality-criteria'] = new Chart(ctx1, {
          type: 'radar',
          data: {
            labels: ['تفاعل المشاركين', 'استيعاب المنفذين', 'مطابقة المحتوى', 'مطابقة التقويم'],
            datasets: [{
              label: 'المتوسط العام',
              data: [qd.engagement, qd.comprehension, qd.content, qd.eval],
              backgroundColor: 'rgba(33,150,243,0.2)',
              borderColor: '#2196F3',
              pointBackgroundColor: '#2196F3',
              borderWidth: 2,
            }],
          },
          options: {
            responsive: true,
            scales: {
              r: { beginAtZero: true, max: 10, pointLabels: { font: { family: 'Tajawal', size: 12 } } },
            },
            plugins: { legend: { display: false } },
          },
        });
      }

      // جودة الفرق
      const allTeams = [];
      for (const [stageName] of Object.entries(CONFIG.stages)) {
        const s = stats.stageStats[stageName];
        if (s) s.teams.forEach(t => allTeams.push(t));
      }

      this.destroyChart('chart-quality-teams');
      const ctx2 = document.getElementById('chart-quality-teams');
      if (ctx2) {
        const teamsWithQuality = allTeams.filter(t => t.qualityAvg !== null);
        this.charts['chart-quality-teams'] = new Chart(ctx2, {
          type: 'bar',
          data: {
            labels: teamsWithQuality.map(t => t.name),
            datasets: [{
              label: 'متوسط الجودة',
              data: teamsWithQuality.map(t => t.qualityAvg.toFixed(1)),
              backgroundColor: teamsWithQuality.map(t => this.engine.getQualityLevel(t.qualityAvg).color + 'CC'),
              borderColor: teamsWithQuality.map(t => this.engine.getQualityLevel(t.qualityAvg).color),
              borderWidth: 1,
              borderRadius: 4,
            }],
          },
          options: {
            responsive: true,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, max: 10 },
              y: { ticks: { font: { family: 'Tajawal' } } },
            },
          },
        });
      }
    }
  }

  // ==================== تفاصيل الفريق ====================
  showTeamDetail(teamName) {
    this.navigateTo('team-detail', { team: teamName });
  }

  renderTeamDetail(params) {
    const teamName = params?.team;
    if (!teamName) return;

    const container = document.getElementById('view-team-detail');
    const details = this.engine.getTeamDetails(teamName, this.getCurrentFilter());
    const stageConf = CONFIG.stages[details.stage] || {};

    let html = `
      <div class="breadcrumb">
        <a onclick="app.navigateTo('overview')">الرئيسية</a>
        <span class="separator">/</span>
        <a onclick="app.navigateTo('stages', {stage: '${details.stage}'})">${stageConf.label || details.stage}</a>
        <span class="separator">/</span>
        <span class="current">${teamName}</span>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-icon">📋</span>
          <div class="stat-label">البطاقات المنفذة</div>
          <div class="stat-value">${details.uniqueCards}/${details.target || '?'}</div>
          <div class="stat-sub">نسبة الإنجاز: ${details.completionRate.toFixed(0)}%</div>
        </div>
        <div class="stat-card accent">
          <span class="stat-icon">🔄</span>
          <div class="stat-label">إجمالي التنفيذات</div>
          <div class="stat-value">${details.totalExecutions}</div>
        </div>
        <div class="stat-card warning">
          <span class="stat-icon">👥</span>
          <div class="stat-label">المستفيدون</div>
          <div class="stat-value">${details.beneficiaries.toLocaleString('ar-SA')}</div>
        </div>
    `;

    if (details.qualityDetails) {
      const ql = details.qualityLevel;
      html += `
        <div class="stat-card" style="border-right-color:${ql.color}">
          <span class="stat-icon">⭐</span>
          <div class="stat-label">مستوى الجودة</div>
          <div class="stat-value">${details.qualityDetails.overall.toFixed(1)}</div>
          <div class="stat-sub"><span class="quality-badge" style="background:${ql.color}">${ql.icon} ${ql.label}</span> (${details.qualityDetails.visitCount} زيارة)</div>
        </div>
      `;
    }
    html += '</div>';

    // شريط التقدم
    html += `
      <div class="chart-container">
        <div class="chart-title">تقدم الإنجاز</div>
        <div class="progress-bar-container">
          <div class="progress-label">
            <span>${details.uniqueCards} بطاقة منفذة من ${details.target || '?'}</span>
            <span>${details.completionRate.toFixed(0)}%</span>
          </div>
          <div class="progress-bar" style="height:20px">
            <div class="progress-fill ${details.completionRate < 40 ? 'low' : details.completionRate < 70 ? 'medium' : 'high'}"
                 style="width:${details.completionRate}%"></div>
          </div>
        </div>
      </div>
    `;

    // تفاصيل الجودة
    if (details.qualityDetails) {
      const qd = details.qualityDetails;
      html += `
        <div class="chart-container">
          <div class="chart-title">تفاصيل الجودة</div>
          <div class="stats-grid" style="margin-bottom:0">
            <div style="text-align:center;padding:10px">
              <div style="font-size:0.8rem;color:var(--text-light)">تفاعل المشاركين</div>
              <div style="font-size:1.4rem;font-weight:700">${qd.engagement.toFixed(1)}/10</div>
            </div>
            <div style="text-align:center;padding:10px">
              <div style="font-size:0.8rem;color:var(--text-light)">استيعاب المنفذين</div>
              <div style="font-size:1.4rem;font-weight:700">${qd.comprehension.toFixed(1)}/10</div>
            </div>
            <div style="text-align:center;padding:10px">
              <div style="font-size:0.8rem;color:var(--text-light)">مطابقة المحتوى</div>
              <div style="font-size:1.4rem;font-weight:700">${qd.content.toFixed(1)}/10</div>
            </div>
            <div style="text-align:center;padding:10px">
              <div style="font-size:0.8rem;color:var(--text-light)">مطابقة التقويم</div>
              <div style="font-size:1.4rem;font-weight:700">${qd.eval.toFixed(1)}/10</div>
            </div>
          </div>
        </div>
      `;
    }

    // جدول البطاقات
    const cards = Object.values(details.cards);
    if (cards.length > 0) {
      html += `
        <div class="data-table-wrapper">
          <div class="table-header">
            <h3>البطاقات المنفذة (${details.uniqueCards} تنفيذ${details.uniqueCards !== cards.length ? ` — ${cards.length} بطاقة فريدة` : ''})</h3>
          </div>
          <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>اسم البطاقة</th>
                <th>عدد التنفيذات</th>
                <th>المنفذون</th>
                <th>المستفيدون</th>
                <th>وسائل التنفيذ</th>
                <th>تاريخ آخر تنفيذ</th>
              </tr>
            </thead>
            <tbody>
      `;

      cards.sort((a, b) => b.executions - a.executions).forEach((card, idx) => {
        const repeatBadge = card.executions > 1
          ? `<span title="نُفِّذت ${card.executions} مرات" style="margin-right:6px;background:#FF9800;color:#fff;border-radius:10px;padding:1px 7px;font-size:0.75em;font-weight:700">🔁 ×${card.executions}</span>`
          : '';
        html += `
          <tr>
            <td>${idx + 1}</td>
            <td style="font-weight:600">${card.name}${repeatBadge}</td>
            <td>${card.executions}</td>
            <td>${card.executors.join('، ')}</td>
            <td>${card.beneficiaries}</td>
            <td>${card.methods.join('، ')}</td>
            <td>${card.dates.length > 0 ? card.dates[card.dates.length - 1] : '-'}</td>
          </tr>
        `;
      });

      html += '</tbody></table></div></div>';
    }

    // زيارات الجودة
    if (details.qualityVisits.length > 0) {
      const qcol = CONFIG.qualityColumns;
      html += `
        <div class="data-table-wrapper">
          <div class="table-header">
            <h3>زيارات الجودة (${details.qualityVisits.length})</h3>
          </div>
          <div style="overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المقيّم</th>
                <th>النشاط</th>
                <th>التفاعل</th>
                <th>الاستيعاب</th>
                <th>المحتوى</th>
                <th>التقويم</th>
                <th>المتوسط</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
      `;

      details.qualityVisits.forEach(row => {
        const scores = [
          parseFloat(row[qcol.participantEngagement]) || 0,
          parseFloat(row[qcol.executorComprehension]) || 0,
          parseFloat(row[qcol.contentCompliance]) || 0,
          parseFloat(row[qcol.evalCompliance]) || 0,
        ];
        const avg = scores.reduce((a, b) => a + b, 0) / 4;
        const lvl = this.engine.getQualityLevel(avg);

        html += `
          <tr>
            <td>${row[qcol.visitDate] || '-'}</td>
            <td>${row[qcol.evaluator] || '-'}</td>
            <td>${row[qcol.activityName] || '-'}</td>
            <td>${row[qcol.participantEngagement]}</td>
            <td>${row[qcol.executorComprehension]}</td>
            <td>${row[qcol.contentCompliance]}</td>
            <td>${row[qcol.evalCompliance]}</td>
            <td><span class="quality-badge" style="background:${lvl.color}">${avg.toFixed(1)}</span></td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${row[qcol.generalNotes] || '-'}</td>
          </tr>
        `;
      });

      html += '</tbody></table></div></div>';
    }

    container.innerHTML = html;

    // إظهار العرض
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    container.classList.add('active');

    // إزالة active من التبويبات
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  }

  // ==================== واجهة الفلتر ====================

  /** بناء خانات اختيار الفصول في لوحة الفلتر */
  buildFilterUI() {
    const checks = document.getElementById('semester-checks');
    if (!checks) return;
    checks.innerHTML = '';
    CONFIG.semesters.forEach(sem => {
      const label = document.createElement('label');
      label.className = 'fp-check-item';
      label.innerHTML = `
        <input type="checkbox" value="${sem.id}"
          ${this.currentSemesters.has(sem.id) ? 'checked' : ''}
          onchange="app.toggleSemester('${sem.id}', this.checked)">
        <span>${sem.label}</span>
      `;
      checks.appendChild(label);
    });
    this.updateFilterBadge();
  }

  /** فتح/إغلاق لوحة الفلتر */
  toggleFilter() {
    const panel = document.getElementById('filter-panel');
    if (!panel) return;
    const isOpen = !panel.classList.contains('hidden');
    if (isOpen) {
      panel.classList.add('hidden');
      if (this._closeFilterHandler) {
        document.removeEventListener('click', this._closeFilterHandler);
        this._closeFilterHandler = null;
      }
    } else {
      this.syncFilterUI();
      panel.classList.remove('hidden');
      setTimeout(() => {
        this._closeFilterHandler = (e) => {
          const btn = document.getElementById('btn-filter');
          if (!panel.contains(e.target) && !btn?.contains(e.target)) {
            panel.classList.add('hidden');
            document.removeEventListener('click', this._closeFilterHandler);
            this._closeFilterHandler = null;
          }
        };
        document.addEventListener('click', this._closeFilterHandler);
      }, 0);
    }
  }

  /** مزامنة حالة واجهة الفلتر مع الحالة الداخلية */
  syncFilterUI() {
    CONFIG.semesters.forEach(sem => {
      const cb = document.querySelector(`#semester-checks input[value="${sem.id}"]`);
      if (cb) cb.checked = this.currentSemesters.has(sem.id);
    });
    const useDates = !!(this.dateFrom || this.dateTo);
    const useDateCb = document.getElementById('use-date-range');
    const dateInputs = document.getElementById('date-range-inputs');
    if (useDateCb) useDateCb.checked = useDates;
    if (dateInputs) dateInputs.classList.toggle('hidden', !useDates);
    const fmtDate = d => {
      if (!d) return '';
      const y  = d.getFullYear();
      const m  = String(d.getMonth() + 1).padStart(2, '0');
      const dy = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dy}`;
    };
    const fromEl = document.getElementById('date-from');
    const toEl   = document.getElementById('date-to');
    if (fromEl) fromEl.value = fmtDate(this.dateFrom);
    if (toEl)   toEl.value   = fmtDate(this.dateTo);
  }

  /** تفعيل/إلغاء فصل دراسي واحد */
  toggleSemester(semId, checked) {
    if (checked) this.currentSemesters.add(semId);
    else         this.currentSemesters.delete(semId);
  }

  /** اختيار الفصل الحالي فقط */
  selectCurrentSemester() {
    const cur = this.engine.getCurrentSemesterId();
    this.currentSemesters = cur ? new Set([cur]) : new Set();
    this.syncFilterUI();
  }

  /** إلغاء تحديد جميع الفصول (= عرض الكل) */
  clearSemesters() {
    this.currentSemesters = new Set();
    this.syncFilterUI();
  }

  /** إظهار/إخفاء حقول النطاق الزمني */
  toggleDateRange(checked) {
    const dateInputs = document.getElementById('date-range-inputs');
    if (dateInputs) dateInputs.classList.toggle('hidden', !checked);
    if (!checked) { this.dateFrom = null; this.dateTo = null; }
  }

  /** تطبيق الفلتر */
  applyFilter() {
    // اقرأ الخانات
    const checks = document.querySelectorAll('#semester-checks input[type=checkbox]');
    this.currentSemesters = new Set();
    checks.forEach(cb => { if (cb.checked) this.currentSemesters.add(cb.value); });

    // النطاق الزمني
    const useDates = document.getElementById('use-date-range')?.checked;
    if (useDates) {
      const fromVal = document.getElementById('date-from')?.value;
      const toVal   = document.getElementById('date-to')?.value;
      this.dateFrom = fromVal ? this._localDate(fromVal) : null;
      this.dateTo   = toVal   ? this._localDate(toVal)   : null;
    } else {
      this.dateFrom = null;
      this.dateTo   = null;
    }

    this.updateFilterBadge();
    document.getElementById('filter-panel')?.classList.add('hidden');
    this.renderCurrentView();
  }

  /** إعادة تعيين الفلتر إلى الفصل الحالي */
  resetFilter() {
    const cur = this.engine.getCurrentSemesterId();
    this.currentSemesters = cur ? new Set([cur]) : new Set();
    this.dateFrom = null;
    this.dateTo   = null;
    this.syncFilterUI();
    this.updateFilterBadge();
    document.getElementById('filter-panel')?.classList.add('hidden');
    this.renderCurrentView();
  }

  /** تحديث شارة عداد الفلاتر النشطة */
  updateFilterBadge() {
    const badge = document.getElementById('filter-badge');
    if (!badge) return;
    const count = this.currentSemesters.size + (this.dateFrom || this.dateTo ? 1 : 0);
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // ==================== أدوات مساعدة ====================

  async refresh() {
    const btn = document.querySelector('.btn-refresh');
    if (btn) btn.classList.add('loading');

    try {
      await this.engine.fetchAll();
      this.renderCurrentView();
      this.updateLastFetchTime();
      this.showToast('تم تحديث البيانات');
    } catch (err) {
      this.showToast('خطأ في التحديث');
    } finally {
      if (btn) btn.classList.remove('loading');
    }
  }

  setupAutoRefresh() {
    if (CONFIG.autoRefreshMinutes > 0) {
      setInterval(() => this.refresh(), CONFIG.autoRefreshMinutes * 60 * 1000);
    }
  }

  updateLastFetchTime() {
    const el = document.getElementById('last-update');
    if (el && this.engine.lastFetch) {
      el.textContent = 'آخر تحديث: ' + this.engine.lastFetch.toLocaleTimeString('ar-SA');
    }
  }

  showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) {
      if (show) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  }

  showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  /** تحويل قيمة input[type=date] "YYYY-MM-DD" إلى Date بالتوقيت المحلي (لا UTC) */
  _localDate(val) {
    const [y, m, d] = val.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // ==================== التحليلات ====================
  renderAnalytics() {
    const container = document.getElementById('view-analytics');
    const filter = this.getCurrentFilter();
    const heatmap = this.engine.getActivityHeatmap(filter);
    const weekly = this.engine.getWeeklyProgress(filter);
    const methods = this.engine.getMethodDistribution(filter);
    const projections = this.engine.getProjections(filter);
    const patterns = this.engine.getQualityPatterns(filter);

    let html = '';

    // خريطة النشاط
    const dayLabels = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
    html += `
      <div class="heatmap-container">
        <div class="heatmap-title">خريطة النشاط (آخر 12 أسبوع)</div>
        <div class="heatmap-labels">
          ${dayLabels.map(d => `<span>${d}</span>`).join('')}
        </div>
        <div class="heatmap-grid">
          ${heatmap.map(c => `<div class="heatmap-cell" data-level="${c.level}" data-tooltip="${c.date}: ${c.count} تنفيذ"></div>`).join('')}
        </div>
        <div class="heatmap-legend">
          <span>أقل</span>
          <div class="cell" style="background:#ebedf0"></div>
          <div class="cell" style="background:#9be9a8"></div>
          <div class="cell" style="background:#40c463"></div>
          <div class="cell" style="background:#30a14e"></div>
          <div class="cell" style="background:#216e39"></div>
          <span>أكثر</span>
        </div>
      </div>
    `;

    // رسم التقدم الأسبوعي
    html += `
      <div class="charts-row">
        <div class="chart-container">
          <div class="chart-title">التقدم الأسبوعي</div>
          <canvas id="chart-weekly-progress"></canvas>
        </div>
        <div class="chart-container">
          <div class="chart-title">توزيع وسائل التنفيذ</div>
          <canvas id="chart-methods"></canvas>
        </div>
      </div>
    `;

    // تحليل أنماط الجودة
    if (patterns.periodAnalysis.length > 0) {
      html += `
        <div class="charts-row">
          <div class="chart-container">
            <div class="chart-title">الجودة حسب الفترة</div>
            <canvas id="chart-quality-period"></canvas>
          </div>
      `;
      if (patterns.topDeficiencies.length > 0) {
        html += `
          <div class="chart-container">
            <div class="chart-title">أبرز أسباب النقص</div>
            <canvas id="chart-deficiencies"></canvas>
          </div>
        `;
      }
      html += '</div>';
    }

    // توقعات الإكمال
    html += `
      <div class="section-header">
        <h2 class="section-title">توقعات إكمال المستهدف</h2>
      </div>
      <div class="projection-cards">
    `;
    projections.forEach(p => {
      let statusClass = '', statusText = '', dateText = '';
      if (p.status === 'completed') {
        statusClass = 'completed';
        statusText = 'مكتمل';
        dateText = '✅ تم الإكمال';
      } else if (p.status === 'on-track') {
        statusClass = 'on-track';
        statusText = 'على المسار';
        dateText = p.projectedDate ? p.projectedDate.toLocaleDateString('ar-SA') : '-';
      } else if (p.status === 'behind') {
        statusClass = 'behind';
        statusText = 'متأخر';
        dateText = p.projectedDate ? p.projectedDate.toLocaleDateString('ar-SA') : '-';
      } else {
        statusClass = '';
        statusText = 'بيانات غير كافية';
        dateText = '-';
      }
      html += `
        <div class="projection-card ${statusClass}">
          <div class="proj-team">${p.team} <span style="font-size:0.75rem;color:var(--text-light)">(${CONFIG.stages[p.stage]?.shortLabel || p.stage})</span></div>
          <div class="proj-date">${dateText}</div>
          <div class="proj-sub">${statusText} — ${p.executed}/${p.target} بطاقة${p.daysRemaining ? ` — ${p.daysRemaining} يوم متبقي` : ''}</div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;

    // رسم الأسبوعي
    this.destroyChart('chart-weekly-progress');
    const ctx1 = document.getElementById('chart-weekly-progress');
    if (ctx1) {
      this.charts['chart-weekly-progress'] = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: weekly.map(w => w.label),
          datasets: [{
            label: 'عدد التنفيذات',
            data: weekly.map(w => w.count),
            borderColor: '#4A7EA5',
            backgroundColor: 'rgba(74,126,165,0.15)',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: '#4A7EA5',
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } },
        },
      });
    }

    // رسم الوسائل
    this.destroyChart('chart-methods');
    const ctx2 = document.getElementById('chart-methods');
    if (ctx2 && methods.length > 0) {
      this.charts['chart-methods'] = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: methods.map(m => m.name),
          datasets: [{
            data: methods.map(m => m.count),
            backgroundColor: CONFIG.display.chartColors.slice(0, methods.length),
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal' } } } },
        },
      });
    }

    // رسم الجودة حسب الفترة
    this.destroyChart('chart-quality-period');
    const ctx3 = document.getElementById('chart-quality-period');
    if (ctx3 && patterns.periodAnalysis.length > 0) {
      this.charts['chart-quality-period'] = new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: patterns.periodAnalysis.map(p => p.period),
          datasets: [{
            label: 'متوسط الجودة',
            data: patterns.periodAnalysis.map(p => p.avg.toFixed(1)),
            backgroundColor: patterns.periodAnalysis.map(p => this.engine.getQualityLevel(p.avg).color + 'CC'),
            borderColor: patterns.periodAnalysis.map(p => this.engine.getQualityLevel(p.avg).color),
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, max: 10 } },
        },
      });
    }

    // رسم أسباب النقص
    this.destroyChart('chart-deficiencies');
    const ctx4 = document.getElementById('chart-deficiencies');
    if (ctx4 && patterns.topDeficiencies.length > 0) {
      this.charts['chart-deficiencies'] = new Chart(ctx4, {
        type: 'bar',
        data: {
          labels: patterns.topDeficiencies.map(d => d.reason.substring(0, 30)),
          datasets: [{
            label: 'عدد المرات',
            data: patterns.topDeficiencies.map(d => d.count),
            backgroundColor: '#D95F5FCC',
            borderColor: '#D95F5F',
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true }, y: { ticks: { font: { family: 'Tajawal', size: 11 } } } },
        },
      });
    }
  }

  // ==================== المقارنة ====================
  renderComparison() {
    const container = document.getElementById('view-comparison');
    const semesters = CONFIG.semesters;

    // القيم الافتراضية
    if (!this._compSem1) this._compSem1 = semesters.length > 1 ? semesters[semesters.length - 2].id : semesters[0]?.id;
    if (!this._compSem2) this._compSem2 = semesters[semesters.length - 1]?.id;

    let html = `
      <div class="comparison-header">
        <select id="comp-sem1" onchange="app._compSem1=this.value; app.renderComparison()">
          ${semesters.map(s => `<option value="${s.id}" ${s.id === this._compSem1 ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <span style="font-size:1.2rem;font-weight:700">مقابل</span>
        <select id="comp-sem2" onchange="app._compSem2=this.value; app.renderComparison()">
          ${semesters.map(s => `<option value="${s.id}" ${s.id === this._compSem2 ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
    `;

    if (this._compSem1 && this._compSem2) {
      const comp = this.engine.compareSemesters(this._compSem1, this._compSem2);
      const s1 = comp.sem1.stats, s2 = comp.sem2.stats;
      const q1 = s1.qualityDetails?.overall || 0, q2 = s2.qualityDetails?.overall || 0;

      const arrow = (v1, v2) => v2 > v1 ? '<span class="comp-arrow up">▲</span>' : v2 < v1 ? '<span class="comp-arrow down">▼</span>' : '<span class="comp-arrow neutral">━</span>';

      html += `
        <div class="comparison-cards">
          <div class="comparison-card">
            <div class="comp-label">إجمالي التنفيذ</div>
            <div class="comp-values">
              <span class="comp-val">${s1.totalExecutions}</span>
              ${arrow(s1.totalExecutions, s2.totalExecutions)}
              <span class="comp-val">${s2.totalExecutions}</span>
            </div>
          </div>
          <div class="comparison-card">
            <div class="comp-label">المستفيدون</div>
            <div class="comp-values">
              <span class="comp-val">${s1.totalBeneficiaries.toLocaleString('ar-SA')}</span>
              ${arrow(s1.totalBeneficiaries, s2.totalBeneficiaries)}
              <span class="comp-val">${s2.totalBeneficiaries.toLocaleString('ar-SA')}</span>
            </div>
          </div>
          <div class="comparison-card">
            <div class="comp-label">الفرق النشطة</div>
            <div class="comp-values">
              <span class="comp-val">${s1.activeTeams}</span>
              ${arrow(s1.activeTeams, s2.activeTeams)}
              <span class="comp-val">${s2.activeTeams}</span>
            </div>
          </div>
          <div class="comparison-card">
            <div class="comp-label">متوسط الجودة</div>
            <div class="comp-values">
              <span class="comp-val">${q1 ? q1.toFixed(1) : '-'}</span>
              ${arrow(q1, q2)}
              <span class="comp-val">${q2 ? q2.toFixed(1) : '-'}</span>
            </div>
          </div>
        </div>
        <div class="charts-row">
          <div class="chart-container">
            <div class="chart-title">مقارنة إنجاز الفرق بين الفصلين</div>
            <canvas id="chart-comp-teams"></canvas>
          </div>
          <div class="chart-container">
            <div class="chart-title">مقارنة الجودة بين الفصلين</div>
            <canvas id="chart-comp-quality"></canvas>
          </div>
        </div>
      `;

      container.innerHTML = html;

      // رسم مقارنة الفرق
      const allTeamNames = [...new Set([
        ...Object.values(CONFIG.teams).flat()
      ])];

      const getTeamExec = (stats, name) => {
        for (const s of Object.values(stats.stageStats)) {
          const t = s.teams.find(t => t.name === name);
          if (t) return t.executions;
        }
        return 0;
      };
      const getTeamQual = (stats, name) => {
        for (const s of Object.values(stats.stageStats)) {
          const t = s.teams.find(t => t.name === name);
          if (t && t.qualityAvg !== null) return t.qualityAvg;
        }
        return 0;
      };

      this.destroyChart('chart-comp-teams');
      const ctxT = document.getElementById('chart-comp-teams');
      if (ctxT) {
        this.charts['chart-comp-teams'] = new Chart(ctxT, {
          type: 'bar',
          data: {
            labels: allTeamNames,
            datasets: [
              { label: comp.sem1.label, data: allTeamNames.map(n => getTeamExec(s1, n)), backgroundColor: '#4A7EA5CC', borderColor: '#4A7EA5', borderWidth: 1, borderRadius: 4 },
              { label: comp.sem2.label, data: allTeamNames.map(n => getTeamExec(s2, n)), backgroundColor: '#6FA96CCC', borderColor: '#6FA96C', borderWidth: 1, borderRadius: 4 },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { labels: { font: { family: 'Tajawal' } } } },
            scales: { y: { beginAtZero: true }, x: { ticks: { font: { family: 'Tajawal' } } } },
          },
        });
      }

      this.destroyChart('chart-comp-quality');
      const ctxQ = document.getElementById('chart-comp-quality');
      if (ctxQ) {
        this.charts['chart-comp-quality'] = new Chart(ctxQ, {
          type: 'bar',
          data: {
            labels: allTeamNames,
            datasets: [
              { label: comp.sem1.label, data: allTeamNames.map(n => getTeamQual(s1, n)), backgroundColor: '#2196F3CC', borderColor: '#2196F3', borderWidth: 1, borderRadius: 4 },
              { label: comp.sem2.label, data: allTeamNames.map(n => getTeamQual(s2, n)), backgroundColor: '#4CAF50CC', borderColor: '#4CAF50', borderWidth: 1, borderRadius: 4 },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { labels: { font: { family: 'Tajawal' } } } },
            scales: { y: { beginAtZero: true, max: 10 }, x: { ticks: { font: { family: 'Tajawal' } } } },
          },
        });
      }
    } else {
      container.innerHTML = html;
    }
  }

  // ==================== البحث الشامل ====================
  renderSearch() {
    const container = document.getElementById('view-search');
    const query = this._searchQuery || '';
    const recentSearches = JSON.parse(localStorage.getItem('baraa_recent_searches') || '[]');

    let html = `
      <div class="search-container">
        <input type="text" class="search-box" placeholder="ابحث عن فريق، بطاقة، منفذ..."
          value="${query.replace(/"/g, '&quot;')}"
          oninput="app._searchQuery=this.value; app._searchDebounce()"
          id="global-search-input">
    `;

    if (!query && recentSearches.length > 0) {
      html += `
        <div class="recent-searches">
          <div class="recent-label">عمليات بحث سابقة</div>
          <div class="recent-tags">
            ${recentSearches.map(s => `<button class="recent-tag" onclick="app._searchQuery='${s.replace(/'/g, "\\'")}'; app.renderSearch()">${s}</button>`).join('')}
          </div>
        </div>
      `;
    }
    html += '</div>';

    if (query.length >= 2) {
      // حفظ البحث
      this._saveRecentSearch(query);

      const col = CONFIG.executionColumns;
      const filter = this.getCurrentFilter();

      // بحث في الفرق
      const allTeams = Object.values(CONFIG.teams).flat();
      const matchedTeams = allTeams.filter(t => t.includes(query));
      if (matchedTeams.length > 0) {
        html += `<div class="search-results-section"><div class="section-label">الفرق (${matchedTeams.length})</div>`;
        matchedTeams.forEach(t => {
          const stage = Object.entries(CONFIG.teams).find(([s, teams]) => teams.includes(t));
          html += `
            <div class="search-result-item" onclick="app.showTeamDetail('${t}')">
              <div class="result-icon">👥</div>
              <div class="result-text">
                <div class="result-title">${t}</div>
                <div class="result-sub">${stage ? CONFIG.stages[stage[0]]?.label : ''}</div>
              </div>
            </div>
          `;
        });
        html += '</div>';
      }

      // بحث في البطاقات
      const execRows = this.engine.filterExecution({ filter });
      const matchedCards = new Map();
      execRows.forEach(row => {
        const card = row[col.card];
        if (card && card.includes(query) && !matchedCards.has(card)) {
          matchedCards.set(card, { name: card, team: row[col.team], executor: row[col.executor] });
        }
      });
      if (matchedCards.size > 0) {
        html += `<div class="search-results-section"><div class="section-label">البطاقات (${matchedCards.size})</div>`;
        matchedCards.forEach(c => {
          html += `
            <div class="search-result-item" onclick="app.showTeamDetail('${c.team}')">
              <div class="result-icon">📋</div>
              <div class="result-text">
                <div class="result-title">${c.name}</div>
                <div class="result-sub">فريق ${c.team}</div>
              </div>
            </div>
          `;
        });
        html += '</div>';
      }

      // بحث في المنفذين
      const matchedExecutors = new Map();
      execRows.forEach(row => {
        const executor = row[col.executor];
        if (executor && executor.includes(query) && !matchedExecutors.has(executor)) {
          matchedExecutors.set(executor, { name: executor, team: row[col.team], card: row[col.card] });
        }
      });
      if (matchedExecutors.size > 0) {
        html += `<div class="search-results-section"><div class="section-label">المنفذون (${matchedExecutors.size})</div>`;
        matchedExecutors.forEach(e => {
          html += `
            <div class="search-result-item" onclick="app.showTeamDetail('${e.team}')">
              <div class="result-icon">🧑</div>
              <div class="result-text">
                <div class="result-title">${e.name}</div>
                <div class="result-sub">فريق ${e.team} — ${e.card || ''}</div>
              </div>
            </div>
          `;
        });
        html += '</div>';
      }

      if (matchedTeams.length === 0 && matchedCards.size === 0 && matchedExecutors.size === 0) {
        html += '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">لم يتم العثور على نتائج</div></div>';
      }
    } else if (query.length > 0) {
      html += '<div class="empty-state"><div class="empty-text">أدخل حرفين على الأقل للبحث</div></div>';
    }

    container.innerHTML = html;
    // إبقاء التركيز على حقل البحث
    const input = document.getElementById('global-search-input');
    if (input) { input.focus(); input.selectionStart = input.selectionEnd = input.value.length; }
  }

  _searchDebounce() {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.renderSearch(), 250);
  }

  _saveRecentSearch(q) {
    if (!q || q.length < 2) return;
    let recent = JSON.parse(localStorage.getItem('baraa_recent_searches') || '[]');
    recent = recent.filter(s => s !== q);
    recent.unshift(q);
    if (recent.length > 8) recent = recent.slice(0, 8);
    localStorage.setItem('baraa_recent_searches', JSON.stringify(recent));
  }

  // ==================== التنبيهات ====================
  renderAlerts() {
    const container = document.getElementById('view-alerts');
    const alerts = this.engine.getSmartAlerts(this.getCurrentFilter());

    const warnings = alerts.filter(a => a.type === 'warning');
    const achievements = alerts.filter(a => a.type === 'achievement');
    const infos = alerts.filter(a => a.type === 'info');

    let html = `
      <div class="alerts-summary">
        <div class="alert-summary-card">
          <div class="alert-icon">⚠️</div>
          <div class="alert-count" style="color:var(--danger)">${warnings.length}</div>
          <div class="alert-label">تحتاج متابعة</div>
        </div>
        <div class="alert-summary-card">
          <div class="alert-icon">🏆</div>
          <div class="alert-count" style="color:var(--accent)">${achievements.length}</div>
          <div class="alert-label">إنجازات</div>
        </div>
        <div class="alert-summary-card">
          <div class="alert-icon">📊</div>
          <div class="alert-count" style="color:var(--primary)">${infos.length}</div>
          <div class="alert-label">معلومات</div>
        </div>
      </div>
    `;

    if (alerts.length === 0) {
      html += '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">لا توجد تنبيهات — جميع الفرق تسير بشكل جيد</div></div>';
    }

    if (warnings.length > 0) {
      html += '<div class="section-header"><h2 class="section-title">تحتاج متابعة</h2></div>';
      warnings.forEach(a => {
        html += `<div class="alert-item warning">
          <div class="alert-item-icon">${a.icon}</div>
          <div class="alert-item-content">
            <div class="alert-item-msg">${a.message}</div>
            <div class="alert-item-detail">${a.detail}</div>
          </div>
        </div>`;
      });
    }

    if (achievements.length > 0) {
      html += '<div class="section-header" style="margin-top:24px"><h2 class="section-title">إنجازات</h2></div>';
      achievements.forEach(a => {
        html += `<div class="alert-item achievement">
          <div class="alert-item-icon">${a.icon}</div>
          <div class="alert-item-content">
            <div class="alert-item-msg">${a.message}</div>
            <div class="alert-item-detail">${a.detail}</div>
          </div>
        </div>`;
      });
    }

    if (infos.length > 0) {
      html += '<div class="section-header" style="margin-top:24px"><h2 class="section-title">معلومات</h2></div>';
      infos.forEach(a => {
        html += `<div class="alert-item info">
          <div class="alert-item-icon">${a.icon}</div>
          <div class="alert-item-content">
            <div class="alert-item-msg">${a.message}</div>
            <div class="alert-item-detail">${a.detail}</div>
          </div>
        </div>`;
      });
    }

    container.innerHTML = html;
  }

  // ==================== لوحة التحكم (Admin) ====================
  renderAdmin() {
    const container = document.getElementById('view-admin');
    const adminData = JSON.parse(localStorage.getItem('baraa_admin') || '{}');

    let html = '';

    // إشعار
    html += `<div class="admin-notice">⚠️ التعديلات هنا تُحفظ في المتصفح المحلي فقط ولا تؤثر على مصدر البيانات الأصلي (Google Sheets).</div>`;

    // ==================== إدارة المستهدفات ====================
    html += `
      <div class="admin-section">
        <div class="admin-title">🎯 إدارة المستهدفات</div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>المرحلة</th>
              ${CONFIG.semesters.map(s => `<th>${s.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;
    for (const [stageName, stageConf] of Object.entries(CONFIG.stages)) {
      html += `<tr><td style="font-weight:600">${stageConf.label}</td>`;
      CONFIG.semesters.forEach(sem => {
        const currentVal = this._getAdminTarget(stageName, sem.id);
        html += `<td><input type="number" min="0" value="${currentVal}"
          data-stage="${stageName}" data-sem="${sem.id}"
          onchange="app._setAdminTarget('${stageName}', '${sem.id}', this.value)"></td>`;
      });
      html += '</tr>';
    }
    html += `
          </tbody>
        </table>
        <div class="admin-actions">
          <button class="admin-btn primary" onclick="app._saveAdminTargets()">حفظ المستهدفات</button>
          <button class="admin-btn outline" onclick="app._resetAdminTargets()">استعادة الافتراضي</button>
        </div>
      </div>
    `;

    // ==================== إدارة الفرق ====================
    html += `
      <div class="admin-section">
        <div class="admin-title">👥 إدارة الفرق</div>
    `;
    for (const [stageName, stageConf] of Object.entries(CONFIG.stages)) {
      const teams = CONFIG.teams[stageName] || [];
      html += `
        <div style="margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:8px">${stageConf.label}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            ${teams.map(t => `<span class="admin-tag">${t} <span class="remove-tag" onclick="app._removeTeam('${stageName}', '${t}')">×</span></span>`).join('')}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="new-team-${stageName}" placeholder="اسم الفريق الجديد"
              style="padding:8px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:inherit;font-size:0.85rem;flex:1;max-width:240px">
            <button class="admin-btn success" onclick="app._addTeam('${stageName}')">إضافة</button>
          </div>
        </div>
      `;
    }
    html += '</div>';

    // ==================== إدارة الفصول الدراسية ====================
    html += `
      <div class="admin-section">
        <div class="admin-title">📅 الفصول الدراسية</div>
        <table class="admin-table">
          <thead>
            <tr><th>الفصل</th><th>بداية (ميلادي)</th><th>نهاية (ميلادي)</th><th>الحالة</th></tr>
          </thead>
          <tbody>
    `;
    const curSem = this.engine.getCurrentSemesterId();
    CONFIG.semesters.forEach(sem => {
      const isCurrent = sem.id === curSem;
      html += `
        <tr${isCurrent ? ' style="background:#e8f5e9"' : ''}>
          <td style="font-weight:600">${sem.label}</td>
          <td>${sem.startGreg}</td>
          <td>${sem.endGreg}</td>
          <td>${isCurrent ? '<span style="color:var(--accent);font-weight:600">● الحالي</span>' : ''}</td>
        </tr>
      `;
    });
    html += '</tbody></table></div>';

    // ==================== تصدير/استيراد الإعدادات ====================
    html += `
      <div class="admin-section">
        <div class="admin-title">💾 النسخ الاحتياطي</div>
        <div class="admin-actions">
          <button class="admin-btn primary" onclick="app._exportSettings()">📤 تصدير الإعدادات</button>
          <button class="admin-btn outline" onclick="document.getElementById('import-settings').click()">📥 استيراد الإعدادات</button>
          <input type="file" id="import-settings" accept=".json" style="display:none" onchange="app._importSettings(this)">
          <button class="admin-btn danger" onclick="app._clearAllSettings()">🗑 مسح جميع الإعدادات المحلية</button>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // --- Admin helpers ---
  _getAdminTarget(stage, semId) {
    const overrides = JSON.parse(localStorage.getItem('baraa_targets') || '{}');
    if (overrides[stage] && overrides[stage][semId] !== undefined) return overrides[stage][semId];
    return CONFIG.targets[stage]?.[semId] || 0;
  }

  _setAdminTarget(stage, semId, value) {
    const overrides = JSON.parse(localStorage.getItem('baraa_targets') || '{}');
    if (!overrides[stage]) overrides[stage] = {};
    overrides[stage][semId] = parseInt(value) || 0;
    localStorage.setItem('baraa_targets', JSON.stringify(overrides));
  }

  _saveAdminTargets() {
    // تطبيق على CONFIG
    const overrides = JSON.parse(localStorage.getItem('baraa_targets') || '{}');
    for (const [stage, sems] of Object.entries(overrides)) {
      if (!CONFIG.targets[stage]) CONFIG.targets[stage] = {};
      for (const [semId, val] of Object.entries(sems)) {
        CONFIG.targets[stage][semId] = val;
      }
    }
    this.renderCurrentView();
    this.showToast('تم حفظ المستهدفات');
  }

  _resetAdminTargets() {
    localStorage.removeItem('baraa_targets');
    this.showToast('تمت استعادة المستهدفات الافتراضية');
    this.renderAdmin();
  }

  _addTeam(stage) {
    const input = document.getElementById(`new-team-${stage}`);
    const name = input?.value.trim();
    if (!name) return;
    if (!CONFIG.teams[stage]) CONFIG.teams[stage] = [];
    if (CONFIG.teams[stage].includes(name)) { this.showToast('الفريق موجود مسبقاً'); return; }
    CONFIG.teams[stage].push(name);
    this._saveTeamsToLocal();
    this.renderAdmin();
    this.showToast(`تمت إضافة فريق "${name}"`);
  }

  _removeTeam(stage, name) {
    if (!CONFIG.teams[stage]) return;
    CONFIG.teams[stage] = CONFIG.teams[stage].filter(t => t !== name);
    this._saveTeamsToLocal();
    this.renderAdmin();
    this.showToast(`تمت إزالة فريق "${name}"`);
  }

  _saveTeamsToLocal() {
    localStorage.setItem('baraa_teams', JSON.stringify(CONFIG.teams));
  }

  _exportSettings() {
    const settings = {
      targets: JSON.parse(localStorage.getItem('baraa_targets') || '{}'),
      teams: CONFIG.teams,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baraa-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('تم تصدير الإعدادات');
  }

  _importSettings(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target.result);
        if (settings.targets) localStorage.setItem('baraa_targets', JSON.stringify(settings.targets));
        if (settings.teams) {
          CONFIG.teams = settings.teams;
          localStorage.setItem('baraa_teams', JSON.stringify(settings.teams));
        }
        this.renderAdmin();
        this.showToast('تم استيراد الإعدادات');
      } catch (err) {
        this.showToast('خطأ في قراءة الملف');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  _clearAllSettings() {
    localStorage.removeItem('baraa_targets');
    localStorage.removeItem('baraa_teams');
    localStorage.removeItem('baraa_recent_searches');
    this.showToast('تم مسح جميع الإعدادات المحلية');
    this.renderAdmin();
  }

  // ==================== تصدير PDF ====================
  exportPDF() {
    try {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) { this.showToast('مكتبة PDF غير متوفرة'); return; }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const stats = this.engine.getOverallStats(this.getCurrentFilter());
      const pageW = 210, margin = 15;
      let y = 20;

      // العنوان
      doc.setFontSize(20);
      doc.setTextColor(61, 122, 98);
      doc.text(CONFIG.projectName, pageW / 2, y, { align: 'center' });
      y += 10;

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${new Date().toLocaleDateString('ar-SA')} :تاريخ التقرير`, pageW - margin, y, { align: 'right' });
      y += 12;

      // الإحصائيات العامة
      doc.setFontSize(14);
      doc.setTextColor(61, 122, 98);
      doc.text('نظرة عامة', pageW - margin, y, { align: 'right' });
      y += 8;

      doc.setFontSize(10);
      doc.setTextColor(50);
      const qualScore = stats.qualityDetails ? stats.qualityDetails.overall.toFixed(1) : '-';
      const overviewData = [
        [`${stats.totalExecutions}`, 'إجمالي التنفيذ'],
        [`${stats.totalBeneficiaries}`, 'المستفيدون'],
        [`${qualScore}/10`, 'متوسط الجودة'],
        [`${stats.activeTeams}`, 'الفرق النشطة'],
      ];
      overviewData.forEach(([val, label]) => {
        doc.text(`${val} :${label}`, pageW - margin, y, { align: 'right' });
        y += 6;
      });
      y += 8;

      // جدول المراحل
      for (const [stageName, stageConf] of Object.entries(CONFIG.stages)) {
        const s = stats.stageStats[stageName];
        if (!s) continue;

        if (y > 250) { doc.addPage(); y = 20; }

        doc.setFontSize(12);
        doc.setTextColor(61, 122, 98);
        doc.text(`فرق ${stageConf.label}`, pageW - margin, y, { align: 'right' });
        y += 8;

        doc.setFontSize(8);
        doc.setTextColor(80);
        const headers = ['الجودة', 'المستفيدون', 'الإنجاز%', 'المستهدف', 'المنفذ', 'الفريق'];
        const colW = (pageW - 2 * margin) / headers.length;

        // رأس الجدول
        doc.setFillColor(61, 122, 98);
        doc.rect(margin, y - 3, pageW - 2 * margin, 7, 'F');
        doc.setTextColor(255);
        headers.forEach((h, i) => {
          doc.text(h, pageW - margin - i * colW - colW / 2, y + 1, { align: 'center' });
        });
        y += 7;
        doc.setTextColor(50);

        s.teams.sort((a, b) => b.completionRate - a.completionRate).forEach((team, idx) => {
          if (y > 275) { doc.addPage(); y = 20; }
          if (idx % 2 === 0) {
            doc.setFillColor(245, 250, 247);
            doc.rect(margin, y - 3, pageW - 2 * margin, 6, 'F');
          }
          const row = [
            team.qualityAvg !== null ? team.qualityAvg.toFixed(1) : '-',
            `${team.beneficiaries}`,
            `${team.completionRate.toFixed(0)}%`,
            `${team.target || '-'}`,
            `${team.executions}`,
            team.name,
          ];
          row.forEach((val, i) => {
            doc.text(val, pageW - margin - i * colW - colW / 2, y + 1, { align: 'center' });
          });
          y += 6;
        });
        y += 8;
      }

      // تذييل
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text('مشروع بارع — جمعية الراحين — تم إنشاؤه تلقائياً', pageW / 2, 290, { align: 'center' });
        doc.text(`${i}/${totalPages}`, margin, 290);
      }

      doc.save(`تقرير-بارع-${new Date().toISOString().split('T')[0]}.pdf`);
      this.showToast('تم تصدير التقرير بنجاح');
    } catch (err) {
      console.error('PDF export error:', err);
      this.showToast('خطأ في تصدير التقرير');
    }
  }

  // ==================== احتفالات ====================
  showCelebration(message, icon = '🎉') {
    // كونفيتي
    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';
    document.body.appendChild(overlay);

    const colors = ['#4A7EA5', '#6FA96C', '#E8A838', '#D95F5F', '#5E9B8A', '#8FCA8C'];
    for (let i = 0; i < 60; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = Math.random() * 1 + 's';
      piece.style.animationDuration = (2 + Math.random() * 2) + 's';
      overlay.appendChild(piece);
    }

    // رسالة
    const toast = document.createElement('div');
    toast.className = 'milestone-toast';
    toast.innerHTML = `
      <div class="milestone-icon">${icon}</div>
      <div class="milestone-text">${message}</div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => { overlay.remove(); toast.remove(); }, 4000);
  }

  destroyChart(id) {
    if (this.charts[id]) {
      this.charts[id].destroy();
      delete this.charts[id];
    }
  }
}

// ==================== تشغيل التطبيق ====================
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
  app.setupNavigation();
  app.init();
});
