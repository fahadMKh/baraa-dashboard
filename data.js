/**
 * محرك جلب البيانات من Google Sheets
 */

class DataEngine {
  constructor() {
    this.executionData = [];
    this.qualityData = [];
    this.lastFetch = null;
  }

  buildCSVUrl(sheetId, gid) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }

  /**
   * fetch مع timeout افتراضي 15 ثانية — يمنع تعليق التطبيق إذا تأخر السيرفر
   */
  async _fetchWithTimeout(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`انتهت مهلة الاتصال (${timeoutMs / 1000} ث)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  parseCSV(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    let row = [];
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];
      if (inQuotes) {
        if (char === '"' && next === '"') { current += '"'; i++; }
        else if (char === '"') { inQuotes = false; }
        else { current += char; }
      } else {
        if (char === '"') { inQuotes = true; }
        else if (char === ',') { row.push(current.trim()); current = ''; }
        else if (char === '\n' || (char === '\r' && next === '\n')) {
          row.push(current.trim());
          if (row.some(c => c !== '')) rows.push(row);
          row = []; current = '';
          if (char === '\r') i++;
        } else { current += char; }
      }
    }
    if (current || row.length > 0) {
      row.push(current.trim());
      if (row.some(c => c !== '')) rows.push(row);
    }
    return rows;
  }

  async fetchSheet(sheetId, gid) {
    const url = this.buildCSVUrl(sheetId, gid);
    try {
      const response = await this._fetchWithTimeout(url);
      const text = await response.text();
      const rows = this.parseCSV(text);
      return rows.length > 1 ? rows.slice(1) : [];
    } catch (error) {
      console.error('خطأ في جلب البيانات:', error);
      throw error;
    }
  }

  /**
   * جلب الإعدادات المشتركة من Google Sheet عبر Apps Script
   * يُرجع: { teams, targets, semesters } أو null
   */
  async fetchConfig() {
    const scriptURL = CONFIG.sheets.users?.scriptURL;
    if (!scriptURL) {
      console.warn('⚠️ لم يتم تحديد رابط Apps Script');
      return null;
    }
    try {
      const resp = await this._fetchWithTimeout(`${scriptURL}?action=getConfig`, 10000);
      const config = await resp.json();
      if (config && config.status === 'ok' && config.teams && Object.keys(config.teams).length > 0) {
        console.log('✅ تم جلب الإعدادات المشتركة:', Object.keys(config.teams).length, 'مرحلة');
        return config;
      }
      console.log('📦 لا توجد إعدادات مشتركة في الشيت (استخدام الإعدادات المحلية)');
      return null;
    } catch (err) {
      console.error('خطأ في جلب الإعدادات:', err);
      return null;
    }
  }

  async fetchAll() {
    const [execRows, qualRows] = await Promise.all([
      this.fetchSheet(CONFIG.sheets.execution.id, CONFIG.sheets.execution.gid),
      this.fetchSheet(CONFIG.sheets.quality.id, CONFIG.sheets.quality.gid),
    ]);
    this.executionData = execRows;
    this.qualityData = qualRows;
    this.lastFetch = new Date();
    return { execution: this.executionData, quality: this.qualityData };
  }

  /**
   * جلب قائمة المستخدمين من Google Sheet الموحّد
   * يُرجع مصفوفة: [{ username, name, password, role, team }]
   * في حال الفشل يُرجع null (استخدم القائمة المحلية كبديل)
   */
  async fetchUsers() {
    const cfg = CONFIG.sheets.users;
    if (!cfg || !cfg.id || !cfg.gid || cfg.gid === 'USERS_GID_HERE') {
      console.warn('⚠️ لم يتم إعداد جدول المستخدمين الموحّد بعد');
      return null;
    }
    try {
      const rows = await this.fetchSheet(cfg.id, cfg.gid);
      const cols = CONFIG.usersColumns;
      // تحويل الأدوار العربية للإنجليزية
      const roleMap = { 'مشرف': 'admin', 'قائد فريق': 'leader', 'قائد': 'leader', 'منفذ': 'executor' };
      return rows.map(row => {
        let rawRole = (row[cols.role] || 'executor').trim().toLowerCase();
        let role = roleMap[rawRole] || rawRole; // إذا عربي حوّله، وإلا استخدمه كما هو
        if (!['admin', 'leader', 'executor'].includes(role)) role = 'executor';

        let pwd = (row[cols.password] || '').trim();
        // إذا كلمة المرور غير مشفرة بـ Base64، شفّرها
        try { atob(pwd); } catch { pwd = btoa(pwd); }

        return {
          username: (row[cols.username] || '').trim(),
          name:     (row[cols.name] || '').trim(),
          password: pwd,
          role,
          team:     (row[cols.team] || '').trim() || null,
        };
      }).filter(u => u.username && u.name);
    } catch (err) {
      console.error('خطأ في جلب المستخدمين:', err);
      return null;
    }
  }

  /**
   * تحويل ميلادي → هجري (Jean Meeus)
   * تصحيح +1 للتوافق مع تقويم أم القرى
   */
  gregorianToHijri(gYear, gMonth, gDay) {
    const a = Math.floor((14 - gMonth) / 12);
    const y = gYear + 4800 - a;
    const m = gMonth + 12 * a - 3;
    const jdn = gDay + Math.floor((153 * m + 2) / 5) + 365 * y
      + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    const l  = (jdn + 1) - 1948440 + 10632;
    const n  = Math.floor((l - 1) / 10631);
    const l2 = l - 10631 * n + 354;
    const j  = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719)
      + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
    const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
      - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
    const hMonth = Math.floor((24 * l3) / 709);
    const hDay   = l3 - Math.floor((709 * hMonth) / 24);
    const hYear  = 30 * n + j - 30;
    return { year: hYear, month: hMonth, day: hDay };
  }

  /**
   * تحويل هجري → ميلادي (Jean Meeus معكوساً)
   */
  hijriToGregorian(hYear, hMonth, hDay) {
    const jdn = Math.floor((11 * hYear + 3) / 30) + 354 * hYear + 30 * hMonth
      - Math.floor((hMonth - 1) / 2) + hDay + 1948440 - 385;
    let l = jdn + 68569;
    const n = Math.floor((4 * l) / 146097);
    l -= Math.floor((146097 * n + 3) / 4);
    const i = Math.floor((4000 * (l + 1)) / 1461001);
    l -= Math.floor((1461 * i) / 4) - 31;
    const j = Math.floor((80 * l) / 2447);
    const day = l - Math.floor((2447 * j) / 80);
    const k = Math.floor(j / 11);
    const month = j + 2 - 12 * k;
    const year = 100 * (n - 49) + i + k;
    return { year, month, day };
  }

  /**
   * نص تاريخ (هجري أو ميلادي) → كائن Date ميلادي
   */
  getGregorianDate(dateStr) {
    if (!dateStr) return null;
    const m = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!m) return null;
    const y = parseInt(m[1]), mo = parseInt(m[2]), d = parseInt(m[3]);
    if (y >= 1500) return new Date(y, mo - 1, d);
    const greg = this.hijriToGregorian(y, mo, d);
    return new Date(greg.year, greg.month - 1, greg.day);
  }

  /**
   * الفصل الدراسي الحالي بناءً على تاريخ اليوم الميلادي
   */
  getCurrentSemesterId() {
    const today = new Date();
    for (const sem of CONFIG.semesters) {
      const [sy, sm, sd] = sem.startGreg.split('/').map(Number);
      const [ey, em, ed] = sem.endGreg.split('/').map(Number);
      if (today >= new Date(sy, sm - 1, sd) && today <= new Date(ey, em - 1, ed))
        return sem.id;
    }
    return null;
  }

  /**
   * تحليل التاريخ — يكتشف تلقائياً هجري أم ميلادي
   */
  parseHijriDate(text) {
    if (!text) return null;
    const match = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!match) return null;
    const y = parseInt(match[1]), mo = parseInt(match[2]), d = parseInt(match[3]);
    if (y >= 1500) return this.gregorianToHijri(y, mo, d);
    return { year: y, month: mo, day: d };
  }

  /**
   * تحديد الفصل من تاريخ هجري — يقارن مقابل startHijri/endHijri
   */
  getSemester(dateStr) {
    const date = this.parseHijriDate(dateStr);
    if (!date) return null;
    const d = date.year * 10000 + date.month * 100 + date.day;
    for (const sem of CONFIG.semesters) {
      const s = sem.startHijri, e = sem.endHijri;
      const start = s.year * 10000 + s.month * 100 + s.day;
      const end   = e.year * 10000 + e.month * 100 + e.day;
      if (d >= start && d <= end) return sem.id;
    }
    return null;
  }

  getDateFromTimestamp(timestamp) {
    if (!timestamp) return null;
    const match = timestamp.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!match) return null;
    return `${match[1]}/${match[2].padStart(2,'0')}/${match[3].padStart(2,'0')}`;
  }

  /**
   * تحويل تاريخ ميلادي (YYYY/MM/DD أو YYYY-MM-DD) → نص هجري معروض بالعربية
   * مثال: "2024/11/17" → "١٥ جمادى الأولى ١٤٤٦"
   */
  /** تحويل الأرقام ASCII → عربية-هندية بدون فواصل: 1447 → ١٤٤٧ */
  _toArabicDigits(n) {
    return String(n).replace(/\d/g, d => String.fromCharCode(0x0660 + parseInt(d)));
  }

  hijriDisplayFromGregorian(dateStr) {
    if (!dateStr) return '-';
    const m = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!m) return dateStr;
    const y = parseInt(m[1]), mo = parseInt(m[2]), d = parseInt(m[3]);
    const months = ['محرم','صفر','ربيع الأول','ربيع الثاني',
                    'جمادى الأولى','جمادى الآخرة','رجب','شعبان',
                    'رمضان','شوال','ذو القعدة','ذو الحجة'];
    // إن كانت السنة هجرية أصلاً (< 1500) → نعرضها مباشرة
    if (y < 1500) {
      const mName = months[mo - 1] || String(mo);
      return `${this._toArabicDigits(d)} ${mName} ${this._toArabicDigits(y)}`;
    }
    const h = this.gregorianToHijri(y, mo, d);
    const mName = months[h.month - 1] || String(h.month);
    return `${this._toArabicDigits(h.day)} ${mName} ${this._toArabicDigits(h.year)}`;
  }

  /**
   * تحديد الفصل من الطابع الزمني الميلادي — مقارنة مباشرة بـ startGreg/endGreg
   */
  getSemesterFromTimestamp(timestamp) {
    const dateStr = this.getDateFromTimestamp(timestamp);
    if (!dateStr) return null;
    const m = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!m) return null;
    const d = parseInt(m[1]) * 10000 + parseInt(m[2]) * 100 + parseInt(m[3]);
    for (const sem of CONFIG.semesters) {
      const [sy, sm, sd] = sem.startGreg.split('/').map(Number);
      const [ey, em, ed] = sem.endGreg.split('/').map(Number);
      const start = sy * 10000 + sm * 100 + sd;
      const end   = ey * 10000 + em * 100 + ed;
      if (d >= start && d <= end) return sem.id;
    }
    return null;
  }

  /**
   * فلترة بيانات التنفيذ
   * filter = { semesters: string[], dateFrom: Date|null, dateTo: Date|null }
   */
  filterExecution({ stage, team, filter = {}, executedOnly = true } = {}) {
    const { semesters = [], dateFrom = null, dateTo = null } = filter;
    const col = CONFIG.executionColumns;
    return this.executionData.filter(row => {
      if (executedOnly && row[col.executed] !== 'نعم') return false;
      if (stage && row[col.stage] !== stage) return false;
      if (team && row[col.team] !== team) return false;
      if (semesters.length > 0) {
        const sem = this.getSemesterFromTimestamp(row[col.timestamp]);
        if (!semesters.includes(sem)) return false;
      }
      if (dateFrom || dateTo) {
        const dateStr = this.getDateFromTimestamp(row[col.timestamp]);
        if (!dateStr) return false;
        const [y, mo, d] = dateStr.split('/').map(Number);
        const rowDate = new Date(y, mo - 1, d);
        if (dateFrom && rowDate < dateFrom) return false;
        if (dateTo && rowDate > dateTo) return false;
      }
      return true;
    });
  }

  /**
   * إجمالي الإدخالات لفريق (نعم + لا)
   */
  getTotalSubmissions(teamName, filter = {}) {
    const { semesters = [], dateFrom = null, dateTo = null } = filter;
    const col = CONFIG.executionColumns;
    return this.executionData.filter(row => {
      if (teamName && row[col.team] !== teamName) return false;
      if (semesters.length > 0) {
        const sem = this.getSemesterFromTimestamp(row[col.timestamp]);
        if (!semesters.includes(sem)) return false;
      }
      if (dateFrom || dateTo) {
        const dateStr = this.getDateFromTimestamp(row[col.timestamp]);
        if (!dateStr) return false;
        const [y, mo, d] = dateStr.split('/').map(Number);
        const rowDate = new Date(y, mo - 1, d);
        if (dateFrom && rowDate < dateFrom) return false;
        if (dateTo && rowDate > dateTo) return false;
      }
      return true;
    }).length;
  }

  /**
   * فلترة بيانات الجودة
   * filter = { semesters: string[], dateFrom: Date|null, dateTo: Date|null }
   */
  filterQuality({ team, filter = {} } = {}) {
    const { semesters = [], dateFrom = null, dateTo = null } = filter;
    const col = CONFIG.qualityColumns;
    return this.qualityData.filter(row => {
      if (row[col.visitStatus] && row[col.visitStatus] !== 'نعم' && row[col.visitStatus] !== '') {
        if (!row[col.participantEngagement]) return false;
      }
      if (team && row[col.team] !== team) return false;
      if (semesters.length > 0) {
        const sem = this.getSemester(row[col.visitDate]);
        if (!semesters.includes(sem)) return false;
      }
      if ((dateFrom || dateTo) && row[col.visitDate]) {
        const rowDate = this.getGregorianDate(row[col.visitDate]);
        if (rowDate) {
          if (dateFrom && rowDate < dateFrom) return false;
          if (dateTo && rowDate > dateTo) return false;
        }
      }
      return row[col.participantEngagement];
    });
  }

  calcQualityAvg(rows) {
    if (!rows || !rows.length) return null;
    const col = CONFIG.qualityColumns;
    let total = 0, count = 0;
    rows.forEach(row => {
      const raw = [
        parseFloat(row[col.participantEngagement]),
        parseFloat(row[col.executorComprehension]),
        parseFloat(row[col.contentCompliance]),
        parseFloat(row[col.evalCompliance]),
      ];
      // استبعاد NaN فقط — القيم الصفرية مسموحة
      const scores = raw.filter(v => Number.isFinite(v));
      if (scores.length === 0) return; // تجاهل الصف إن لم تكن فيه درجة صالحة
      const rowAvg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (!Number.isFinite(rowAvg)) return;
      total += rowAvg;
      count++;
    });
    return count > 0 ? total / count : null;
  }

  calcQualityDetails(rows) {
    if (!rows.length) return null;
    const col = CONFIG.qualityColumns;
    const sums = { engagement: 0, comprehension: 0, content: 0, eval: 0 };
    let count = 0;
    rows.forEach(row => {
      sums.engagement    += parseFloat(row[col.participantEngagement]) || 0;
      sums.comprehension += parseFloat(row[col.executorComprehension]) || 0;
      sums.content       += parseFloat(row[col.contentCompliance]) || 0;
      sums.eval          += parseFloat(row[col.evalCompliance]) || 0;
      count++;
    });
    return {
      engagement:    sums.engagement / count,
      comprehension: sums.comprehension / count,
      content:       sums.content / count,
      eval:          sums.eval / count,
      overall: (sums.engagement + sums.comprehension + sums.content + sums.eval) / (count * 4),
      visitCount: count,
    };
  }

  getQualityLevel(score) {
    if (score === null || score === undefined)
      return { label: 'لا توجد بيانات', color: '#999', icon: '⚪' };
    if (score === 10) return CONFIG.qualityLevels[CONFIG.qualityLevels.length - 1];
    for (const level of CONFIG.qualityLevels) {
      if (score >= level.min && score < level.max) return level;
    }
    return CONFIG.qualityLevels[0];
  }

  getUniqueCards(rows) {
    const col = CONFIG.executionColumns;
    const cards = new Set();
    rows.forEach(row => { if (row[col.card]) cards.add(row[col.card]); });
    return cards;
  }

  /**
   * إحصائيات شاملة
   * filter = { semesters: string[], dateFrom: Date|null, dateTo: Date|null }
   */
  getOverallStats(filter = {}) {
    const { semesters = [] } = filter;
    const col = CONFIG.executionColumns;
    const qcol = CONFIG.qualityColumns;

    const execRows = this.filterExecution({ filter });
    const qualRows = this.filterQuality({ filter });

    const totalExecutions = execRows.length;
    const activeTeams = new Set(execRows.map(r => r[col.team]));
    let totalBeneficiaries = 0;
    execRows.forEach(r => { totalBeneficiaries += parseInt(r[col.beneficiaries]) || 0; });
    const qualityDetails = this.calcQualityDetails(qualRows);

    const stageStats = {};
    for (const stageName of Object.keys(CONFIG.stages)) {
      const stageExec = execRows.filter(r => r[col.stage] === stageName);
      const stageTeams = CONFIG.teams[stageName] || [];

      // حساب المستهدف بناءً على الفصول المختارة
      const targetMap = CONFIG.targets[stageName] || {};
      const target = semesters.length === 0
        ? Object.values(targetMap).reduce((s, v) => s + v, 0)
        : semesters.reduce((sum, semId) => sum + (targetMap[semId] || 0), 0);

      // اجمع أسماء الفرق من البيانات (نعم + لا) + config
      const teamsInData = new Set();
      this.filterExecution({ stage: stageName, filter, executedOnly: false })
        .forEach(r => { if (r[col.team]) teamsInData.add(r[col.team]); });
      const allTeamsForStage = [...new Set([...stageTeams, ...teamsInData])];

      const teamStats = [];
      for (const teamName of allTeamsForStage) {
        const teamRows = stageExec.filter(r => r[col.team] === teamName);
        const cardNamesSet = this.getUniqueCards(teamRows);
        const executedCount = teamRows.length;
        const teamQuality = this.filterQuality({ team: teamName, filter });
        const qualAvg = this.calcQualityAvg(teamQuality);
        const totalSubmissions = this.getTotalSubmissions(teamName, filter);
        teamStats.push({
          name:            teamName,
          inConfig:        stageTeams.includes(teamName),
          executions:      executedCount,
          totalSubmissions,
          uniqueCards:     executedCount,
          cardNames:       [...cardNamesSet],
          target,
          completionRate:  target > 0 ? Math.min((executedCount / target) * 100, 100) : 0,
          qualityAvg:      qualAvg,
          qualityLevel:    this.getQualityLevel(qualAvg),
          qualityVisits:   teamQuality.length,
          beneficiaries:   teamRows.reduce((s, r) => s + (parseInt(r[col.beneficiaries]) || 0), 0),
        });
      }

      const totalUniqueCardsStage = new Set(stageExec.map(r => r[col.card]).filter(Boolean));
      const stageQuality = qualRows.filter(r =>
        allTeamsForStage.some(t => r[qcol.team] && r[qcol.team].includes(t))
      );

      stageStats[stageName] = {
        totalExecutions: stageExec.length,
        uniqueCards:     totalUniqueCardsStage.size,
        target,
        teams:           teamStats,
        beneficiaries:   stageExec.reduce((s, r) => s + (parseInt(r[col.beneficiaries]) || 0), 0),
        qualityAvg:      this.calcQualityAvg(stageQuality),
      };
    }

    return {
      totalExecutions,
      activeTeams: activeTeams.size,
      totalBeneficiaries,
      qualityDetails,
      stageStats,
      qualityLevel: qualityDetails ? this.getQualityLevel(qualityDetails.overall) : null,
    };
  }

  /**
   * تفاصيل فريق محدد
   * filter = { semesters: string[], dateFrom: Date|null, dateTo: Date|null }
   */
  getTeamDetails(teamName, filter = {}) {
    const { semesters = [] } = filter;
    const col = CONFIG.executionColumns;
    const execRows = this.filterExecution({ team: teamName, filter });
    const qualRows = this.filterQuality({ team: teamName, filter });

    let stage = '';
    for (const [s, teams] of Object.entries(CONFIG.teams)) {
      if (teams.includes(teamName)) { stage = s; break; }
    }

    const targetMap = CONFIG.targets[stage] || {};
    const target = semesters.length === 0
      ? Object.values(targetMap).reduce((s, v) => s + v, 0)
      : semesters.reduce((sum, semId) => sum + (targetMap[semId] || 0), 0);

    const executedCount = execRows.length;
    const cardDetails = {};
    execRows.forEach(row => {
      const card = row[col.card];
      if (!card) return;
      if (!cardDetails[card]) {
        cardDetails[card] = {
          name: card, executions: 0,
          executors: new Set(), dates: [],
          methods: new Set(), beneficiaries: 0,
        };
      }
      const d = cardDetails[card];
      d.executions++;
      if (row[col.executor]) d.executors.add(row[col.executor]);
      // التاريخ الهجري دائماً:
      // - إن كان hijriDate هجرياً (السنة < 1500) → استخدمه مباشرة
      // - إن كان ميلادياً (السنة ≥ 1500) أو فارغاً → حوّله من timestamp
      let hDate = '';
      const rawDate = (row[col.hijriDate] || '').trim();
      if (rawDate) {
        const dm = rawDate.match(/^(\d{4})[\/\-]/);
        const yr = dm ? parseInt(dm[1]) : 0;
        hDate = yr >= 1500
          ? this.hijriDisplayFromGregorian(rawDate)
          : rawDate;
      } else {
        hDate = this.hijriDisplayFromGregorian(this.getDateFromTimestamp(row[col.timestamp]));
      }
      if (hDate && hDate !== '-') d.dates.push(hDate);
      if (row[col.method]) d.methods.add(row[col.method]);
      d.beneficiaries += parseInt(row[col.beneficiaries]) || 0;
    });
    Object.values(cardDetails).forEach(d => {
      d.executors = [...d.executors];
      d.methods   = [...d.methods];
    });

    const qualityDetails = this.calcQualityDetails(qualRows);
    return {
      team: teamName, stage, target,
      totalExecutions: executedCount,
      uniqueCards:     executedCount,
      completionRate:  target > 0 ? Math.min((executedCount / target) * 100, 100) : 0,
      beneficiaries:   execRows.reduce((s, r) => s + (parseInt(r[col.beneficiaries]) || 0), 0),
      qualityDetails,
      qualityLevel:    qualityDetails ? this.getQualityLevel(qualityDetails.overall) : null,
      cards:           cardDetails,
      qualityVisits:   qualRows,
    };
  }

  /**
   * الفرق التي أبلغت بعدم التنفيذ
   * filter = { semesters: string[], dateFrom: Date|null, dateTo: Date|null }
   */
  getNonExecutingTeams(filter = {}) {
    const col = CONFIG.executionColumns;
    const allRows = this.filterExecution({ filter, executedOnly: false });
    const nonExec = allRows.filter(r => r[col.executed] === 'لا');
    const result = {};
    nonExec.forEach(r => {
      const team = r[col.team];
      if (!result[team]) result[team] = 0;
      result[team]++;
    });
    return result;
  }

  /**
   * بيانات خريطة النشاط (آخر 12 أسبوع)
   */
  getActivityHeatmap(filter = {}) {
    const col = CONFIG.executionColumns;
    const execRows = this.filterExecution({ filter });
    const weeks = 12;
    const days = weeks * 7;
    const today = new Date();
    today.setHours(0,0,0,0);

    const counts = {};
    execRows.forEach(row => {
      const dateStr = this.getDateFromTimestamp(row[col.timestamp]);
      if (!dateStr) return;
      const [y, m, d] = dateStr.split('/').map(Number);
      const date = new Date(y, m - 1, d);
      const key = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    const cells = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const count = counts[key] || 0;
      let level = 0;
      if (count >= 8) level = 4;
      else if (count >= 5) level = 3;
      else if (count >= 2) level = 2;
      else if (count >= 1) level = 1;
      const hijriLabel = this.hijriDisplayFromGregorian(`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`);
      cells.push({ date: key, hijriDate: hijriLabel, count, level, dayOfWeek: d.getDay() });
    }
    return cells;
  }

  /**
   * النشاط الأسبوعي (آخر 8 أسابيع)
   */
  getWeeklyProgress(filter = {}) {
    const col = CONFIG.executionColumns;
    const execRows = this.filterExecution({ filter });
    const weeks = 8;
    const today = new Date();
    today.setHours(0,0,0,0);

    const weekData = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);

      let count = 0;
      execRows.forEach(row => {
        const dateStr = this.getDateFromTimestamp(row[col.timestamp]);
        if (!dateStr) return;
        const [y, m, d] = dateStr.split('/').map(Number);
        const date = new Date(y, m - 1, d);
        if (date >= weekStart && date <= weekEnd) count++;
      });

      const wh = this.gregorianToHijri(weekStart.getFullYear(), weekStart.getMonth()+1, weekStart.getDate());
      const label = `${wh.day}/${wh.month}`;
      weekData.push({ label, count, weekStart, weekEnd });
    }
    return weekData;
  }

  /**
   * توزيع وسائل التنفيذ
   */
  getMethodDistribution(filter = {}) {
    const col = CONFIG.executionColumns;
    const execRows = this.filterExecution({ filter });
    const methods = {};
    execRows.forEach(row => {
      const method = row[col.method] || 'غير محدد';
      methods[method] = (methods[method] || 0) + 1;
    });
    return Object.entries(methods)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * توقعات إكمال الفرق
   */
  getProjections(filter = {}) {
    const { semesters = [] } = filter;
    const col = CONFIG.executionColumns;
    const projections = [];

    for (const [stageName, stageTeams] of Object.entries(CONFIG.teams)) {
      const targetMap = CONFIG.targets[stageName] || {};
      const target = semesters.length === 0
        ? Object.values(targetMap).reduce((s, v) => s + v, 0)
        : semesters.reduce((sum, semId) => sum + (targetMap[semId] || 0), 0);

      for (const teamName of stageTeams) {
        const teamRows = this.filterExecution({ stage: stageName, team: teamName, filter });
        const executed = teamRows.length;

        if (executed >= target && target > 0) {
          projections.push({ team: teamName, stage: stageName, executed, target, status: 'completed', projectedDate: null, daysRemaining: 0 });
          continue;
        }

        if (executed === 0 || target === 0) {
          projections.push({ team: teamName, stage: stageName, executed, target, status: 'no-data', projectedDate: null, daysRemaining: null });
          continue;
        }

        // حساب معدل التنفيذ
        const dates = teamRows.map(r => {
          const ds = this.getDateFromTimestamp(r[col.timestamp]);
          if (!ds) return null;
          const [y, m, d] = ds.split('/').map(Number);
          return new Date(y, m - 1, d);
        }).filter(Boolean).sort((a, b) => a - b);

        if (dates.length < 2) {
          projections.push({ team: teamName, stage: stageName, executed, target, status: 'insufficient', projectedDate: null, daysRemaining: null });
          continue;
        }

        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];
        const daySpan = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
        const rate = executed / daySpan;
        const remaining = target - executed;
        const daysNeeded = Math.ceil(remaining / rate);

        const projectedDate = new Date();
        projectedDate.setDate(projectedDate.getDate() + daysNeeded);

        projections.push({
          team: teamName,
          stage: stageName,
          executed,
          target,
          status: daysNeeded > 180 ? 'behind' : 'on-track',
          projectedDate,
          daysRemaining: daysNeeded,
          rate: rate.toFixed(2),
        });
      }
    }
    return projections;
  }

  /**
   * تحليل أنماط الجودة
   */
  getQualityPatterns(filter = {}) {
    const qcol = CONFIG.qualityColumns;
    const qualRows = this.filterQuality({ filter });

    // تحليل حسب الفترة
    const byPeriod = {};
    qualRows.forEach(row => {
      const period = row[qcol.visitPeriod] || 'غير محدد';
      if (!byPeriod[period]) byPeriod[period] = { scores: [], count: 0 };
      const avg = [
        parseFloat(row[qcol.participantEngagement]) || 0,
        parseFloat(row[qcol.executorComprehension]) || 0,
        parseFloat(row[qcol.contentCompliance]) || 0,
        parseFloat(row[qcol.evalCompliance]) || 0,
      ].reduce((a, b) => a + b, 0) / 4;
      byPeriod[period].scores.push(avg);
      byPeriod[period].count++;
    });

    const periodAnalysis = Object.entries(byPeriod).map(([period, data]) => ({
      period,
      avg: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      count: data.count,
    }));

    // أسباب النقص الأكثر شيوعاً
    const deficiencies = {};
    qualRows.forEach(row => {
      const reason = row[qcol.deficiencyReasons];
      if (reason && reason.trim()) {
        deficiencies[reason.trim()] = (deficiencies[reason.trim()] || 0) + 1;
      }
    });

    const topDeficiencies = Object.entries(deficiencies)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { periodAnalysis, topDeficiencies };
  }

  /**
   * التنبيهات الذكية
   */
  getSmartAlerts(filter = {}) {
    const stats = this.getOverallStats(filter);
    const alerts = [];

    for (const [stageName, stageData] of Object.entries(stats.stageStats)) {
      const stageLabel = CONFIG.stages[stageName]?.label || stageName;

      for (const team of stageData.teams) {
        // تأخر عن الجدول
        if (team.target > 0 && team.completionRate < 30 && team.target > 0) {
          alerts.push({
            type: 'warning',
            icon: '⚠️',
            message: `فريق ${team.name} متأخر عن الجدول (${team.completionRate.toFixed(0)}%)`,
            detail: stageLabel,
            priority: 1,
          });
        }

        // لا يوجد نشاط
        if (team.executions === 0 && team.target > 0) {
          alerts.push({
            type: 'warning',
            icon: '🔴',
            message: `فريق ${team.name} لم يسجل أي تنفيذ`,
            detail: stageLabel,
            priority: 0,
          });
        }

        // جودة منخفضة
        if (team.qualityAvg !== null && team.qualityAvg < 6) {
          alerts.push({
            type: 'warning',
            icon: '📉',
            message: `جودة فريق ${team.name} منخفضة (${team.qualityAvg.toFixed(1)}/10)`,
            detail: stageLabel,
            priority: 2,
          });
        }

        // إنجاز 100%
        if (team.completionRate >= 100) {
          alerts.push({
            type: 'achievement',
            icon: '🏆',
            message: `فريق ${team.name} أكمل جميع البطاقات المستهدفة!`,
            detail: stageLabel,
            priority: 10,
          });
        }
        // إنجاز 75%
        else if (team.completionRate >= 75) {
          alerts.push({
            type: 'achievement',
            icon: '🎯',
            message: `فريق ${team.name} أنجز ${team.completionRate.toFixed(0)}% من المستهدف`,
            detail: stageLabel,
            priority: 8,
          });
        }
        // إنجاز 50%
        else if (team.completionRate >= 50) {
          alerts.push({
            type: 'info',
            icon: '📊',
            message: `فريق ${team.name} تجاوز نصف المستهدف (${team.completionRate.toFixed(0)}%)`,
            detail: stageLabel,
            priority: 5,
          });
        }

        // جودة ممتازة
        if (team.qualityAvg !== null && team.qualityAvg >= 9) {
          alerts.push({
            type: 'achievement',
            icon: '🌟',
            message: `فريق ${team.name} حقق جودة ممتازة (${team.qualityAvg.toFixed(1)}/10)`,
            detail: stageLabel,
            priority: 9,
          });
        }
      }
    }

    return alerts.sort((a, b) => a.priority - b.priority);
  }

  /**
   * مقارنة فصلين دراسيين
   */
  compareSemesters(semId1, semId2) {
    const filter1 = { semesters: [semId1] };
    const filter2 = { semesters: [semId2] };

    const stats1 = this.getOverallStats(filter1);
    const stats2 = this.getOverallStats(filter2);

    const sem1 = CONFIG.semesters.find(s => s.id === semId1);
    const sem2 = CONFIG.semesters.find(s => s.id === semId2);

    return {
      sem1: { id: semId1, label: sem1?.label || semId1, stats: stats1 },
      sem2: { id: semId2, label: sem2?.label || semId2, stats: stats2 },
    };
  }
}
