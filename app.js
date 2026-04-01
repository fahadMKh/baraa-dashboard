/**
 * التطبيق الرئيسي - منصة متابعة الشخصية المتكاملة
 */

class App {
  constructor() {
    this.engine = new DataEngine();
    this.currentView = 'overview';
    this.currentSemester = '';
    this.charts = {};
  }

  async init() {
    this.showLoading(true);
    try {
      await this.engine.fetchAll();
      this.populateSemesterFilter();
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
    }
  }

  // ==================== النظرة العامة ====================
  renderOverview() {
    const stats = this.engine.getOverallStats(this.currentSemester);
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
    const nonExec = this.engine.getNonExecutingTeams(this.currentSemester);
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
    const stats = this.engine.getOverallStats(this.currentSemester);

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
  renderTeams() {
    const container = document.getElementById('view-teams');
    const stats = this.engine.getOverallStats(this.currentSemester);

    let html = '<div class="cards-grid">';

    for (const [stageName, stageConf] of Object.entries(CONFIG.stages)) {
      const s = stats.stageStats[stageName];
      if (!s) continue;

      s.teams.sort((a, b) => b.completionRate - a.completionRate).forEach(team => {
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
    const stats = this.engine.getOverallStats(this.currentSemester);

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
    const qualRows = this.engine.filterQuality({ semester: this.currentSemester });
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
    const details = this.engine.getTeamDetails(teamName, this.currentSemester);
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

  // ==================== أدوات مساعدة ====================
  populateSemesterFilter() {
    const select = document.getElementById('semester-filter');
    if (!select) return;

    select.innerHTML = '<option value="">جميع الفصول</option>';
    CONFIG.semesters.forEach(s => {
      select.innerHTML += `<option value="${s.id}">${s.label}</option>`;
    });

    select.addEventListener('change', () => {
      this.currentSemester = select.value;
      this.renderCurrentView();
    });
  }

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
