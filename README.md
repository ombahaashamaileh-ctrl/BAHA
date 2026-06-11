# 🛍️ مساعد أسعار المنتجات
## دليل الإعداد الكامل

---

## 📁 ملفات المشروع

```
product-price-assistant/
├── index.html   ← الصفحة الرئيسية
├── style.css    ← التصميم
├── app.js       ← منطق التطبيق
└── README.md    ← هذا الملف
```

---

## 🔧 الخطوة الأولى — إنشاء Google Cloud Project

### 1. افتح Google Cloud Console
اذهب إلى: **https://console.cloud.google.com/**

### 2. إنشاء مشروع جديد
- اضغط على **"Select a project"** في الشريط العلوي
- اضغط **"New Project"**
- اسم المشروع: `ProductPriceAssistant` (أو أي اسم تريده)
- اضغط **"Create"**

---

## ⚙️ الخطوة الثانية — تفعيل Google Drive API

### 1. اذهب إلى المكتبة
في القائمة الجانبية: **APIs & Services → Library**

### 2. ابحث وفعّل
- ابحث عن: `Google Drive API`
- اضغط عليها
- اضغط **"Enable"**

---

## 🔑 الخطوة الثالثة — إنشاء OAuth Client ID

### 1. إعداد شاشة الموافقة (OAuth Consent Screen)
في القائمة: **APIs & Services → OAuth Consent Screen**
- اختر **"External"**
- اضغط **"Create"**
- أدخل:
  - **App Name**: مساعد أسعار المنتجات
  - **User Support Email**: بريدك الإلكتروني
  - **Developer Contact**: بريدك الإلكتروني
- اضغط **"Save and Continue"**

### 2. إضافة النطاقات (Scopes)
- اضغط **"Add or Remove Scopes"**
- ابحث عن: `https://www.googleapis.com/auth/drive.file`
- ضع علامة بجانبه
- اضغط **"Update"** ثم **"Save and Continue"**

### 3. إضافة مستخدمي الاختبار
- اضغط **"Add Users"**
- أدخل بريدك الإلكتروني
- اضغط **"Save and Continue"**

### 4. إنشاء بيانات اعتماد OAuth
في القائمة: **APIs & Services → Credentials**
- اضغط **"Create Credentials"**
- اختر **"OAuth Client ID"**
- نوع التطبيق: **"Web Application"**
- الاسم: `ProductPriceAssistant Web`

### 5. إضافة Authorized JavaScript origins
اضغط **"Add URI"** في قسم **Authorized JavaScript origins** وأضف:

إذا تشغّل محلياً:
```
http://localhost
http://localhost:3000
http://127.0.0.1
http://127.0.0.1:3000
```

إذا رفعته على استضافة:
```
https://your-domain.com
```

### 6. احفظ وانسخ Client ID
- اضغط **"Create"**
- ستظهر نافذة بـ **Client ID** — انسخه

---

## 📝 الخطوة الرابعة — وضع Client ID في المشروع

افتح ملف `app.js` وابحث عن هذا السطر في أعلى الملف:

```javascript
const CONFIG = {
  CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE',   // 🔴 ضع Client ID هنا
```

استبدل `YOUR_GOOGLE_CLIENT_ID_HERE` بـ Client ID الذي نسخته:

```javascript
const CONFIG = {
  CLIENT_ID: '123456789-abcdefghijklmn.apps.googleusercontent.com',
```

---

## 🚀 الخطوة الخامسة — تشغيل الموقع محلياً

### الطريقة الأولى — Python (الأسهل)

إذا كان Python مثبتاً، افتح Terminal/Command Prompt داخل مجلد المشروع:

**Python 3:**
```bash
python -m http.server 3000
```

**Python 2:**
```bash
python -m SimpleHTTPServer 3000
```

ثم افتح المتصفح على: **http://localhost:3000**

### الطريقة الثانية — Node.js

```bash
npx serve .
```

ثم افتح الرابط الذي يظهر في Terminal

### الطريقة الثالثة — VS Code Live Server
- ثبّت امتداد **Live Server**
- اضغط بزر الماوس الأيمن على `index.html`
- اختر **"Open with Live Server"**

---

## ✅ كيف يعمل التطبيق

1. **تسجيل الدخول**: اضغط "تسجيل الدخول بـ Google" ← سيطلب إذن الوصول إلى Drive
2. **الإعداد التلقائي**: سينشئ التطبيق مجلد `ProductPriceAssistant` في Drive الخاص بك
3. **إضافة منتج**: ارفع صورة + اكتب الاسم والسعر ← تُحفظ في Drive
4. **البحث بالصورة**: التقط صورة أو ارفعها ← سيقارنها مع الصور المحفوظة
5. **الإدارة**: عدّل أو احذف أي منتج من صفحة الإدارة
6. **النسخ الاحتياطي**: صدّر/استورد بيانات بصيغة JSON

---

## ⚠️ ملاحظات مهمة

- **البحث بالصورة**: يعتمد على مقارنة الألوان والأنماط البصرية. كلما كانت الصور واضحة كانت النتائج أدق.
- **الصلاحيات**: التطبيق يطلب `drive.file` فقط — يعني لا يرى إلا الملفات التي أنشأها هو.
- **التخزين**: كل صورة وبيانات تُحفظ في Google Drive الخاص بك، لا يُرسل أي شيء لخوادم خارجية.
- **الوضع التجريبي**: إذا ظهر تحذير "This app is unverified"، اضغط **Advanced → Go to app** — هذا طبيعي للتطبيقات غير المنشورة.

---

## 🌐 نشر الموقع

لنشر الموقع على الإنترنت، يمكنك استخدام:

- **GitHub Pages** (مجاني): https://pages.github.com
- **Netlify** (مجاني): https://netlify.com
- **Vercel** (مجاني): https://vercel.com

بعد النشر، أضف رابط موقعك في **Authorized JavaScript origins** في Google Cloud Console.

---

## 🆘 حل المشكلات الشائعة

| المشكلة | الحل |
|---------|------|
| `redirect_uri_mismatch` | أضف `http://localhost:PORT` في Authorized JavaScript origins |
| `The OAuth client was not found` | تحقق أن CLIENT_ID صحيح في app.js |
| الصور لا تظهر | Google Drive يحتاج وقتاً للمعالجة، انتظر لحظة |
| `Access blocked` | أضف بريدك في Test Users بـ OAuth Consent Screen |
