'use strict';
/**
 * Cafe beverage menu — data source for scripts/import-cafe-menu.cjs
 * ------------------------------------------------------------------
 * HOW TO USE:
 *   node scripts/import-cafe-menu.cjs --base http://localhost:3001 --email admin@x.com --password ****
 *   (defaults to --dry-run: prints a numbered review table, writes NOTHING)
 *   node scripts/import-cafe-menu.cjs ... --commit        → real import (updateExisting: true, safe re-runs)
 *   node scripts/import-cafe-menu.cjs --csv-out output/cafe-menu.csv      → CSV for the UI import screen
 *
 * Prices + categories were read off the sheet; item names were transcribed
 * from a screenshot — REVIEW the dry-run table and fix any name here, then
 * re-run with --commit (updateExisting patches in place, nothing duplicates).
 *
 * Row format: [categoryEn, nameAr, price]
 */

const CATEGORIES = [
    { en: 'Hot Drinks', ar: 'مشروبات ساخنة' },
    { en: 'Coffee drinks', ar: 'القهوة' },
    { en: 'Frappe', ar: 'فرابيه' },
    { en: 'Ice coffee', ar: 'آيس كوفي' },
    { en: 'Fresh juices', ar: 'عصائر فريش' },
    { en: 'Rosa garden', ar: 'روزا جاردن' },
    { en: 'Smoothie', ar: 'سموذي' },
    { en: 'Mojito', ar: 'موهيتو' },
    { en: 'redbull', ar: 'ريدبول' },
    { en: 'Milkshakes', ar: 'ميلك شيك' },
    { en: 'desserts', ar: 'حلويات' },
    { en: 'Extra', ar: 'إضافات' },
    { en: 'Rosa Garden Specials', ar: 'روزا سبيشيال' },
    { en: 'Chocolate', ar: 'شوكولاتة' },
    { en: 'Colored Hot Drinks', ar: 'مشروبات ملونة' },
];

// [categoryEn, nameAr, price] — Available = TRUE for all sheet rows.
const ITEMS = [
    // ── Hot Drinks ──
    ['Hot Drinks', 'شاي', 20],
    ['Hot Drinks', 'شاي أخضر', 30],
    ['Hot Drinks', 'نعناع', 25],
    ['Hot Drinks', 'ينسون', 35],
    ['Hot Drinks', 'شاي باللبن', 40],
    ['Hot Drinks', 'سحلب', 45],
    ['Hot Drinks', 'تيليو', 20],
    ['Hot Drinks', 'قرفة', 40],
    ['Hot Drinks', 'زنجبيل', 49],
    ['Hot Drinks', 'هوت شوكلت', 60],
    // ── Coffee drinks ──
    ['Coffee drinks', 'كورتادو', 45],
    ['Coffee drinks', 'قهوة تركي', 30],
    ['Coffee drinks', 'قهوة تركي مظبوط', 40],
    ['Coffee drinks', 'قهوة فرنساوي', 35],
    ['Coffee drinks', 'قهوة بندق', 45],
    ['Coffee drinks', 'اسبريسو', 45],
    ['Coffee drinks', 'دبل اسبريسو', 50],
    ['Coffee drinks', 'ميكاتو', 45],
    ['Coffee drinks', 'كابتشينو', 55],
    ['Coffee drinks', 'لاتيه', 50],
    ['Coffee drinks', 'موكا', 55],
    ['Coffee drinks', 'قهوة عربي', 45],
    ['Coffee drinks', 'قهوة فرنساوي بندق', 65],
    ['Coffee drinks', 'نسكافيه', 50],
    ['Coffee drinks', 'نسكافيه باللبن', 60],
    ['Coffee drinks', 'قهوة باللبن', 45],
    ['Coffee drinks', 'فلات وايت', 65],
    ['Coffee drinks', 'اسبريسو ميكاتو', 50],
    ['Coffee drinks', 'كابتشينو كراميل', 60],
    ['Coffee drinks', 'لاتيه فانيليا', 65],
    ['Coffee drinks', 'موكا وايت', 70],
    ['Coffee drinks', 'قهوة مثلجة', 70],
    ['Coffee drinks', 'كابتشينو بندق', 65],
    ['Coffee drinks', 'لاتيه كراميل', 70],
    // ── Frappe ──
    ['Frappe', 'فرابيه كلاسيك', 70],
    ['Frappe', 'فرابيه كراميل', 80],
    ['Frappe', 'فرابيه شوكولاتة', 80],
    ['Frappe', 'فرابيه فانيليا', 80],
    ['Frappe', 'فرابيه موكا', 80],
    ['Frappe', 'فرابيه لوتس', 100],
    ['Frappe', 'فرابيه بندق', 90],
    // ── Ice coffee ──
    ['Ice coffee', 'آيس لاتيه', 65],
    ['Ice coffee', 'آيس موكا (دارك - وايت)', 70],
    ['Ice coffee', 'آيس كراميل', 75],
    ['Ice coffee', 'آيس اسبانيش لاتيه', 75],
    ['Ice coffee', 'آيس لاتيه بندق', 70],
    ['Ice coffee', 'آيس كراميل ميكاتو', 80],
    ['Ice coffee', 'آيس موكا شيك', 75],
    ['Ice coffee', 'آيس لاتيه (لايت)', 65],
    // ── Fresh juices ──
    ['Fresh juices', 'برتقال', 65],
    ['Fresh juices', 'فراولة', 60],
    ['Fresh juices', 'مانجو', 50],
    ['Fresh juices', 'جوافة', 60],
    ['Fresh juices', 'موز', 60],
    ['Fresh juices', 'ليمون', 50],
    ['Fresh juices', 'ليمون نعناع', 55],
    ['Fresh juices', 'رمان', 60],
    ['Fresh juices', 'بطيخ', 60],
    ['Fresh juices', 'أناناس', 65],
    // ── Rosa garden (juices) ──
    ['Rosa garden', 'روزا ليمون', 70],
    ['Rosa garden', 'روزا فراولة', 75],
    ['Rosa garden', 'روزا مانجو', 75],
    ['Rosa garden', 'روزا بطيخ', 75],
    ['Rosa garden', 'روزا توت', 75],
    ['Rosa garden', 'روزا أناناس', 70],
    ['Rosa garden', 'روزا مشكل', 75],
    ['Rosa garden', 'روزا كيوي', 80],
    // ── Smoothie ──
    ['Smoothie', 'سموذي فراولة', 60],
    ['Smoothie', 'سموذي مانجو', 60],
    ['Smoothie', 'سموذي موز', 65],
    ['Smoothie', 'سموذي توت', 65],
    ['Smoothie', 'سموذي خوخ', 65],
    ['Smoothie', 'سموذي أناناس', 65],
    ['Smoothie', 'سموذي كيوي', 65],
    ['Smoothie', 'سموذي بطيخ نعناع', 65],
    ['Smoothie', 'سموذي فراولة موز', 65],
    ['Smoothie', 'سموذي مانجو خوخ', 70],
    ['Smoothie', 'سموذي توت مشكل', 70],
    ['Smoothie', 'سموذي أفوكادو', 70],
    ['Smoothie', 'سموذي تمر', 65],
    ['Smoothie', 'سموذي قهوة', 70],
    // ── Mojito ──
    ['Mojito', 'موهيتو كلاسيك', 60],
    ['Mojito', 'موهيتو فراولة', 65],
    ['Mojito', 'موهيتو مانجو', 65],
    ['Mojito', 'موهيتو باشن', 65],
    ['Mojito', 'موهيتو توت', 70],
    ['Mojito', 'موهيتو نعناع', 65],
    ['Mojito', 'موهيتو ليمون', 65],
    ['Mojito', 'موهيتو خوخ', 65],
    ['Mojito', 'موهيتو كيوي', 65],
    ['Mojito', 'موهيتو أناناس', 65],
    ['Mojito', 'موهيتو بطيخ', 65],
    ['Mojito', 'موهيتو تفاح', 65],
    // ── Redbull ──
    ['redbull', 'ريدبول', 120],
    ['redbull', 'ريدبول (فراولة - توت - خوخ)', 120],
    // ── Milkshakes ──
    ['Milkshakes', 'ميلك شيك فانيليا', 60],
    ['Milkshakes', 'ميلك شيك شوكولاتة', 65],
    ['Milkshakes', 'ميلك شيك فراولة', 65],
    ['Milkshakes', 'ميلك شيك مانجو', 65],
    ['Milkshakes', 'ميلك شيك كراميل', 65],
    ['Milkshakes', 'ميلك شيك لوتس', 65],
    ['Milkshakes', 'ميلك شيك أوريو', 65],
    ['Milkshakes', 'ميلك شيك كيوي', 65],
    ['Milkshakes', 'ميلك شيك قهوة', 70],
    ['Milkshakes', 'ميلك شيك بندق', 80],
    // ── Desserts ──
    ['desserts', 'تشيز كيك', 60],
    ['desserts', 'مولتن كيك', 70],
    ['desserts', 'سينابون', 70],
    ['desserts', 'وافل', 80],
    ['desserts', 'بان كيك', 100],
    ['desserts', 'كوكيز', 80],
    ['desserts', 'براونيز', 120],
    ['desserts', 'أم علي', 60],
    // ── Extra (add-ons: also sold standalone AND attached as modifiers) ──
    ['Extra', 'إضافة شوت اسبريسو', 30],
    ['Extra', 'إضافة لبن', 20],
    ['Extra', 'إضافة كريمة', 20],
    ['Extra', 'إضافة صوص كراميل', 15],
    ['Extra', 'إضافة صوص شوكولاتة', 15],
    ['Extra', 'إضافة فانيليا', 15],
    ['Extra', 'إضافة بندق', 25],
    ['Extra', 'إضافة كراميل', 20],
    ['Extra', 'إضافة مارشميلو', 15],
    ['Extra', 'إضافة قرفة', 15],
    ['Extra', 'إضافة لوتس', 30],
    ['Extra', 'إضافة أوريو', 30],
    // ── Rosa Garden Specials (signature drinks) ──
    ['Rosa Garden Specials', 'بينك أثينا', 115],
    ['Rosa Garden Specials', 'سانتوريني لافندر', 120],
    ['Rosa Garden Specials', 'ميديترينيان صن ست', 125],
    ['Rosa Garden Specials', 'جريك جاردن موهيتو', 125],
    ['Rosa Garden Specials', 'بلو ميكونوس', 120],
    ['Rosa Garden Specials', 'بيري بلوسوم', 125],
    ['Rosa Garden Specials', 'كلاود روزا', 145],
    ['Rosa Garden Specials', 'هاني ليمون بريز', 155],
    ['Rosa Garden Specials', 'أوليف جاردن سانجريا', 110],
    ['Rosa Garden Specials', 'روزا دريم', 135],
    // ── Chocolate ──
    ['Chocolate', 'هوت شوكلت', 165],
    ['Chocolate', 'دارك شوكلت أورانج', 155],
    ['Chocolate', 'مينت شوكلت', 160],
    ['Chocolate', 'وايت شوكلت بيري', 165],
    ['Chocolate', 'لوتس شوكلت', 170],
    ['Chocolate', 'بينو جاردن شوكلت', 180],
    // ── Colored Hot Drinks ──
    ['Colored Hot Drinks', 'بينك روز لاتيه', 125],
    ['Colored Hot Drinks', 'لافندر لاتيه', 125],
    ['Colored Hot Drinks', 'بلو باترفلاي لاتيه', 130],
    ['Colored Hot Drinks', 'بيستاشيو لاتيه', 145],
    ['Colored Hot Drinks', 'موكا لاتيه', 135],
];

/** Categories that receive the "Extras" modifier group (everything drinkable). */
const DRINK_CATEGORIES = new Set([
    'Hot Drinks', 'Coffee drinks', 'Frappe', 'Ice coffee', 'Fresh juices',
    'Rosa garden', 'Smoothie', 'Mojito', 'redbull', 'Milkshakes',
    'Rosa Garden Specials', 'Chocolate', 'Colored Hot Drinks',
]);

/** Categories that receive the free "Sugar" choice group. */
const SUGAR_CATEGORIES = new Set(['Hot Drinks', 'Coffee drinks', 'Colored Hot Drinks']);

const SUGAR_OPTIONS = ['سادة', 'مظبوط', 'زيادة', 'سكر خفيف'];

/**
 * Cup sizes — DISABLED by default: the sheet lists one price per item, so
 * size deltas would be invented money. To enable, set ENABLE_SIZES = true
 * and fill SIZE_DELTAS with the real price differences.
 */
const ENABLE_SIZES = false;
const SIZE_OPTIONS = [
    { name: 'صغير', nameEn: 'Small', delta: 0 },
    { name: 'وسط', nameEn: 'Medium', delta: 10 },
    { name: 'كبير', nameEn: 'Large', delta: 20 },
];

module.exports = { CATEGORIES, ITEMS, DRINK_CATEGORIES, SUGAR_CATEGORIES, SUGAR_OPTIONS, ENABLE_SIZES, SIZE_OPTIONS };
