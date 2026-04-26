# مشروع بارع — ملاحظات للعمل

## بنية المشروع
- **منصة الويب** (في الجذر): `app.js`, `data.js`, `config.js`, `index.html`, `styles.css`, `logo.svg`
- **تطبيق iOS** (في `BaraaApp/`): SwiftUI + Swift، يشارك نفس مصدر البيانات
- **Apps Script** (`apps-script.js`): نسخة محلية من سكربت Google Apps Script — لا يُنشَر مع الريبو، يُنسَخ يدوياً إلى محرر Apps Script
- **مصدر البيانات الموحَّد**: Google Sheets + تبويب `config` يُكتَب/يُقرَأ عبر Apps Script

## قاعدة النشر (افتراضية)
عند طلب "نشر" أو "ارفع" أو ما شابه:
- **انشر فقط ملفات الويب**: `app.js`, `data.js`, `config.js`, `index.html`, `styles.css`, `logo.svg`
- **لا تنشر** أي شيء داخل `BaraaApp/` (التطبيق يُوزَّع عبر Xcode/TestFlight، ليس عبر Git)
- **لا تنشر** `apps-script.js` (نسخة مرجعية فقط)
- استخدم `git add <ملفات الويب>` بأسماء صريحة (لا تستخدم `git add .`)
- الفرع: `main` على `origin` (`fahadMKh/baraa-dashboard`)
- رسائل الالتزام بالعربية وتصف **السبب** لا فقط ما تغيّر

## قواعد عامة
- المستهدفات/الفرق/الفصول تُحفَظ في تبويب `config` بالشيت عبر `?action=saveConfig` ويقرأها كل من الويب و iOS عبر `?action=getConfig`
- أي تعديل على الإعدادات يجب أن ينعكس على التطبيق عند أول تحديث (التطبيق يستدعي `fetchConfig()` داخل `performLoad()`)
- `_callScript` في `app.js` يستخدم `fetch()` حقيقي (ليس `<img src>`) للتحقق من نجاح الحفظ
