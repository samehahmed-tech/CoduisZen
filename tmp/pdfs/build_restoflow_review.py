from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.pdfgen import canvas
import arabic_reshaper
from bidi.algorithm import get_display

ROOT=Path(r"D:\Projects\restoflow-erp")
OUT=ROOT/"output"/"pdf"/"RestoFlow-Competitive-Review-Ar-2026-10-26.pdf"; OUT.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont("Tahoma",r"C:\Windows\Fonts\tahoma.ttf")); pdfmetrics.registerFont(TTFont("Tahoma-Bold",r"C:\Windows\Fonts\tahomabd.ttf"))
def rtl(s): return get_display(arabic_reshaper.reshape(str(s)))
def P(s,st): return Paragraph(rtl(s),st)
ss=getSampleStyleSheet()
ss.add(ParagraphStyle(name="T",fontName="Tahoma-Bold",fontSize=24,leading=32,alignment=TA_RIGHT,textColor=colors.HexColor("#123B5D"),spaceAfter=10))
ss.add(ParagraphStyle(name="S",fontName="Tahoma",fontSize=12,leading=19,alignment=TA_RIGHT,textColor=colors.HexColor("#425466"),spaceAfter=9))
ss.add(ParagraphStyle(name="H",fontName="Tahoma-Bold",fontSize=16,leading=23,alignment=TA_RIGHT,textColor=colors.HexColor("#123B5D"),spaceBefore=8,spaceAfter=8))
ss.add(ParagraphStyle(name="H2",fontName="Tahoma-Bold",fontSize=12,leading=18,alignment=TA_RIGHT,textColor=colors.HexColor("#0E7490"),spaceBefore=6,spaceAfter=5))
ss.add(ParagraphStyle(name="B",fontName="Tahoma",fontSize=9.5,leading=16,alignment=TA_RIGHT,textColor=colors.HexColor("#203040"),spaceAfter=5))
ss.add(ParagraphStyle(name="C",fontName="Tahoma",fontSize=7.1,leading=10,alignment=TA_RIGHT,textColor=colors.HexColor("#172B3A")))
ss.add(ParagraphStyle(name="CH",fontName="Tahoma-Bold",fontSize=7.1,leading=10,alignment=TA_CENTER,textColor=colors.white))
ss.add(ParagraphStyle(name="L",fontName="Tahoma",fontSize=7,leading=10,alignment=TA_LEFT,textColor=colors.HexColor("#1F4E79")))
def bullet(x): return P("- "+x,ss["B"])
def T(rows,widths):
    t=Table(rows,colWidths=widths,repeatRows=1,hAlign="RIGHT")
    cmd=[("GRID",(0,0),(-1,-1),.35,colors.HexColor("#B8C7D3")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),("BACKGROUND",(0,0),(-1,0),colors.HexColor("#123B5D"))]
    for r in range(2,len(rows),2): cmd.append(("BACKGROUND",(0,r),(-1,r),colors.HexColor("#F3F7FA")))
    t.setStyle(TableStyle(cmd)); return t
class NC(canvas.Canvas):
    def __init__(self,*a,**k): canvas.Canvas.__init__(self,*a,**k); self.pages=[]
    def showPage(self): self.pages.append(dict(self.__dict__)); self._startPage()
    def save(self):
        n=len(self.pages)
        for st in self.pages:
            self.__dict__.update(st); self.saveState(); self.setStrokeColor(colors.HexColor("#D7E1E8")); self.line(15*mm,12*mm,195*mm,12*mm); self.setFont("Tahoma",7); self.setFillColor(colors.HexColor("#63788A")); self.drawRightString(195*mm,7*mm,rtl("مراجعة RestoFlow ERP - 26 أكتوبر 2026")); self.drawString(15*mm,7*mm,f"{self._pageNumber} / {n}"); self.restoreState(); canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

st=[Spacer(1,18*mm),P("مراجعة RestoFlow ERP والمقارنة التنافسية",ss["T"]),P("تقييم قائم على الكود والواجهات والـ API وقاعدة البيانات والاختبارات، مع مقارنة موثقة بأشهر منصات تشغيل المطاعم",ss["S"]),Spacer(1,6*mm)]
st.append(T([[P(x,ss["CH"]) for x in ["حالة التقرير","نطاق المراجعة","تاريخ الفحص"]],[P(x,ss["C"]) for x in ["نسخة العمل الحالية داخل المستودع، وليست شهادة تشغيل إنتاجي","المنتج، المميزات، التكاملات، المخاطر، والمقارنة السوقية","26 أكتوبر 2026"]]], [55*mm,70*mm,45*mm]))
st += [Spacer(1,8*mm),P("الخلاصة التنفيذية",ss["H"]),P("RestoFlow يمتلك عرضًا قويًا جدًا للمطاعم وسلاسل الفروع التي تريد ربط التشغيل اليومي بالمخزون والمالية والموارد البشرية في منظومة واحدة. نقطة تميزه الأساسية ليست مجرد وجود POS أو KDS، بل امتداد دورة العمل من الطلب إلى المطبخ والتوصيل والمخزون والتكلفة والخزينة والإقفال والتقارير.",ss["B"]),P("لكن لا يصح تسويقه حاليًا على أنه متفوق مطلقًا على كل المنافسين. المراجعة أثبتت نجاح production build و45 اختبارًا وحديًا في الإعداد الحالي، بينما فشل typecheck بسبب نفاد ذاكرة Node عند حد 8GB. كما ظهر تحذير عن chunk كبير ودورة في تقسيم chunks. لذلك الرسالة البيعية الصحيحة هي: RestoFlow أعمق وأقرب لاحتياجات التشغيل المحلي المتكامل، بشرط إغلاق بوابة التحقق النهائي وتوثيق التكاملات والإنتاجية.",ss["B"]),P("1. ماذا وجدنا داخل النظام؟",ss["H"]),P("التحليل المعماري السابق داخل المشروع يحتوي على 7,349 عقدة مترابطة، ما يعكس حجمًا كبيرًا من المكونات والوظائف. وفي واجهة التطبيق توجد 60+ مسارات تشغيلية واضحة، بينما يضم مخطط قاعدة البيانات عشرات الكيانات تغطي البيع والعملاء والمخزون والمشتريات والمالية والتوصيل والموظفين والرواتب والتسويق والولاء.",ss["B"]),P("تم الاعتماد على دليل التنقل والـ routes ومجلدات server/routes وservices/api وschema.ts وtests، وليس على صفحة تسويقية فقط. كل ميزة في الجدول التالي تم تصنيفها حسب درجة الدليل المتاح.",ss["B"])]
fr=[[P(x,ss["CH"]) for x in ["المجال","ما هو ظاهر ومسنود بالكود","درجة الدليل"]]]
for a,b,c in [
("المبيعات وPOS","طلبات dine-in وtakeaway وdelivery، modifiers، split bill، طرق دفع متعددة، باركود، تعليق الطلب، مرتجعات، طباعة، صلاحيات واعتمادات","قوي: route + components + API + اختبارات"),
("المطبخ والتسليم","KDS، routing للمحطات، حالات تحضير، شاشة pickup، طباعة مطبخ، حالات تأخير","قوي: مكونات + routes + اختبارات KDS"),
("الطاولات والحجوزات","floor designer، طاولات، دمج ونقل الطلب، reservations وwaitlists","قوي للوظائف الأساسية، يحتاج UAT للتجربة"),
("المنيو والوصفات","أصناف وتصنيفات وإضافات وتسعير، recipes، cost، menu import/export، ربط الطابعات","قوي: schema + UI + اختبارات menu/cost"),
("المخزون والمشتريات","مخازن متعددة، جرد blind، حركات، batches، موردون، PO، استلام جزئي، تحويلات، هالك، reorder","قوي: schema + controllers + اختبارات واسعة"),
("الإنتاج والتقطيع","production orders وbutchery yield وoutputs وtemplates","جيد: schema + routes + اختبارات، يحتاج E2E"),
("المالية والخزينة","GL، chart of accounts، journal posting، P&L، budgets، cash drawers، treasury، expenses، day close","قوي وظيفيًا، لكن finance integrity بوابة حرجة"),
("التوصيل","zones، drivers، dispatch، COD ledger، telemetry، POD ومسارات فشل التسليم","جيد إلى قوي: APIs + اختبارات delivery"),
("العملاء والولاء","CRM، عناوين، complaints، coupons، wallets، loyalty rewards، campaigns","جيد: schema + routes، تحقق من كل رحلة تسويقية"),
("HR والرواتب","موظفون، حضور، بصمة، ورديات، إجازات، payroll cycles، payslips، loans، scheduling","قوي في البنية، يلزم UAT وامتثال محلي"),
("التكاملات","Paymob، Talabat، منصات، WhatsApp، mail، maps، printers، webhooks","متفاوت: وجود الكود لا يثبت اعتماد الحساب أو SLA"),
("AI والتقارير","AI assistant، insights، forecasts، reports sales/finance/inventory/HR، PDF/Excel","جيد، يجب إثبات مصدر كل رقم وعدم التخمين")]:
    fr.append([P(x,ss["C"]) for x in [a,b,c]])
st.append(T(fr,[35*mm,100*mm,35*mm]))
st += [P("2. ما الذي يمكن قوله للعميل بثقة؟",ss["H"]),P("الرسالة الأقوى هي أن RestoFlow يربط القرارات التجارية بالعملية التي أنتجتها: الطلب يذهب للمطبخ، ويؤثر على المخزون والتكلفة، ثم يظهر في المالية والتقارير والإقفال، مع صلاحيات وسجل تدقيق. هذا يقلل النقل اليدوي بين أنظمة منفصلة.",ss["B"])]
for x in ["منظومة واحدة بدل تجميع POS وExcel ومخزون ورواتب يدويًا.","عمق محلي في سيناريوهات الفرع: business date، day close، العهدة، المناطق، السائقين، والتحصيل.","قابلية رقابة أعلى عبر permissions وapprovals وaudit وbranch isolation.","عمق في food cost والوصفات والمخزون والإنتاج يجعل القرار مبنيًا على تكلفة فعلية لا على المبيعات فقط.","مرونة عربية وتشغيلية: عربي/إنجليزي وRTL/LTR وثيمات وواجهات متعددة الأدوار."]: st.append(bullet(x))

st += [PageBreak(),P("3. جدول المقارنة التنافسي",ss["H"]),P("المقارنة التالية تقيس ملاءمة المنتج للاستخدام المقصود، لا تدعي أن أي خانة تعني غياب الميزة تمامًا. تم الرجوع إلى صفحات المنتجات والتوثيق الرسمي المتاح لكل منافس، مع وضع RestoFlow بناءً على أدلة المستودع.",ss["B"])]
cr=[[P(x,ss["CH"]) for x in ["المحور","RestoFlow","Foodics","Toast","Odoo","Lightspeed","Oracle Simphony"]]]
for row in [
("POS والمطعم","شامل: صالة/تيك أواي/توصيل، split، طاولات","شامل ومصمم للمطاعم","قوي جدًا ومتكامل","قوي ومرن","قوي","مؤسسي وقابل للتوسع"),
("المخزون والوصفات","عميق مع recipes وbatches وproduction وbutchery","قوي للـ F&B","قوي مع xtraCHEF","الأعمق في المخزون العام","ingredient-level عبر module","inventory mobile وforecasting"),
("المحاسبة والإقفال","مضمن: GL وtreasury وday close وETA","Accounting مخصص للمطاعم","financial platform/add-ons","Accounting ناضج","Accounting/integrations","back office/reporting"),
("HR والرواتب","حضور وبصمة وجدولة ورواتب داخل نفس النظام","HR/accounting حسب العرض","payroll/team management","يحتاج تطبيقات/إعداد","workforce/payroll","labor management"),
("التوصيل والقنوات","zones/drivers/COD + aggregators حسب الإعداد","Marketplace وonline/call center","online + 200+ integrations","delivery apps وonline","Order Anywhere/Delivery","online ordering/integrations"),
("اللغة والسياق المحلي","عربي/إنجليزي وRTL وETA ومسارات مصرية","قوي إقليميًا","قوي لكن تمركزه أمريكي","عالمي ومرن لكن يحتاج localization","عالمي","مؤسسي وعالمي"),
("المرونة والتخصيص","ملكية/تخصيص عالية حسب بيئة النشر","ecosystem marketplace","منصة مغلقة نسبيًا مع add-ons","أعلى مرونة وتطبيقات كثيرة","API/partners","enterprise integrations"),
("الدليل الحالي على الجاهزية","build ناجح، 45 unit tests، typecheck غير مكتمل","توثيق منتج ومجتمع واسع","توثيق منتج ودعم 24/7","توثيق رسمي واسع","توثيق رسمي","توثيق رسمي ومؤسسي")]:
    cr.append([P(x,ss["C"]) for x in row])
st.append(T(cr,[27*mm,34*mm,28*mm,28*mm,28*mm,28*mm,27*mm]))
st += [Spacer(1,6*mm),P("القراءة العملية للمقارنة",ss["H2"]),P("Foodics وToast أقوى في ecosystem الجاهز، الأجهزة، الشركاء، والدعم المعياري. Odoo أقوى في عمومية ERP والمخزون والتخصيص. Lightspeed قوي في المطاعم متعددة المواقع والتكاملات. Oracle Simphony أنسب للمؤسسات الكبيرة والضيافة. ميزة RestoFlow تكون أوضح عندما يريد العميل نظامًا واحدًا بعمق تشغيل محلي وملكية أعلى بدل تجميع منتجات متعددة.",ss["B"]),P("4. لماذا يختار العميل RestoFlow؟",ss["H"])]
for x in ["لو العميل يحتاج التحكم في دورة الطلب كاملة من البيع إلى الإقفال والتقرير.","لو لديه مخزون مكونات ووصفات وتكلفة وهالك وإنتاج، وليس مجرد بيع أصناف نهائية.","لو يحتاج إدارة فرع/فروع وسائقين ومناطق وتحصيلات محلية.","لو يريد عربي وRTL، صلاحيات دقيقة، يوم تشغيل، موافقات، وسجل تدقيق في منتج واحد.","لو يريد تخصيصًا أعمق وملكية أكبر للبيانات ومسار نشر يناسب بيئته."]: st.append(bullet(x))
st += [P("5. متى لا يختار العميل المنافسين؟",ss["H"]),P("لا ينبغي مهاجمة المنافسين بادعاءات عامة. الأفضل توضيح حالة عدم الملاءمة لكل منتج؛ فالقرار يعتمد على حجم المؤسسة، الدولة، الأجهزة، الدفع، مستوى التخصيص، والميزانية.",ss["B"])]
for x in ["Foodics: لا تختاره إذا كانت الأولوية الأولى هي امتلاك منطق ERP/HR/finance مخصص داخل منتج واحد أو تقليل الاعتماد على marketplace والإضافات؛ اختاره إذا كانت أولوية العميل ecosystem جاهزًا ودعمًا إقليميًا واسعًا.","Toast: لا تختاره إذا كان التشغيل خارج سوقه الأساسي أو يحتاج localization مصريًا عميقًا وملكية نشر مرنة؛ اختاره إذا كانت أولوية العميل منصة أمريكية ناضجة مع payments/payroll/marketing ودعم 24/7.","Odoo: لا تختاره إذا كان العميل يريد تجربة مطاعم جاهزة بأقل إعداد وتخصيص داخلي؛ اختاره إذا كان يريد ERP عامًا وتخصيصًا واسعًا ومستعدًا لشريك تنفيذ.","Lightspeed: لا تختاره إذا كانت الأولوية هي payroll/finance/HR محلية مدمجة بعمق أو تشغيل مصري خاص؛ اختاره إذا كانت أولوية العميل multi-location وAPI وشبكة integrations.","Oracle Simphony: لا تختاره إذا كان العميل مطعمًا صغيرًا يريد سرعة تنفيذ وتكلفة وتعقيدًا منخفضين؛ اختاره إذا كان مؤسسة فندقية أو سلسلة كبيرة تحتاج enterprise governance وhardware ecosystem."]: st.append(bullet(x))

st += [P("6. نقاط الضعف والمخاطر قبل البيع المؤسسي",ss["H"]),P("هذه النقاط لا تلغي قيمة المنتج، لكنها تمنع الوعد الزائد وتحدد ما يجب إغلاقه قبل التوسع التجاري.",ss["B"])]
rr=[[P(x,ss["CH"]) for x in ["المخاطرة","الدليل","التأثير","الأولوية"]]]
for row in [("Typecheck غير مكتمل","Node OOM عند 8GB","لا توجد بوابة compile كاملة حاليًا","حرجة"),("الاختبارات التي شُغلت 45 فقط","إعداد unit config الحالي شغّل 8 ملفات","لا يثبت كل المميزات أو E2E","حرجة"),("التكاملات تعتمد على الحسابات والبيئة","routes وwebhooks موجودة، لكن الإعداد الخارجي منفصل","خطر فجوة بين demo والإنتاج","عالية"),("حجم الواجهة","chunk أكبر من 600KB وتحذير circular chunk","زمن تحميل وتجربة أضعف على أجهزة الفروع","عالية"),("الامتثال والأموال","وجود hardening map لمشكلات idempotency والمال والصلاحيات","أي خطأ يسبب أثرًا ماليًا أو خصوصيًا","حرجة"),("الـ UAT","الدليل يذكر 193 سيناريو UAT، ولا يوجد هنا إثبات تنفيذها كلها","لا يمكن اعتبار كل رحلة جاهزة","حرجة")]: rr.append([P(x,ss["C"]) for x in row])
st.append(T(rr,[38*mm,48*mm,62*mm,22*mm])); st += [P("بوابة الإصدار المقترحة",ss["H2"])]
for x in ["تشغيل typecheck على بيئة ذات ذاكرة أعلى أو تضييق نطاقات TypeScript حتى ينجح دون OOM.","تشغيل كامل unit/integration وE2E على قاعدة بيانات اختبار معزولة، ثم تنفيذ سيناريوهات البيع والتوصيل والشراء والإقفال والمرتجع.","إثبات branch isolation وidempotency وpayment/webhook وfinance posting قبل أي وعد عن الأرقام أو الأمان.","عمل pilot مدفوع قصير مع فرع حقيقي وبيانات مجهولة، وقياس زمن POS/KDS/تقارير والإقفال.","تحويل كل integration إلى checklist إعداد وتسليم: credentials، webhook signing، retries، failure states، ownership، SLA."]: st.append(bullet(x))
st += [P("7. القرار النهائي",ss["H"]),P("أوصي بتسويق RestoFlow كمنصة تشغيل ERP للمطاعم وسلاسل الفروع، وليست مجرد POS. هذا التموضع أقوى من مقارنة سطحية في عدد الأزرار، ويستند إلى عمق واضح في المخزون والتكلفة والمالية والـ HR والتوصيل. في المقابل، لا أوصي حاليًا بادعاء أنه يتفوق في الأجهزة والدعم الجاهز أو ecosystem على Toast/Foodics/Oracle؛ هذه مجالات تحتاج إثباتًا تجاريًا وتشغيليًا منفصلًا.",ss["B"]),P("قرار الشراء المقترح: اختَر RestoFlow إذا كانت الأولوية هي التكامل والمرونة والسياق المحلي والملكية. اختَر المنافس إذا كانت الأولوية هي ecosystem جاهز، أجهزة معتمدة، دعم عالمي، أو تنفيذ مؤسسي مسبق. أفضل خطوة بيع هي pilot مدفوع قصير بمؤشرات قبول واضحة، وليس demo مفتوحًا بلا بيانات حقيقية.",ss["B"]),PageBreak(),P("8. مصادر المقارنة والتحقق",ss["H"]),P("المصادر التالية صفحات رسمية أو توثيق رسمي متاح وقت إعداد التقرير. مميزات RestoFlow نفسها مستخلصة من المستودع المحلي، وليست من هذه الروابط.",ss["B"])]
for n,u in [("Foodics - RMS Features","https://www.foodics.com/rms-features/"),("Foodics - Accounting Egypt","https://www.foodics.com/accounting-egp/"),("Foodics Egypt offer and modules","https://offers.foodics.com/en/eg/restaurant-management-pos-offer/"),("Toast - Restaurant POS","https://pos.toasttab.com/restaurant-pos"),("Toast - Platform and pricing","https://pos.toasttab.com/toast-platform"),("Toast - How Toast works","https://pos.toasttab.com/how-toast-works"),("Odoo - Restaurant POS","https://www.odoo.com/app/point-of-sale-restaurant"),("Odoo - Restaurant documentation","https://www.odoo.com/documentation/saas-18.4/applications/sales/point_of_sale/restaurant.html"),("Odoo - Inventory features","https://www.odoo.com/app/inventory-features"),("Lightspeed - Restaurant POS","https://www.lightspeedhq.com/pos/restaurant/"),("Lightspeed - Multi-location documentation","https://k-series-support.lightspeedhq.com/hc/en-us/articles/23973504428059-Navigating-business-locations"),("Oracle - Simphony documentation","https://docs.oracle.com/en/industries/food-beverage/simphony/"),("Oracle Simphony user guide","https://docs.oracle.com/en/industries/food-beverage/simphony/sipou/index.html")]:
    st += [P(n,ss["H2"]),Paragraph(u,ss["L"]),Spacer(1,2*mm)]
st += [P("ملحق: الأدلة المحلية المستخدمة",ss["H"]),P("routes.tsx وcomponents/common/navigation.ts وsrc/db/schema.ts وserver/routes وservices/api وtests وdocs/CODUIS-ZEN-MARKETING-AR-EG.md وdocs/SYSTEM-VALIDATION-GUIDE-AR.md وCAPABILITY-MAP-system-hardening.md. تم الحفاظ على تغييرات المستخدم الحالية ولم يتم تعديل كود المنتج أثناء المراجعة.",ss["B"])]
SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=15*mm,leftMargin=15*mm,topMargin=15*mm,bottomMargin=18*mm,title="مراجعة RestoFlow ERP والمقارنة التنافسية").build(st,canvasmaker=NC)
print(OUT)
