# راهنمای پیاده‌سازی دکمه‌های دیالوگ در فرانت‌اند

## تغییرات Backend ✅

قابلیت دکمه‌ها به سیستم دیالوگ اضافه شد. حالا می‌تونی برای هر دیالوگ چندین دکمه با اکشن‌های مختلف تعریف کنی.

---

## ساختار دیالوگ با دکمه‌ها

### نمونه JSON دیالوگ کامل:
\`\`\`json
{
  "type": "in-app",
  "target": "all",
  "title": "نسخه جدید منتشر شد!",
  "message": "نسخه 2.0 اپلیکیشن FlyVPN با امکانات جدید آماده است",
  "imageUrl": "https://example.com/update-banner.png",
  "buttons": [
    {
      "label": "دانلود",
      "actionUrl": "https://example.com/download",
      "style": "primary"
    },
    {
      "label": "اطلاعات بیشتر",
      "actionUrl": "https://example.com/changelog",
      "style": "secondary"
    },
    {
      "label": "بعداً",
      "action": "dismiss",
      "style": "secondary"
    }
  ],
  "scheduleTime": "2025-12-10T10:00:00Z"
}
\`\`\`

---

## ساختار هر دکمه (Button Object)

| فیلد | نوع | الزامی | توضیحات |
|------|-----|--------|---------|
| \`label\` | string | ✅ بله | متن روی دکمه (مثلاً "دانلود"، "بستن") |
| \`actionUrl\` | string | ❌ خیر | لینک برای باز کردن (URL کامل) |
| \`action\` | string | ❌ خیر | اکشن داخلی (مثلاً "dismiss" برای بستن دیالوگ) |
| \`style\` | string | ❌ خیر | استایل دکمه: \`primary\`, \`secondary\`, \`danger\`, \`success\` |

**نکته:** حداقل یکی از \`actionUrl\` یا \`action\` باید مقداردهی شود.

---

## API Endpoints

### ایجاد دیالوگ با دکمه‌ها
\`\`\`http
POST /api/v1/dialogs
Content-Type: application/json

{
  "type": "in-app",
  "title": "عنوان دیالوگ",
  "message": "متن پیام",
  "buttons": [
    {
      "label": "تایید",
      "actionUrl": "https://example.com",
      "style": "primary"
    }
  ]
}
\`\`\`

### دریافت دیالوگ‌های فعال (Mobile)
\`\`\`http
GET /api/v1/mobile/dialogs?platform=android
\`\`\`

**پاسخ:**
\`\`\`json
[
  {
    "id": "uuid",
    "title": "عنوان",
    "message": "متن پیام",
    "imageUrl": "https://...",
    "buttons": [
      {
        "label": "دانلود",
        "actionUrl": "https://...",
        "style": "primary"
      }
    ],
    "sentTime": "2025-12-05T06:00:00Z"
  }
]
\`\`\`

---

## پیاده‌سازی در فرانت‌اند

### 1️⃣ **Dashboard (مدیریت دیالوگ‌ها)**

#### فرم ایجاد/ویرایش دیالوگ:
\`\`\`vue
<template>
  <div class="dialog-form">
    <!-- فیلدهای موجود: title, message, imageUrl, ... -->
    
    <!-- بخش دکمه‌ها -->
    <div class="buttons-section">
      <h3>دکمه‌های دیالوگ</h3>
      
      <div v-for="(button, index) in form.buttons" :key="index" class="button-item">
        <input v-model="button.label" placeholder="متن دکمه" required />
        <input v-model="button.actionUrl" placeholder="لینک (اختیاری)" type="url" />
        <input v-model="button.action" placeholder="اکشن (مثلاً dismiss)" />
        <select v-model="button.style">
          <option value="primary">اصلی</option>
          <option value="secondary">ثانویه</option>
          <option value="danger">خطر</option>
          <option value="success">موفقیت</option>
        </select>
        <button @click="removeButton(index)">حذف</button>
      </div>
      
      <button @click="addButton">+ افزودن دکمه</button>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      form: {
        title: '',
        message: '',
        imageUrl: '',
        buttons: []
      }
    }
  },
  methods: {
    addButton() {
      this.form.buttons.push({
        label: '',
        actionUrl: '',
        action: '',
        style: 'primary'
      })
    },
    removeButton(index) {
      this.form.buttons.splice(index, 1)
    },
    async createDialog() {
      await fetch('/api/v1/dialogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.form)
      })
    }
  }
}
</script>
\`\`\`

---

### 2️⃣ **Mobile App (نمایش دیالوگ)**

#### نمایش دیالوگ با دکمه‌ها:
\`\`\`dart
// Flutter Example
class DialogWidget extends StatelessWidget {
  final Dialog dialog;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(dialog.title),
      content: Column(
        children: [
          if (dialog.imageUrl != null)
            Image.network(dialog.imageUrl!),
          SizedBox(height: 16),
          Text(dialog.message),
        ],
      ),
      actions: dialog.buttons?.map((button) {
        return ElevatedButton(
          style: _getButtonStyle(button.style),
          onPressed: () => _handleButtonClick(button),
          child: Text(button.label),
        );
      }).toList() ?? [],
    );
  }

  void _handleButtonClick(DialogButton button) {
    if (button.action == 'dismiss') {
      Navigator.pop(context);
    } else if (button.actionUrl != null) {
      // باز کردن لینک
      launchUrl(Uri.parse(button.actionUrl!));
    }
    
    // ترک کلیک
    trackDialogClick(dialog.id);
  }

  ButtonStyle _getButtonStyle(String? style) {
    switch (style) {
      case 'primary':
        return ElevatedButton.styleFrom(backgroundColor: Colors.blue);
      case 'danger':
        return ElevatedButton.styleFrom(backgroundColor: Colors.red);
      default:
        return ElevatedButton.styleFrom(backgroundColor: Colors.grey);
    }
  }
}
\`\`\`

---

## نکات مهم برای پیاده‌سازی

### ✅ چیزهایی که باید انجام بدی:

1. **آپدیت Store/State Management:**
   - فیلد \`buttons\` رو به مدل دیالوگ اضافه کن
   - در فرم ایجاد/ویرایش، آرایه دکمه‌ها رو مدیریت کن

2. **Validation:**
   - حداقل یه دکمه باید \`label\` داشته باشه
   - اگه \`actionUrl\` وارد شد، باید URL معتبر باشه

3. **UI/UX:**
   - دکمه‌ها رو به ترتیب نمایش بده
   - از رنگ‌های مختلف برای \`style\` استفاده کن
   - حداکثر 3 دکمه توصیه میشه (برای UX بهتر)

4. **Tracking:**
   - وقتی کاربر روی دکمه کلیک می‌کنه، API تریک رو صدا بزن:
     \`\`\`
     POST /api/v1/mobile/dialogs/:id/click
     { "deviceId": "..." }
     \`\`\`

---

## مثال‌های کاربردی

### دیالوگ آپدیت اجباری:
\`\`\`json
{
  "title": "آپدیت الزامی",
  "message": "لطفاً برای ادامه استفاده، اپلیکیشن را به‌روزرسانی کنید",
  "buttons": [
    {
      "label": "به‌روزرسانی",
      "actionUrl": "https://play.google.com/store/apps/...",
      "style": "primary"
    }
  ]
}
\`\`\`

### دیالوگ تبلیغاتی:
\`\`\`json
{
  "title": "تخفیف ویژه!",
  "message": "50% تخفیف برای اشتراک پریمیوم",
  "imageUrl": "https://...",
  "buttons": [
    {
      "label": "خرید",
      "actionUrl": "https://example.com/premium",
      "style": "success"
    },
    {
      "label": "بعداً",
      "action": "dismiss",
      "style": "secondary"
    }
  ]
}
\`\`\`

### دیالوگ اطلاع‌رسانی ساده:
\`\`\`json
{
  "title": "سرورهای جدید اضافه شد",
  "message": "اکنون می‌توانید از سرورهای آلمان و فرانسه استفاده کنید",
  "buttons": [
    {
      "label": "متوجه شدم",
      "action": "dismiss",
      "style": "primary"
    }
  ]
}
\`\`\`

---

## خلاصه تغییرات Backend

✅ **فایل‌های تغییر یافته:**
- \`database/migrations/003_add_buttons_to_dialogs.sql\` - Migration
- \`dialog.entity.ts\` - اضافه شدن فیلد \`buttons: Array<Button>\`
- \`dialog-button.dto.ts\` - DTO جدید برای validation
- \`create-dialog.dto.ts\` - اضافه شدن فیلد \`buttons\`

✅ **نوع داده در دیتابیس:** JSONB (PostgreSQL)

✅ **Backward Compatible:** بله - فیلد \`buttons\` nullable هست، دیالوگ‌های قدیمی بدون مشکل کار می‌کنن

---

**موفق باشی! 🚀**
