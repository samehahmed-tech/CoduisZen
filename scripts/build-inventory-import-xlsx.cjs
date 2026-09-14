// Build inventory import XLSX from the handwritten stock sheet (best-effort reading).
const path = require('path');
const XLSX = require(path.join(__dirname, '..', 'node_modules', 'xlsx'));

// [name_ar, unit, opening_qty, purchase_price, cost_price, threshold, reviewNote]
const rows = [
    ['آيس بلاتينيوم',        'KG',    25,    11.5, 11.5, 0,  'الورقة 1: ٢٥ كيلو × ١١٫٥٠ — تأكد من السعر'],
    ['آيس بانثين شفة',       'GM',    665,   0, 0, 0,      'الورقة 1: ٦٦٥ + ٣٤٠ جم — الكمية غير مؤكدة'],
    ['آيس كورد بلو',         'KG',    11,    0, 0, 0,      'الورقة 1: ١١ كجم'],
    ['سورس',                 'KG',    0,     0, 0, 0,      'الورقة 1: مكتوب ٣٨٥ — هل هو كمية أم سعر؟ أدخل الكمية'],
    ['هتشردهم',              'GM',    68,    0, 0, 0,      'الورقة 1: ٦٨ جم'],
    ['أبريس',                'GM',    44,    0, 0, 0,      'الورقة 1: ٤٤ جم'],
    ['تيم',                  'GM',    250,   0, 0, 0,      'الورقة 1: ٢٥٠ جم'],
    ['سنش مذك',              'KG',    0,     0, 0, 0,      'الورقة 1: غير واضحة — أدخل الكمية والسعر'],
    ['قراف كاردة ثلجة',      'KG',    125,   135, 135, 0, 'الورقة 1: ١٢٥ — السعر ١٣٥ للكيلو؟'],
    ['بفبر بيضة',            'PIECE', 40,    50, 50, 0,     'الورقة 1: ٤٠ بيضة × ٥٠'],
    ['كاريا ورد قشل (عبوة)', 'PACK',  10,    10, 10, 0,     'الورقة 1: ١٠ للعبوة — اسم الصنف غير مؤكد'],
    ['كزبرة عبوة',           'PACK',  6,     6, 6, 0,      'الورقة 1: ٦ للعبوة'],
    ['ميرندا درجة',          'PIECE', 11,    0, 0, 0,      'الورقة 1: ١١ درجة'],
    ['صنف مدهات',            'PACK',  14,    9, 9, 0,      'الورقة 1: ١٤ × ٩ للعبوة'],
    ['كريلك الوردة',         'PIECE', 0,     0, 0, 0,      'الورقة 1: بدون كمية — أكملها'],
    ['بيسي ماوجمة',          'PIECE', 5,     0, 0, 0,      'الورقة 2: ٥ — الاسم غير مؤكد'],
    ['بفوس',                 'PIECE', 44,    0, 0, 0,      'الورقة 2: ٤٤ درع؟'],
    ['شمرى لفة',             'PACK',  150,   20, 20, 0,     'الورقة 2: ١٥٠ لفة × ٢٠ للفة'],
    ['كزبرة لفة',            'PACK',  16,    35, 35, 0,     'الورقة 2: ١٦ لفة × ٣٥ للفة'],
    ['كاوزان شكديما',        'PIECE', 150,   100, 100, 0,   'الورقة 2: ١٥٠ درع × ١٠٠ للعبوة — الاسم غير مؤكد'],
    ['ملح متحري',            'PACK',  4,     50, 50, 0,      'الورقة 2: ٤ فيوار × ٥٠ — الاسم غير مؤكد'],
    ['خميرة',                'PACK',  75,    0, 0, 0,       'الورقة 2: ٧٥'],
    ['زيت مونخ',             'KG',    125,   26, 26, 0,      'الورقة 2: ١٢٥ × ٢٦ للكيلو — الوحدة غير مؤكدة'],
    ['رز بسمتي',             'KG',    19,    0, 0, 0,       'الورقة 2: ١٩ كجم'],
    ['جبرام (كده رضا)',      'KG',    7.2,   0, 0, 0,      'الورقة 3: ٧٫٢ كيلو'],
    ['هفر (كده رضا)',        'KG',    75,    0, 0, 0,      'الورقة 3: ٧٥ — الكمية والوحدة غير مؤكدتين'],
    ['كفينة (كده رضا)',      'KG',    2,     0, 0, 0,      'الورقة 3: ٢ كيلو'],
];

const WAREHOUSE_ID = 'wh-main'; // المخزن الرئيسي — غيّره لو الرصيد لمخزن تاني

const data = rows.map(([nameAr, unit, qty, pp, cp, threshold, note], i) => ({
    code: `ITM-${String(i + 1).padStart(3, '0')}`,
    name_en: nameAr,
    name_ar: nameAr,
    unit,
    category: '',
    barcode: '',
    purchase_price: pp,
    cost_price: cp,
    alert_threshold: threshold,
    warehouse_id: WAREHOUSE_ID,
    warehouse_name: 'Main Store',
    opening_quantity: qty,
    '⚠ مراجعة': note,
}));

const guide = [
    { column: 'code', required: 'نعم', description: 'كود فريد لكل صنف (متولد تلقائياً ITM-001...)' },
    { column: 'name_en / name_ar', required: 'نعم', description: 'اسم الصنف' },
    { column: 'unit', required: 'لا', description: 'KG / GM / PIECE / PACK / LTR' },
    { column: 'purchase_price / cost_price', required: 'لا', description: 'سعر الشراء والتكلفة' },
    { column: 'warehouse_id', required: 'لو فيه رصيد', description: 'wh-main = المخزن الرئيسي' },
    { column: 'opening_quantity', required: 'لا', description: 'رصيد أول المدة' },
    { column: '⚠ مراجعة', required: '-', description: 'ملاحظاتي على الكشكول — راجعها وعدّل قبل الاستيراد (العمود ده مش هيتستورد)' },
];

const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'Inventory');
XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(guide), 'Guide');

const out = path.join(process.env.USERDESKTOP || process.env.USERPROFILE, 'Desktop', 'استيراد-المخزون.xlsx');
XLSX.writeFile(book, out);
console.log('WROTE: ' + out + ' | rows: ' + data.length);
