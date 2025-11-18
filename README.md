# etqan-replicator

Mirror عملي بين SQLite (محلي) و MySQL (ريموت) باستخدام Sequelize:
- كل عملية تُكتب على SQLite دائمًا.
- نحاول الكتابة على MySQL؛ وإن فشل الاتصال تُسجّل في outbox وتُزامَن لاحقًا.
- إضافة موديل جديد = تعريف واحد يُسجّل على المحركين ثم إضافته في modelsMap.

## تشغيل
1) حرّر `.env` حسب بيئتك.
2) `npm i`
3) `npm run start`
4) اختبر:
   - `GET /health`
   - `POST /clients` ، `PUT /clients/:id` ، `DELETE /clients/:id`

## إضافة موديل جديد
- أنشئ ملفًا في `src/models/` (مثال: `invoice.model.js`).
- ضمّنه في `src/models/index.js`.
- أضفه في `src/stores.js` داخل `modelsMap`.
- أنشئ راوت (اختياري) في `src/routes/`.

> هذا المثال يستخدم "last write wins" كمبدأ تسوية بسيط.
"# Mohamed-Samy-Backend" 
