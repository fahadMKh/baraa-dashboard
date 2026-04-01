/**
 * محرك جلب البيانات من Google Sheets
 */

class DataEngine {
  constructor() {
    this.executionData = [];
    this.qualityData = [];
    this.lastFetch = null;
  }

  /**
   * بناء رابط CSV من Google Sheets
   */
  buildCSVUrl(sheetId, gid) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }

  /**
   * تحليل CSV إلى مصفوفة
   */
  parseCSV(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    let row = [];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          row.push(current.trim());
          current = '';
        } else if (char === '\n' || (char === '\r' && next === '\n')) {
          row.push(current.trim());
          if (row.some(c => c !== '')) rows.push(row);
          row = [];
          current = '';
          if (char === '\r') i++;
        } else {
          current += char;
        }
      }
    }
    if (current || row.length > 0) {
      row.push(current.trim());
      if (row.some(c => c !== '')) rows.push(row);
    }
    return rows;
  }

  /**
   * جلب البيانات من ورقة واحدة
   */
  async fetchSheet(sheetId, gid) {
    const url = this.buildCSVUrl(sheetId, gid);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const rows = this.parseCSV(text);
      return rows.length > 1 ? rows.slice(1) : []; // skip header
    } catch (error) {
      console.error('خطأ في جلب البيانات:', error);
      throw error;
    }
  }

  /**
   * جلب جميع البيانات
   */
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
   * تحويل تاريخ ميلادي إلى هجري
   * الخوارزمية مستندة إلى Jean Meeus "Astronomical Algorithms"
   */
  gregorianToHijri(gYear, gMonth, gDay) {
    // Julian Day Number من التاريخ الميلادي
    const a = Math.floor((14 - gMonth) / 12);
    const y = gYear + 4800 - a;
    const m = gMonth + 12 * a - 3;
    const jdn = gDay
      + Math.floor((153 * m + 2) / 5)
      + 365 * y
      + Math.floor(y / 4)
      - Math.floor(y / 100)
      + Math.floor(y / 400)
      - 32045;

    // Julian Day Number إلى هجري
    // تصحيح +1 للتوافق مع تقويم أم القرى السعودي (يختلف عن جان ميوس يوماً عند بداية الأشهر)
    const l  = (jdn + 1) - 1948440 + 10632;
    const n  = Math.floor((l - 1) / 10631);
    const l2 = l - 10631 * n + 354;
    const j  =
      Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
      Math.floor(l2 / 5670)            * Math.floor((43 * l2) / 15238);
    const l3 =
      l2 -
      Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
      Math.floor(j / 16)         * Math.floor((15238 * j) / 43) +
      29;
    const hMonth = Math.floor((24 * l3) / 709);
    const hDay   = l3 - Math.floor((709 * hMonth) / 24);
    const hYear  = 30 * n + j - 30;
    return { year: hYear, month: hMonth, day: hDay };
  }

  /**
   * تحليل التاريخ من نص — يكتشف تلقائياً هجري أم ميلادي ويُعيد هجري دائماً
   * الهجري: السنة < 1500 | الميلادي: السنة >= 1500
   */
  parseHijriDate(text) {
    if (!text) return null;
    const match = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!match) return null;
    const y = parseInt(match[1]);
    const mo = parseInt(match[2]);
    const d = parseInt(match[3]);
    if (y >= 1500) {
      // تاريخ ميلادي → حوّله إلى هجري
      return this.gregorianToHijri(y, mo, d);
    }
    return { year: y, month: mo, day: d };
  }

  /**
   * تحديد الفصل من تاريخ هجري {year, month, day}
   * يقارن مقابل نطاقات startHijri/endHijri في CONFIG.semesters
   */
  getSemester(dateStr) {
    const date = this.parseHijriDate(dateStr);
    if (!date) return null;
    const d = date.year * 10000 + date.month * 100 + date.day;
    for (const sem of CONFIG.semesters) {
      const s = sem.startHijri;
      const e = sem.endHijri;
      const start = s.year * 10000 + s.month * 100 + s.day;
      const end   = e.year * 10000 + e.month * 100 + e.day;
      if (d >= start && d <= end) return sem.id;
    }
    return null;
  }

  /**
   * استخراج التاريخ من الطابع الزمني (timestamp)
   * مثال: "1:40:27 م 2024/11/23" → "2024/11/23"
   */
  getDateFromTimestamp(timestamp) {
    if (!timestamp) return null;
    const match = timestamp.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (!match) return null;
    return `${match[1]}/${match[2].padStart(2,'0')}/${match[3].padStart(2,'0')}`;
  }

  /**
   * تحديد الفصل من الطابع الزمني الميلادي — مقارنة مباشرة بـ startGreg/endGreg
   * دقيق 100% لأن الطوابع الزمنية ميلادية والحدود مأخوذة من وزارة التعليم مباشرة
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
   * يستخدم الطابع الزمني للتصنيف (لا hijriDate) لأن المدخلين قد يخطئون في hijriDate
   * "البطاقة المنفذة" = executed === 'نعم'
   * "كل الإدخالات" = جميع السجلات بما فيها لا
   */
  filterExecution({ stage, team, semester, executedOnly = true } = {}) {
    const col = CONFIG.executionColumns;
    return this.executionData.filter(row => {
      if (executedOnly && row[col.executed] !== 'نعم') return false;
      if (stage && row[col.stage] !== stage) return false;
      if (team && row[col.team] !== team) return false;
      if (semester) {
        // استخدم الطابع الزمني للتصنيف الفصلي
        const sem = this.getSemesterFromTimestamp(row[col.timestamp]);
        if (sem !== semester) return false;
      }
      return true;
    });
  }

  /**
   * إجمالي الإدخالات لفريق في فصل معين (نعم + لا) لعرض "كل الإدخالات"
   */
  getTotalSubmissions(teamName, semester) {
    const col = CONFIG.executionColumns;
    return this.executionData.filter(row => {
      if (teamName && row[col.team] !== teamName) return false;
      if (semester) {
        const sem = this.getSemesterFromTimestamp(row[col.timestamp]);
        if (sem !== semester) return false;
      }
      return true;
    }).length;
  }

  /**
   * فلترة بيانات الجودة
   */
  filterQuality({ team, semester } = {}) {
    const col = CONFIG.qualityColumns;
    return this.qualityData.filter(row => {
      if (row[col.visitStatus] && row[col.visitStatus] !== 'نعم' && row[col.visitStatus] !== '') {
        // فقط الزيارات التي تمت فعلاً أو التي لها بيانات
        if (!row[col.participantEngagement]) return false;
      }
      if (team && row[col.team] !== team) return false;
      if (semester) {
        const sem = this.getSemester(row[col.visitDate]);
        if (sem !== semester) return false;
      }
      return row[col.participantEngagement]; // لها بيانات تقييم
    });
  }

  /**
   * حساب متوسط الجودة لمجموعة من الصفوف
   */
  calcQualityAvg(rows) {
    if (!rows.length) return null;
    const col = CONFIG.qualityColumns;
    let total = 0, count = 0;

    rows.forEach(row => {
      const scores = [
        parseFloat(row[col.participantEngagement]) || 0,
        parseFloat(row[col.executorComprehension]) || 0,
        parseFloat(row[col.contentCompliance]) || 0,
        parseFloat(row[col.evalCompliance]) || 0,
      ];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      total += avg;
      count++;
    });

    return count > 0 ? total / count : null;
  }

  /**
   * حساب تفاصيل الجودة
   */
  calcQualityDetails(rows) {
    if (!rows.length) return null;
    const col = CONFIG.qualityColumns;
    const sums = { engagement: 0, comprehension: 0, content: 0, eval: 0 };
    let count = 0;

    rows.forEach(row => {
      sums.engagement += parseFloat(row[col.participantEngagement]) || 0;
      sums.comprehension += parseFloat(row[col.executorComprehension]) || 0;
      sums.content += parseFloat(row[col.contentCompliance]) || 0;
      sums.eval += parseFloat(row[col.evalCompliance]) || 0;
      count++;
    });

    return {
      engagement: sums.engagement / count,
      comprehension: sums.comprehension / count,
      content: sums.content / count,
      eval: sums.eval / count,
      overall: (sums.engagement + sums.comprehension + sums.content + sums.eval) / (count * 4),
      visitCount: count,
    };
  }

  /**
   * تحديد مستوى الجودة
   */
  getQualityLevel(score) {
    if (score === null || score === undefined) return { label: 'لا توجد بيانات', color: '#999', icon: '⚪' };
    if (score === 10) return CONFIG.qualityLevels[CONFIG.qualityLevels.length - 1];
    for (const level of CONFIG.qualityLevels) {
      if (score >= level.min && score < level.max) return level;
    }
    return CONFIG.qualityLevels[0];
  }

  /**
   * حساب عدد البطاقات المنفذة (الفريدة) لفريق في فصل معين
   */
  getUniqueCards(rows) {
    const col = CONFIG.executionColumns;
    const cards = new Set();
    rows.forEach(row => {
      if (row[col.card]) cards.add(row[col.card]);
    });
    return cards;
  }

  /**
   * إحصائيات شاملة
   */
  getOverallStats(semester) {
    const col = CONFIG.executionColumns;
    const qcol = CONFIG.qualityColumns;

    const execRows = this.filterExecution({ semester });
    const qualRows = this.filterQuality({ semester });

    // إجمالي عمليات التنفيذ
    const totalExecutions = execRows.length;

    // عدد الفرق النشطة
    const activeTeams = new Set(execRows.map(r => r[col.team]));

    // عدد المستفيدين
    let totalBeneficiaries = 0;
    execRows.forEach(r => {
      totalBeneficiaries += parseInt(r[col.beneficiaries]) || 0;
    });

    // متوسط الجودة
    const qualityDetails = this.calcQualityDetails(qualRows);

    // إحصائيات لكل مرحلة
    const stageStats = {};
    for (const stageName of Object.keys(CONFIG.stages)) {
      const stageExec = execRows.filter(r => r[col.stage] === stageName);
      const stageTeams = CONFIG.teams[stageName] || [];
      let target = 0;
      if (semester && CONFIG.targets[stageName]) {
        target = CONFIG.targets[stageName][semester] || 0;
      } else if (!semester && CONFIG.targets[stageName]) {
        // عند عرض جميع الفصول: المستهدف = مجموع مستهدفات كل الفصول
        target = Object.values(CONFIG.targets[stageName]).reduce((s, v) => s + v, 0);
      }

      // البطاقات المنجزة لكل فريق
      // نضيف الفرق من config + أي فريق يظهر في البيانات لكن ليس في config
      const teamsInData = new Set(stageExec.map(r => r[col.team]).filter(Boolean));
      const allSubmissions = semester
        ? this.executionData.filter(r => r[col.stage] === stageName && this.getSemesterFromTimestamp(r[col.timestamp]) === semester)
        : this.executionData.filter(r => r[col.stage] === stageName);
      allSubmissions.forEach(r => { if (r[col.team]) teamsInData.add(r[col.team]); });

      const allTeamsForStage = [...new Set([...stageTeams, ...teamsInData])];

      let teamStats = [];
      for (const teamName of allTeamsForStage) {
        const teamRows = stageExec.filter(r => r[col.team] === teamName);
        const cardNamesSet = this.getUniqueCards(teamRows);
        // كل نعم = بطاقة منفذة (بما فيها التكرار)
        const executedCount = teamRows.length;
        // جودة الفريق
        const teamQuality = this.filterQuality({ team: teamName, semester });
        const qualAvg = this.calcQualityAvg(teamQuality);

        const totalSubmissions = this.getTotalSubmissions(teamName, semester);
        teamStats.push({
          name: teamName,
          inConfig: stageTeams.includes(teamName), // هل الفريق في القائمة المحددة؟
          executions: executedCount,
          totalSubmissions,
          uniqueCards: executedCount,
          cardNames: [...cardNamesSet],
          target,
          completionRate: target > 0 ? Math.min((executedCount / target) * 100, 100) : 0,
          qualityAvg: qualAvg,
          qualityLevel: this.getQualityLevel(qualAvg),
          qualityVisits: teamQuality.length,
          beneficiaries: teamRows.reduce((s, r) => s + (parseInt(r[col.beneficiaries]) || 0), 0),
        });
      }

      const totalUniqueCardsStage = new Set(stageExec.map(r => r[col.card]).filter(Boolean));
      const stageQuality = qualRows.filter(r => {
        return allTeamsForStage.some(t => r[qcol.team] && r[qcol.team].includes(t));
      });

      stageStats[stageName] = {
        totalExecutions: stageExec.length,
        uniqueCards: totalUniqueCardsStage.size,
        target,
        teams: teamStats,
        beneficiaries: stageExec.reduce((s, r) => s + (parseInt(r[col.beneficiaries]) || 0), 0),
        qualityAvg: this.calcQualityAvg(stageQuality),
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
   */
  getTeamDetails(teamName, semester) {
    const col = CONFIG.executionColumns;
    const execRows = this.filterExecution({ team: teamName, semester });
    const qualRows = this.filterQuality({ team: teamName, semester });

    // تحديد المرحلة
    let stage = '';
    for (const [s, teams] of Object.entries(CONFIG.teams)) {
      if (teams.includes(teamName)) { stage = s; break; }
    }

    let target = 0;
    if (semester && CONFIG.targets[stage]) {
      target = CONFIG.targets[stage][semester] || 0;
    } else if (!semester && CONFIG.targets[stage]) {
      target = Object.values(CONFIG.targets[stage]).reduce((s, v) => s + v, 0);
    }
    const cardNamesSet = this.getUniqueCards(execRows);
    // كل نعم = بطاقة منفذة
    const executedCount = execRows.length;

    // تفاصيل كل بطاقة
    const cardDetails = {};
    execRows.forEach(row => {
      const card = row[col.card];
      if (!card) return;
      if (!cardDetails[card]) {
        cardDetails[card] = {
          name: card,
          executions: 0,
          executors: new Set(),
          dates: [],
          methods: new Set(),
          beneficiaries: 0,
          ratings: { executor: [], content: [], interaction: [] },
        };
      }
      const d = cardDetails[card];
      d.executions++;
      if (row[col.executor]) d.executors.add(row[col.executor]);
      if (row[col.hijriDate]) d.dates.push(row[col.hijriDate]);
      if (row[col.method]) d.methods.add(row[col.method]);
      d.beneficiaries += parseInt(row[col.beneficiaries]) || 0;
      if (row[col.executorRating]) d.ratings.executor.push(parseFloat(row[col.executorRating]));
      if (row[col.contentRating]) d.ratings.content.push(parseFloat(row[col.contentRating]));
      if (row[col.interactionRating]) d.ratings.interaction.push(parseFloat(row[col.interactionRating]));
    });

    // تحويل Sets إلى arrays
    Object.values(cardDetails).forEach(d => {
      d.executors = [...d.executors];
      d.methods = [...d.methods];
    });

    const qualityDetails = this.calcQualityDetails(qualRows);

    return {
      team: teamName,
      stage,
      target,
      totalExecutions: executedCount,
      uniqueCards: executedCount,
      completionRate: target > 0 ? Math.min((executedCount / target) * 100, 100) : 0,
      beneficiaries: execRows.reduce((s, r) => s + (parseInt(r[col.beneficiaries]) || 0), 0),
      qualityDetails,
      qualityLevel: qualityDetails ? this.getQualityLevel(qualityDetails.overall) : null,
      cards: cardDetails,
      qualityVisits: qualRows,
    };
  }

  /**
   * بيانات التقارير الأسبوعية (الفرق التي لم تنفذ)
   */
  getNonExecutingTeams(semester) {
    const col = CONFIG.executionColumns;
    const allRows = this.executionData.filter(row => {
      if (semester) {
        const sem = this.getSemesterFromTimestamp(row[col.timestamp]);
        if (sem !== semester) return false;
      }
      return true;
    });

    // الفرق التي أبلغت بـ "لا"
    const nonExec = allRows.filter(r => r[col.executed] === 'لا');
    const result = {};
    nonExec.forEach(r => {
      const team = r[col.team];
      if (!result[team]) result[team] = 0;
      result[team]++;
    });
    return result;
  }
}
