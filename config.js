/**
 * ملف الإعدادات الرئيسي - منصة متابعة الشخصية المتكاملة
 * ===================================================
 * يمكن تعديل جميع الإعدادات من هنا دون الحاجة لتعديل الكود
 */

const CONFIG = {
  // ==================== إعدادات عامة ====================
  projectName: 'مشروع بارع بجمعية الراحين',
  projectSubtitle: 'منصة متابعة إنجاز البطاقات وجودة التنفيذ',

  // ==================== روابط Google Sheets ====================
  sheets: {
    execution: {
      id: '1vf5G2SaIHKGA4sAaGivYtgwDCWTm98fGHpyYslG-C08',
      gid: '1099506066',
      name: 'بيانات التنفيذ',
    },
    quality: {
      id: '16VCRbUsKv9NXwH4rDYPEmTnV3Dt9p25j-oT1Ne4EYo4',
      gid: '790680076',
      name: 'بيانات الجودة',
    },
    // ==================== جدول المستخدمين الموحّد ====================
    // أنشئ تبويباً (Sheet) جديداً في جدول التنفيذ أو أي جدول Google Sheets
    // الأعمدة المطلوبة: username | name | password | role | team
    // password = كلمة المرور بصيغة Base64 (btoa في JS أو base64 encode)
    // role = admin / leader / executor
    // team = اسم الفريق (فارغ للمشرف)
    users: {
      id: '1vf5G2SaIHKGA4sAaGivYtgwDCWTm98fGHpyYslG-C08',
      gid: '184007558',
      name: 'المستخدمون',
      // رابط Apps Script لإضافة/حذف المستخدمين في الشيت
      scriptURL: 'https://script.google.com/macros/s/AKfycbzsAG4MjL8GNpqWxQD4LHt6NRciMFVrnQ0TWq2Gvl-0u_t6_KBSlzo5FgkPJ5tUvTROfg/exec',
    },
  },

  // فترة تحديث البيانات التلقائي (بالدقائق) - 0 لإيقاف التحديث التلقائي
  autoRefreshMinutes: 30,

  // ==================== أعمدة جدول المستخدمين ====================
  usersColumns: {
    username: 0,
    name: 1,
    password: 2,   // Base64
    role: 3,       // admin / leader / executor
    team: 4,       // اسم الفريق (فارغ للمشرف)
  },

  // ==================== أعمدة جدول التنفيذ ====================
  executionColumns: {
    timestamp: 0,
    executed: 1,        // هل تمت خدمة البطاقة (نعم/لا)
    stage: 2,           // المرحلة
    team: 3,            // اسم الفريق
    card: 4,            // اسم البطاقة
    method: 5,          // وسيلة التنفيذ
    executor: 6,        // اسم المنفذ
    duration: 7,        // مدة التنفيذ
    hijriDate: 8,       // التاريخ الهجري
    region: 9,          // المنطقة
    placeType: 10,      // طبيعة المكان
    beneficiaries: 11,  // عدد المستفيدين
    executorRating: 12, // تقييم المنفذ
    contentRating: 13,  // تقييم المحتوى
    interactionRating: 14, // مدى تفاعل الطلاب
    notes: 15,          // ملاحظات
    evalMethod: 16,     // آلية التقييم البعدي
  },

  // ==================== أعمدة جدول الجودة ====================
  qualityColumns: {
    timestamp: 0,
    evaluator: 1,         // اسم المقيّم
    visitDate: 2,         // تاريخ الزيارة
    team: 3,              // الفريق
    teamLeader: 4,        // قائد الفريق
    activityName: 5,      // اسم النشاط
    duration: 6,          // مدة النشاط
    participantEngagement: 7,  // نسبة تفاعل المشاركين (من 10)
    executorComprehension: 8,  // مدى استيعاب المنفذين (من 10)
    contentCompliance: 9,      // مطابقة التنفيذ - أدوات (من 10)
    evalCompliance: 10,        // مطابقة التنفيذ - تقويم (من 10)
    deficiencyReasons: 11,     // أسباب النقص
    generalNotes: 12,          // ملاحظات عامة
    cardExecutor: 13,          // اسم منفذ البطاقة
    visitPeriod: 14,           // فترة الزيارة
    visitStatus: 15,           // هل أقيمت الزيارة
  },

  // ==================== المراحل ====================
  stages: {
    'المتوسطة': {
      label: 'المرحلة المتوسطة',
      shortLabel: 'متوسطة',
      color: '#2196F3',
      icon: '🏫',
    },
    'الثانوية': {
      label: 'المرحلة الثانوية',
      shortLabel: 'ثانوية',
      color: '#4CAF50',
      icon: '🎓',
    },
  },

  // ==================== الفرق ====================
  // يمكن تحديث هذه القائمة عند إضافة فرق جديدة أو تغيير الأسماء
  // إذا كانت القائمة فارغة ([] أو غير موجودة) سيتم اشتقاق الفرق تلقائياً من البيانات
  teams: {
    'المتوسطة': ['أثر', 'نماء', 'نهج', 'وتد', 'وهج', 'مجد'],
    'الثانوية': ['سمو', 'عزم', 'عطاء', 'غيث', 'فنار', 'نمير'],
  },

  // ==================== الفصول الدراسية ====================
  // المصدر: وزارة التعليم السعودية - التقويم الدراسي الرسمي
  // https://moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx
  //
  // 1443-1446: ثلاثة فصول دراسية
  // 1447 فصاعداً: فصلان دراسيان
  //
  // كل فصل يُعرَّف بتاريخ بداية ونهاية ميلادي (startGreg/endGreg) لتصنيف
  // الطوابع الزمنية للتنفيذ (ميلادية دائماً)، وتاريخ هجري (startHijri/endHijri)
  // لتصنيف تواريخ زيارات الجودة (مدخلة بالهجري).
  semesters: [
    // ===== عام 1446هـ - ثلاثة فصول =====
    {
      id: '1446-1', year: 1446, semester: 1, label: 'الفصل الأول 1446',
      startGreg: '2024/08/18', endGreg: '2024/11/16',
      startHijri: { year: 1446, month: 2, day: 14 }, endHijri: { year: 1446, month: 5, day: 15 },
    },
    {
      id: '1446-2', year: 1446, semester: 2, label: 'الفصل الثاني 1446',
      startGreg: '2024/11/17', endGreg: '2025/03/01',
      startHijri: { year: 1446, month: 5, day: 16 }, endHijri: { year: 1446, month: 9, day: 2 },
    },
    {
      id: '1446-3', year: 1446, semester: 3, label: 'الفصل الثالث 1446',
      startGreg: '2025/03/02', endGreg: '2025/06/26',
      startHijri: { year: 1446, month: 9, day: 3 }, endHijri: { year: 1447, month: 1, day: 1 },
    },
    // ===== عام 1447هـ - فصلان =====
    {
      id: '1447-1', year: 1447, semester: 1, label: 'الفصل الأول 1447',
      startGreg: '2025/07/26', endGreg: '2026/01/18',
      startHijri: { year: 1447, month: 2, day: 1 }, endHijri: { year: 1447, month: 7, day: 29 },
    },
    {
      id: '1447-2', year: 1447, semester: 2, label: 'الفصل الثاني 1447',
      startGreg: '2026/01/19', endGreg: '2026/06/30',
      startHijri: { year: 1447, month: 8, day: 1 }, endHijri: { year: 1447, month: 12, day: 29 },
    },
  ],

  // ==================== المستهدفات ====================
  // عدد البطاقات المستهدف لكل مرحلة في كل فصل
  targets: {
    'المتوسطة': {
      '1446-1': 11,
      '1446-2': 10,
      '1446-3': 10,
      '1447-1': 11,
      '1447-2': 10,
    },
    'الثانوية': {
      '1446-1': 16,
      '1446-2': 15,
      '1446-3': 15,
      '1447-1': 16,
      '1447-2': 15,
    },
  },

  // ==================== معايير الجودة ====================
  qualityCriteria: {
    participantEngagement: { label: 'تفاعل المشاركين', max: 10, weight: 1 },
    executorComprehension: { label: 'استيعاب المنفذين', max: 10, weight: 1 },
    contentCompliance: { label: 'مطابقة المحتوى (أدوات)', max: 10, weight: 1 },
    evalCompliance: { label: 'مطابقة التقويم', max: 10, weight: 1 },
  },

  // مستويات الجودة
  qualityLevels: [
    { min: 0, max: 5, label: 'ضعيف', color: '#f44336', icon: '🔴' },
    { min: 5, max: 7, label: 'مقبول', color: '#FF9800', icon: '🟠' },
    { min: 7, max: 8.5, label: 'جيد', color: '#2196F3', icon: '🔵' },
    { min: 8.5, max: 9.5, label: 'جيد جداً', color: '#8BC34A', icon: '🟢' },
    { min: 9.5, max: 10, label: 'ممتاز', color: '#4CAF50', icon: '🌟' },
  ],

  // ==================== إعدادات العرض ====================
  display: {
    cardsPerRow: 3,
    chartColors: ['#4A7EA5', '#6FA96C', '#5E9B8A', '#3D7A62', '#7AAFCF', '#8FCA8C', '#A5C8BD', '#2E6080', '#E8A838', '#D95F5F', '#6A9EC0', '#3A7860'],
    animationDuration: 300,
  },
};
