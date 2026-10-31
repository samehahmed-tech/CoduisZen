RestoFlow - Cleanup Future Days

المشكلة:
الـ auto-close كان بيقفل أيام مستقبلية كل دقيقة بسبب غياب future-date guard.

الحل:
1) شغل Cleanup Future Days.bat (Admin).
2) شوف المعاينة: عدد التقارير المستقبلية والأوردرات واليوم الفاضي المختار.
3) اكتب CLEANUP.
4) انتظر SUCCESS.

السكريبت بيعمل:
- يلاقي يوم فاضي (مفيهوش أوردرات) في الـ 90 يوم اللي قبل 2026-10-17.
- ينقل كل الأوردرات اللي تاريخها >= 2026-10-17 لليوم الفاضي ده.
- يمسح كل day_close_reports بتاريخ >= 2026-10-17.
- يمسح كل daily_pnl_snapshots بتاريخ >= 2026-10-17.
- يغير business_date لكل الفروع لـ 2026-10-17.
- ما يمسحش Orders وPayments وStock وAudit.
- ياخد Backup كامل قبل أي تعديل.
- يضيف Audit باسم FUTURE_DAYS_CLEANUP.

كمان اتصلح الكود:
- dayCloseAutoCloseService: future-date guard يمنع قفل يوم أكبر من النهارده.
- dayCloseService.closeDay: same guard كمان طبقة.

مكان Backup وLog داخل مجلد تثبيت RestoFlow ERP.
