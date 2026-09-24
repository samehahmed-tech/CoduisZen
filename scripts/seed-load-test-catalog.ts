/**
 * Seed load-test catalog on the INSTALLED trial database.
 * - 100 inventory items (15 of them composite BOM from other stock items)
 * - 100 sales (menu) items: 30 plain / 25 sizes / 25 modifiers / 20 full (sizes+modifiers+image+recipe)
 * - ~30 menu items with images, ~70 recipes linked to stock items
 * - Idempotent: deletes previous rows with the LOADTEST prefix only, never touches real data.
 *
 * Run: npx tsx scripts/seed-load-test-catalog.ts [--cleanup-only]
 * DB: uses DATABASE_URL from .env.local / .env (installed SQL Server .\CODUISZEN)
 */
import { db, pool } from '../server/db';
import {
    menuCategories,
    menuItems,
    menuItemModifiers,
    modifierGroups,
    modifierOptions,
    recipes,
    recipeIngredients,
    inventoryItems,
    inventoryStock,
    warehouses,
    branches,
} from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';

const P = 'loadtest';
const argCleanupOnly = process.argv.includes('--cleanup-only');

// ---------------------------------------------------------------- data pools
const INV_DEF: { ar: string; en: string; unit: string; cat: string; price: number }[] = [
    { ar: 'دقيق فاخر', en: 'Premium Flour', unit: 'KG', cat: 'بقالة', price: 28 },
    { ar: 'سكر أبيض', en: 'White Sugar', unit: 'KG', cat: 'بقالة', price: 32 },
    { ar: 'أرز بسمتي', en: 'Basmati Rice', unit: 'KG', cat: 'بقالة', price: 85 },
    { ar: 'مكرونة قلم', en: 'Penne Pasta', unit: 'KG', cat: 'بقالة', price: 34 },
    { ar: 'زيت عباد الشمس', en: 'Sunflower Oil', unit: 'LTR', cat: 'زيوت', price: 95 },
    { ar: 'زيت زيتون بكر', en: 'Extra Virgin Olive Oil', unit: 'LTR', cat: 'زيوت', price: 320 },
    { ar: 'سمنة بلدي', en: 'Ghee', unit: 'KG', cat: 'زيوت', price: 280 },
    { ar: 'زبدة طبيعية', en: 'Natural Butter', unit: 'KG', cat: 'ألبان', price: 240 },
    { ar: 'لبن حليب', en: 'Fresh Milk', unit: 'LTR', cat: 'ألبان', price: 32 },
    { ar: 'جبنة موزاريلا', en: 'Mozzarella Cheese', unit: 'KG', cat: 'ألبان', price: 260 },
    { ar: 'جبنة شيدر', en: 'Cheddar Cheese', unit: 'KG', cat: 'ألبان', price: 290 },
    { ar: 'جبنة رومي', en: 'Romy Cheese', unit: 'KG', cat: 'ألبان', price: 310 },
    { ar: 'بيض بلدي', en: 'Baladi Eggs', unit: 'PIECE', cat: 'ألبان', price: 6 },
    { ar: 'صدور دجاج', en: 'Chicken Breast', unit: 'KG', cat: 'لحوم', price: 210 },
    { ar: 'وراك دجاج', en: 'Chicken Thighs', unit: 'KG', cat: 'لحوم', price: 170 },
    { ar: 'دجاجة كاملة', en: 'Whole Chicken', unit: 'KG', cat: 'لحوم', price: 150 },
    { ar: 'لحم بقري مفروم', en: 'Ground Beef', unit: 'KG', cat: 'لحوم', price: 420 },
    { ar: 'لحم بقري مكعبات', en: 'Beef Cubes', unit: 'KG', cat: 'لحوم', price: 450 },
    { ar: 'ستيك لحم', en: 'Beef Steak', unit: 'KG', cat: 'لحوم', price: 520 },
    { ar: 'كبدة بلدي', en: 'Baladi Liver', unit: 'KG', cat: 'لحوم', price: 380 },
    { ar: 'سجق بلدي', en: 'Baladi Sausage', unit: 'KG', cat: 'لحوم', price: 340 },
    { ar: 'سمك بلطي', en: 'Tilapia Fish', unit: 'KG', cat: 'أسماك', price: 120 },
    { ar: 'جمبري مقشر', en: 'Peeled Shrimp', unit: 'KG', cat: 'أسماك', price: 480 },
    { ar: 'فيليه قشر بياض', en: 'Nile Perch Fillet', unit: 'KG', cat: 'أسماك', price: 390 },
    { ar: 'طماطم', en: 'Tomatoes', unit: 'KG', cat: 'خضار', price: 18 },
    { ar: 'بصل', en: 'Onions', unit: 'KG', cat: 'خضار', price: 22 },
    { ar: 'بطاطس', en: 'Potatoes', unit: 'KG', cat: 'خضار', price: 20 },
    { ar: 'جزر', en: 'Carrots', unit: 'KG', cat: 'خضار', price: 24 },
    { ar: 'فلفل ألوان', en: 'Bell Peppers', unit: 'KG', cat: 'خضار', price: 45 },
    { ar: 'خس كابوتشا', en: 'Iceberg Lettuce', unit: 'PIECE', cat: 'خضار', price: 25 },
    { ar: 'خيار', en: 'Cucumber', unit: 'KG', cat: 'خضار', price: 20 },
    { ar: 'ليمون', en: 'Lemon', unit: 'KG', cat: 'خضار', price: 30 },
    { ar: 'ثوم', en: 'Garlic', unit: 'KG', cat: 'خضار', price: 60 },
    { ar: 'بقدونس', en: 'Parsley', unit: 'PACK', cat: 'خضار', price: 5 },
    { ar: 'كزبرة خضراء', en: 'Fresh Coriander', unit: 'PACK', cat: 'خضار', price: 5 },
    { ar: 'شبت', en: 'Dill', unit: 'PACK', cat: 'خضار', price: 5 },
    { ar: 'تفاح أحمر', en: 'Red Apples', unit: 'KG', cat: 'فاكهة', price: 55 },
    { ar: 'برتقال', en: 'Oranges', unit: 'KG', cat: 'فاكهة', price: 25 },
    { ar: 'مانجو', en: 'Mango', unit: 'KG', cat: 'فاكهة', price: 70 },
    { ar: 'فراولة', en: 'Strawberries', unit: 'KG', cat: 'فاكهة', price: 60 },
    { ar: 'موز', en: 'Bananas', unit: 'KG', cat: 'فاكهة', price: 35 },
    { ar: 'ملح طعام', en: 'Table Salt', unit: 'KG', cat: 'توابل', price: 12 },
    { ar: 'فلفل أسود', en: 'Black Pepper', unit: 'GM', cat: 'توابل', price: 0.8 },
    { ar: 'كمون', en: 'Cumin', unit: 'GM', cat: 'توابل', price: 0.9 },
    { ar: 'كزبرة ناشفة', en: 'Ground Coriander', unit: 'GM', cat: 'توابل', price: 0.6 },
    { ar: 'بابريكا', en: 'Paprika', unit: 'GM', cat: 'توابل', price: 1.1 },
    { ar: 'كركم', en: 'Turmeric', unit: 'GM', cat: 'توابل', price: 0.7 },
    { ar: 'بهارات مشكلة', en: 'Mixed Spices', unit: 'GM', cat: 'توابل', price: 1.2 },
    { ar: 'زعتر', en: 'Thyme', unit: 'GM', cat: 'توابل', price: 1.0 },
    { ar: 'روزماري', en: 'Rosemary', unit: 'GM', cat: 'توابل', price: 1.4 },
    { ar: 'صلصة طماطم', en: 'Tomato Paste', unit: 'KG', cat: 'صوصات', price: 65 },
    { ar: 'كاتشب', en: 'Ketchup', unit: 'LTR', cat: 'صوصات', price: 70 },
    { ar: 'مايونيز', en: 'Mayonnaise', unit: 'LTR', cat: 'صوصات', price: 85 },
    { ar: 'مستردة', en: 'Mustard', unit: 'LTR', cat: 'صوصات', price: 75 },
    { ar: 'صويا صوص', en: 'Soy Sauce', unit: 'LTR', cat: 'صوصات', price: 95 },
    { ar: 'باربكيو صوص', en: 'BBQ Sauce', unit: 'LTR', cat: 'صوصات', price: 90 },
    { ar: 'هوت صوص', en: 'Hot Sauce', unit: 'LTR', cat: 'صوصات', price: 80 },
    { ar: 'طحينة', en: 'Tahini', unit: 'KG', cat: 'صوصات', price: 150 },
    { ar: 'دبس رمان', en: 'Pomegranate Molasses', unit: 'LTR', cat: 'صوصات', price: 140 },
    { ar: 'خل أبيض', en: 'White Vinegar', unit: 'LTR', cat: 'صوصات', price: 35 },
    { ar: 'عيش بلدي', en: 'Baladi Bread', unit: 'PIECE', cat: 'مخبوزات', price: 2 },
    { ar: 'عيش فينو', en: 'Fino Bread', unit: 'PIECE', cat: 'مخبوزات', price: 3 },
    { ar: 'توست', en: 'Toast Bread', unit: 'PACK', cat: 'مخبوزات', price: 35 },
    { ar: 'عجينة بيتزا', en: 'Pizza Dough', unit: 'PIECE', cat: 'مخبوزات', price: 18 },
    { ar: 'كرواسون زبدة', en: 'Butter Croissant', unit: 'PIECE', cat: 'مخبوزات', price: 22 },
    { ar: 'بن إسبريسو', en: 'Espresso Beans', unit: 'KG', cat: 'مشروبات', price: 550 },
    { ar: 'شاي خرز', en: 'Loose Tea', unit: 'KG', cat: 'مشروبات', price: 220 },
    { ar: 'قهوة تركي', en: 'Turkish Coffee', unit: 'KG', cat: 'مشروبات', price: 480 },
    { ar: 'كاكاو خام', en: 'Raw Cocoa', unit: 'KG', cat: 'مشروبات', price: 380 },
    { ar: 'عصير برتقال فريش', en: 'Fresh Orange Juice', unit: 'LTR', cat: 'مشروبات', price: 60 },
    { ar: 'مياه معدنية', en: 'Mineral Water', unit: 'PIECE', cat: 'مشروبات', price: 8 },
    { ar: 'مياه غازية', en: 'Sparkling Water', unit: 'PIECE', cat: 'مشروبات', price: 12 },
    { ar: 'كولا', en: 'Cola', unit: 'PIECE', cat: 'مشروبات', price: 15 },
    { ar: 'سكر دايت', en: 'Diet Sugar Sachets', unit: 'PACK', cat: 'بقالة', price: 45 },
    { ar: 'عسل نحل', en: 'Honey', unit: 'KG', cat: 'بقالة', price: 320 },
    { ar: 'مربى فراولة', en: 'Strawberry Jam', unit: 'KG', cat: 'بقالة', price: 120 },
    { ar: 'شوفان', en: 'Oats', unit: 'KG', cat: 'بقالة', price: 90 },
    { ar: 'فول مدمس', en: 'Fava Beans', unit: 'KG', cat: 'بقالة', price: 55 },
    { ar: 'عدس أصفر', en: 'Yellow Lentils', unit: 'KG', cat: 'بقالة', price: 65 },
    { ar: 'فاصوليا بيضاء', en: 'White Beans', unit: 'KG', cat: 'بقالة', price: 70 },
    { ar: 'حمص', en: 'Chickpeas', unit: 'KG', cat: 'بقالة', price: 75 },
    { ar: 'أرز مصري', en: 'Egyptian Rice', unit: 'KG', cat: 'بقالة', price: 45 },
    { ar: 'دجاج بانيه جاهز', en: 'Ready Breaded Chicken', unit: 'KG', cat: 'مجمدات', price: 230 },
    { ar: 'بطاطس نصف مقلية', en: 'Par-fried Potatoes', unit: 'KG', cat: 'مجمدات', price: 85 },
    { ar: 'خضار مشكل مجمد', en: 'Mixed Frozen Vegetables', unit: 'KG', cat: 'مجمدات', price: 70 },
    { ar: 'آيس كريم فانيليا', en: 'Vanilla Ice Cream', unit: 'LTR', cat: 'مجمدات', price: 110 },
    { ar: 'زبدة فول سوداني', en: 'Peanut Butter', unit: 'KG', cat: 'بقالة', price: 180 },
    { ar: 'نوتيلا', en: 'Hazelnut Spread', unit: 'KG', cat: 'بقالة', price: 350 },
    { ar: 'لبن رايب', en: 'Rayeb Milk', unit: 'LTR', cat: 'ألبان', price: 40 },
    { ar: 'قشطة', en: 'Cream', unit: 'KG', cat: 'ألبان', price: 200 },
    { ar: 'زبادي', en: 'Yogurt', unit: 'PIECE', cat: 'ألبان', price: 10 },
    { ar: 'لانشون', en: 'Luncheon Meat', unit: 'KG', cat: 'لحوم', price: 220 },
    { ar: 'بسطرمة', en: 'Basturma', unit: 'KG', cat: 'لحوم', price: 520 },
    { ar: 'تونة معلبة', en: 'Canned Tuna', unit: 'PIECE', cat: 'معلبات', price: 55 },
    { ar: 'ذرة حلوة معلبة', en: 'Canned Sweet Corn', unit: 'PIECE', cat: 'معلبات', price: 40 },
    { ar: 'مشروم معلب', en: 'Canned Mushrooms', unit: 'PIECE', cat: 'معلبات', price: 48 },
    { ar: 'زيتون أسود', en: 'Black Olives', unit: 'KG', cat: 'معلبات', price: 130 },
    { ar: 'مخلل مشكل', en: 'Mixed Pickles', unit: 'KG', cat: 'معلبات', price: 60 },
    { ar: 'خلطة بهارات شاورما', en: 'Shawarma Spice Mix', unit: 'GM', cat: 'توابل', price: 1.3 },
    { ar: 'خلطة بهارات برجر', en: 'Burger Spice Mix', unit: 'GM', cat: 'توابل', price: 1.3 },
];

const MENU_DEF: { ar: string; en: string; cat: number; price: number }[] = [
    { ar: 'كباب مشكل', en: 'Mixed Grill Kebab', cat: 0, price: 320 },
    { ar: 'كفتة مشوية', en: 'Grilled Kofta', cat: 0, price: 240 },
    { ar: 'شيش طاووق', en: 'Shish Tawook', cat: 0, price: 220 },
    { ar: 'ريش ضاني', en: 'Lamb Chops', cat: 0, price: 380 },
    { ar: 'فراخ مشوية', en: 'Grilled Chicken', cat: 0, price: 210 },
    { ar: 'فراخ شيش', en: 'Chicken Shish', cat: 0, price: 200 },
    { ar: 'ميكس جريل عائلي', en: 'Family Mixed Grill', cat: 0, price: 650 },
    { ar: 'كبدة مشوية', en: 'Grilled Liver', cat: 0, price: 190 },
    { ar: 'سجق مشوي', en: 'Grilled Sausage', cat: 0, price: 180 },
    { ar: 'شاورما فراخ', en: 'Chicken Shawarma', cat: 0, price: 130 },
    { ar: 'شاورما لحمة', en: 'Beef Shawarma', cat: 0, price: 150 },
    { ar: 'فتة شاورما', en: 'Shawarma Fatta', cat: 0, price: 170 },
    { ar: 'بيتزا مارجريتا', en: 'Margherita Pizza', cat: 1, price: 140 },
    { ar: 'بيتزا خضار', en: 'Veggie Pizza', cat: 1, price: 155 },
    { ar: 'بيتزا فراخ', en: 'Chicken Pizza', cat: 1, price: 185 },
    { ar: 'بيتزا لحمة', en: 'Beef Pizza', cat: 1, price: 195 },
    { ar: 'بيتزا سي فود', en: 'Seafood Pizza', cat: 1, price: 240 },
    { ar: 'بيتزا باربكيو', en: 'BBQ Pizza', cat: 1, price: 200 },
    { ar: 'كالزوني', en: 'Calzone', cat: 1, price: 175 },
    { ar: 'بيتزا مشروم', en: 'Mushroom Pizza', cat: 1, price: 165 },
    { ar: 'برجر كلاسيك', en: 'Classic Burger', cat: 2, price: 130 },
    { ar: 'تشيز برجر', en: 'Cheese Burger', cat: 2, price: 150 },
    { ar: 'دبل تشيز برجر', en: 'Double Cheese Burger', cat: 2, price: 195 },
    { ar: 'برجر مشروم', en: 'Mushroom Burger', cat: 2, price: 165 },
    { ar: 'برجر باربكيو', en: 'BBQ Burger', cat: 2, price: 170 },
    { ar: 'تشيكن برجر', en: 'Chicken Burger', cat: 2, price: 140 },
    { ar: 'برجر حار', en: 'Spicy Burger', cat: 2, price: 155 },
    { ar: 'برجر دبل', en: 'Double Burger', cat: 2, price: 190 },
    { ar: 'ساندوتش كفتة', en: 'Kofta Sandwich', cat: 2, price: 95 },
    { ar: 'ساندوتش بانيه', en: 'Pane Sandwich', cat: 2, price: 90 },
    { ar: 'كريب فراخ', en: 'Chicken Crepe', cat: 3, price: 120 },
    { ar: 'كريب لحمة', en: 'Beef Crepe', cat: 3, price: 135 },
    { ar: 'كريب ميكس جبن', en: 'Mixed Cheese Crepe', cat: 3, price: 110 },
    { ar: 'كريب نوتيلا', en: 'Nutella Crepe', cat: 3, price: 95 },
    { ar: 'كريب شاورما', en: 'Shawarma Crepe', cat: 3, price: 125 },
    { ar: 'ناتشوز', en: 'Nachos', cat: 3, price: 105 },
    { ar: 'تاكو فراخ', en: 'Chicken Tacos', cat: 3, price: 130 },
    { ar: ' Quesadilla', en: 'Chicken Quesadilla', cat: 3, price: 140 },
    { ar: 'مكرونة نجرسكو', en: 'Negresco Pasta', cat: 4, price: 150 },
    { ar: 'مكرونة بشاميل', en: 'Bechamel Pasta', cat: 4, price: 140 },
    { ar: 'مكرونة ألفريدو', en: 'Alfredo Pasta', cat: 4, price: 160 },
    { ar: 'مكرونة بولونيز', en: 'Bolognese Pasta', cat: 4, price: 155 },
    { ar: 'مكرونة سي فود', en: 'Seafood Pasta', cat: 4, price: 200 },
    { ar: 'لازانيا', en: 'Lasagna', cat: 4, price: 170 },
    { ar: 'مكرونة وايت صوص', en: 'White Sauce Pasta', cat: 4, price: 145 },
    { ar: 'أرز بسمتي سادة', en: 'Plain Basmati Rice', cat: 4, price: 70 },
    { ar: 'أرز بالخلطة', en: 'Mixed Rice', cat: 4, price: 95 },
    { ar: 'طاجن بامية', en: 'Okra Tagine', cat: 5, price: 120 },
    { ar: 'طاجن ملوخية', en: 'Molokhia Tagine', cat: 5, price: 110 },
    { ar: 'محشي مشكل', en: 'Mixed Mahshi', cat: 5, price: 135 },
    { ar: 'فتة لحمة', en: 'Meat Fatta', cat: 5, price: 180 },
    { ar: 'كشري', en: 'Koshary', cat: 5, price: 65 },
    { ar: 'فول بالزبدة', en: 'Fava Beans with Butter', cat: 5, price: 55 },
    { ar: 'طعمية', en: 'Falafel', cat: 5, price: 40 },
    { ar: 'مسقعة', en: 'Moussaka', cat: 5, price: 90 },
    { ar: 'سلطة سيزر', en: 'Caesar Salad', cat: 6, price: 110 },
    { ar: 'سلطة يونانية', en: 'Greek Salad', cat: 6, price: 100 },
    { ar: 'تبولة', en: 'Tabbouleh', cat: 6, price: 85 },
    { ar: 'فتوش', en: 'Fattoush', cat: 6, price: 85 },
    { ar: 'سلطة كول سلو', en: 'Coleslaw', cat: 6, price: 60 },
    { ar: 'شوربة عدس', en: 'Lentil Soup', cat: 6, price: 65 },
    { ar: 'شوربة مشروم', en: 'Mushroom Soup', cat: 6, price: 75 },
    { ar: 'شوربة سي فود', en: 'Seafood Soup', cat: 6, price: 110 },
    { ar: 'بطاطس مقلية', en: 'French Fries', cat: 6, price: 70 },
    { ar: 'موزاتزا ستيكس', en: 'Mozzarella Sticks', cat: 6, price: 95 },
    { ar: 'حلقات بصل', en: 'Onion Rings', cat: 6, price: 80 },
    { ar: 'تشيز كيك', en: 'Cheesecake', cat: 7, price: 110 },
    { ar: 'مولتن كيك', en: 'Molten Cake', cat: 7, price: 120 },
    { ar: 'أم علي', en: 'Om Ali', cat: 7, price: 95 },
    { ar: 'مهلبية', en: 'Mhalabia', cat: 7, price: 60 },
    { ar: 'أرز بلبن', en: 'Rice Pudding', cat: 7, price: 55 },
    { ar: 'وافل نوتيلا', en: 'Nutella Waffle', cat: 7, price: 105 },
    { ar: 'بان كيك', en: 'Pancakes', cat: 7, price: 90 },
    { ar: 'آيس كريم', en: 'Ice Cream Scoops', cat: 7, price: 75 },
    { ar: 'عصير برتقال', en: 'Orange Juice', cat: 7, price: 60 },
    { ar: 'ميلك شيك', en: 'Milkshake', cat: 7, price: 95 },
    { ar: 'سموزي فراولة', en: 'Strawberry Smoothie', cat: 7, price: 85 },
    { ar: 'لاتيه', en: 'Caffe Latte', cat: 7, price: 65 },
    { ar: 'إسبريسو', en: 'Espresso', cat: 7, price: 50 },
    { ar: 'شاي', en: 'Tea', cat: 7, price: 30 },
    { ar: 'قهوة تركي', en: 'Turkish Coffee', cat: 7, price: 45 },
    { ar: 'موهيتو', en: 'Mojito', cat: 7, price: 70 },
    { ar: 'كوكتيل فواكه', en: 'Fruit Cocktail', cat: 7, price: 80 },
    { ar: 'وجبة أطفال', en: 'Kids Meal', cat: 2, price: 110 },
    { ar: 'كومبو برجر + بطاطس', en: 'Burger Combo', cat: 2, price: 175 },
    { ar: 'عرض عائلي بيتزا', en: 'Family Pizza Offer', cat: 1, price: 380 },
    { ar: 'صينية مشويات', en: 'Grill Tray', cat: 0, price: 550 },
    { ar: 'سحور فول وبيض', en: 'Foul and Eggs Suhoor', cat: 5, price: 85 },
    { ar: 'فطار شرقي', en: 'Oriental Breakfast', cat: 5, price: 120 },
    { ar: 'سحلب', en: 'Sahlab', cat: 7, price: 55 },
    { ar: 'كابتشينو', en: 'Cappuccino', cat: 7, price: 60 },
    { ar: 'هوت شوكلت', en: 'Hot Chocolate', cat: 7, price: 65 },
    { ar: 'بانية كرسبي', en: 'Crispy Pane', cat: 2, price: 125 },
    { ar: 'ستربس', en: 'Chicken Strips', cat: 2, price: 135 },
    { ar: 'جمبري مقلي', en: 'Fried Shrimp', cat: 0, price: 260 },
    { ar: 'سمك مشوي', en: 'Grilled Fish', cat: 0, price: 220 },
];

const CATS = [
    { en: 'Grills', ar: 'مشويات' },
    { en: 'Pizza', ar: 'بيتزا' },
    { en: 'Burgers & Sandwiches', ar: 'برجر وساندوتشات' },
    { en: 'Crepes & Mexican', ar: 'كريب ومكسيكي' },
    { en: 'Pasta & Rice', ar: 'مكرونة وأرز' },
    { en: 'Oriental', ar: 'شرقي' },
    { en: 'Appetizers & Salads', ar: 'مقبلات وسلطات' },
    { en: 'Desserts & Drinks', ar: 'حلويات ومشروبات' },
];

const pad3 = (n: number) => String(n).padStart(3, '0');

// ---------------------------------------------------------------- helpers
async function cleanupPrevious() {
    console.log('🧹 Cleaning previous loadtest rows...');
    // FK-safe order, scoped by id prefix only.
    // Covers trial transactions too (auto-production batches/movements created while testing).
    const stmts = [
        `DELETE FROM recipe_ingredients WHERE recipe_id IN (SELECT id FROM recipes WHERE id LIKE '%${P}%')`,
        `DELETE FROM recipe_ingredients WHERE inventory_item_id LIKE '%${P}%'`,
        `DELETE FROM recipe_versions WHERE recipe_id LIKE '%${P}%'`,
        `DELETE FROM production_order_items WHERE inventory_item_id LIKE '%${P}%' OR production_order_id IN (SELECT id FROM production_orders WHERE target_item_id LIKE '%${P}%' OR id LIKE '%${P}%')`,
        `DELETE FROM production_orders WHERE target_item_id LIKE '%${P}%' OR id LIKE '%${P}%'`,
        `DELETE FROM batch_transactions WHERE stock_movement_id IN (SELECT id FROM stock_movements WHERE item_id LIKE '%${P}%') OR batch_id IN (SELECT id FROM inventory_batches WHERE item_id LIKE '%${P}%')`,
        `DELETE FROM stock_movements WHERE item_id LIKE '%${P}%'`,
        `DELETE FROM inventory_batches WHERE item_id LIKE '%${P}%'`,
        `DELETE FROM grn_items WHERE item_id LIKE '%${P}%'`,
        `DELETE FROM purchase_order_items WHERE item_id LIKE '%${P}%'`,
        `DELETE FROM supplier_invoice_items WHERE item_id LIKE '%${P}%'`,
        `DELETE FROM recipes WHERE id LIKE '%${P}%'`,
        `DELETE FROM menu_item_modifiers WHERE menu_item_id LIKE '%${P}%' OR modifier_group_id LIKE '%${P}%'`,
        `DELETE FROM modifier_options WHERE id LIKE '%${P}%' OR group_id LIKE '%${P}%'`,
        `DELETE FROM modifier_groups WHERE id LIKE '%${P}%'`,
        `DELETE FROM order_items WHERE menu_item_id LIKE '%${P}%'`,
        `DELETE FROM menu_items WHERE id LIKE '%${P}%'`,
        `DELETE FROM menu_categories WHERE id LIKE '%${P}%'`,
        `DELETE FROM inventory_stock WHERE item_id LIKE '%${P}%'`,
        `DELETE FROM inventory_items WHERE id LIKE '%${P}%'`,
    ];
    for (const text of stmts) {
        try {
            await pool.query(text);
        } catch (e: any) {
            console.log('  (skip) ' + text.slice(0, 60) + ' -> ' + String(e?.message || e).slice(0, 120));
        }
    }
}

async function ensureWarehouse(): Promise<{ id: string }> {
    const rows = await db.select({ id: warehouses.id }).from(warehouses);
    if (rows.length > 0) return { id: (rows[0] as any).id };
    let branchId: string | null = null;
    try {
        const b = await db.select({ id: branches.id }).from(branches);
        if (b.length > 0) branchId = (b[0] as any).id;
    } catch { /* ignore */ }
    await db.insert(warehouses).values({ id: 'wh-main', name: 'Main Store', nameAr: 'المخزن الرئيسي', branchId: branchId as any, type: 'MAIN', isActive: true } as any);
    console.log('  created wh-main warehouse');
    return { id: 'wh-main' };
}

// ---------------------------------------------------------------- main
async function main() {
    console.log('🚀 Load-test catalog seed (100 stock + 100 sales, BOM, modifiers, sizes, images)');
    await cleanupPrevious();
    if (argCleanupOnly) {
        console.log('✅ Cleanup only done.');
        process.exit(0);
    }

    const wh = await ensureWarehouse();

    // 1) categories
    console.log('📁 Creating 8 categories...');
    for (let i = 0; i < CATS.length; i++) {
        const id = `cat-${P}-${pad3(i + 1)}`;
        await db.insert(menuCategories).values({
            id, name: `[تجربة] ${CATS[i].en}`, nameAr: `[تجربة] ${CATS[i].ar}`,
            sortOrder: (i + 1) * 10, isActive: true, menuIds: ['menu-1'],
            targetOrderTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
        } as any);
    }

    // 2) inventory items (100)
    console.log('📦 Creating 100 inventory items...');
    const invIds: string[] = [];
    for (let i = 0; i < 100; i++) {
        const d = INV_DEF[i % INV_DEF.length];
        const suffix = i >= INV_DEF.length ? ` ${Math.floor(i / INV_DEF.length) + 1}` : '';
        const id = `inv-${P}-${pad3(i + 1)}`;
        invIds.push(id);
        const isComposite = i >= 85; // last 15 are BOM assemblies
        await db.insert(inventoryItems).values({
            id,
            name: `[LT] ${d.en}${suffix}`,
            nameAr: `[تجربة] ${d.ar}${suffix}`,
            sku: `LT-STK-${pad3(i + 1)}`,
            barcode: `LTB${String(100000 + i)}`,
            unit: d.unit,
            category: d.cat,
            threshold: 5 + (i % 10),
            costPrice: d.price,
            purchasePrice: d.price,
            isComposite,
            bom: '[]',
            isActive: true,
        } as any);
        // opening stock
        await db.insert(inventoryStock).values({ itemId: id, warehouseId: wh.id, quantity: 50 + ((i * 7) % 200) } as any);
    }
    // 2b) fill BOM for composite items (each from 2-4 earlier raw items)
    console.log('🧬 Wiring BOM for 15 composite stock items...');
    for (let i = 85; i < 100; i++) {
        const comps = [invIds[i - 85], invIds[i - 80], invIds[(i - 70) % 85]].filter(Boolean).slice(0, 3);
        // Both keys: UI modal reads `itemId`, backend service reads `inventoryItemId || itemId`
        const bom = comps.map((cid, k) => ({ itemId: cid, inventoryItemId: cid, quantity: 0.2 + ((i + k) % 5) * 0.25, unit: 'KG' }));
        // NOTE: inventory_items.bom is plain nvarchar -> must store JSON string (see inventoryController.serializeBom)
        await db.update(inventoryItems).set({ bom: JSON.stringify(bom) as any } as any).where(eq(inventoryItems.id, invIds[i]));
    }

    // 3) shared modifier groups (extras) — also embedded inline per item below
    console.log('🧩 Creating 6 modifier groups...');
    const GROUPS = [
        { id: `mod-${P}-g1`, en: 'Extras', ar: 'إضافات', opts: [['Extra Cheese', 'جبنة زيادة', 20], ['Extra Chicken', 'فراخ زيادة', 30], ['Extra Sauce', 'صوص زيادة', 10], ['Mushroom', 'مشروم', 15]] },
        { id: `mod-${P}-g2`, en: 'Size Up', ar: 'تكبير الحجم', opts: [['Large Size', 'حجم كبير', 25], ['Family Size', 'حجم عائلي', 60]] },
        { id: `mod-${P}-g3`, en: 'Sauces', ar: 'صوصات', opts: [['BBQ', 'باربكيو', 8], ['Ranch', 'رانش', 8], ['Spicy Mayo', 'سبايسي مايونيز', 10], ['Garlic', 'ثومية', 5]] },
        { id: `mod-${P}-g4`, en: 'Drinks Add', ar: 'إضافة مشروب', opts: [['Cola', 'كولا', 20], ['Fresh Juice', 'عصير فريش', 30], ['Water', 'مياه', 8]] },
        { id: `mod-${P}-g5`, en: 'Dessert Add', ar: 'إضافة حلو', opts: [['Molten', 'مولتن', 45], ['Ice Cream', 'آيس كريم', 30]] },
        { id: `mod-${P}-g6`, en: 'No / Less', ar: 'بدون / تقليل', opts: [['No Onion', 'بدون بصل', 0], ['No Spicy', 'بدون حار', 0], ['Less Salt', 'ملح قليل', 0]] },
    ] as const;
    for (const g of GROUPS) {
        await db.insert(modifierGroups).values({ id: g.id, name: `[LT] ${g.en}`, nameAr: `[تجربة] ${g.ar}`, minSelection: 0, maxSelection: 3, isRequired: false } as any);
        let s = 0;
        for (const [en, ar, price] of g.opts) {
            s++;
            await db.insert(modifierOptions).values({ id: `${g.id}-o${s}`, groupId: g.id, name: en, nameAr: ar, price, sortOrder: s, isAvailable: true } as any);
        }
    }

    // 4) menu items (100)
    console.log('🍽️ Creating 100 sales items (plain/sizes/modifiers/full+images)...');
    const inlineGroupsFor = (idx: number) => {
        // deterministic 1-2 groups per item
        const pick = [GROUPS[idx % GROUPS.length], GROUPS[(idx + 2) % GROUPS.length]];
        return pick.map((g) => ({
            id: g.id, name: g.en, nameAr: g.ar, minSelection: 0, maxSelection: 3,
            options: (g.opts as readonly (string | number)[][]).map((o, k) => ({ id: `${g.id}-o${k + 1}`, name: o[0], nameAr: o[1], price: o[2] })),
        }));
    };
    const sizesFor = (price: number) => ([
        { id: `size-s`, name: 'Regular', nameAr: 'عادي', price, isAvailable: true },
        { id: `size-m`, name: 'Large', nameAr: 'كبير', price: price + 30, isAvailable: true },
        { id: `size-l`, name: 'Family', nameAr: 'عائلي', price: price + 80, isAvailable: true },
    ]);

    for (let i = 0; i < 100; i++) {
        const d = MENU_DEF[i % MENU_DEF.length];
        const suffix = i >= MENU_DEF.length ? ` ${Math.floor(i / MENU_DEF.length) + 1}` : '';
        const id = `item-${P}-${pad3(i + 1)}`;
        const catId = `cat-${P}-${pad3(d.cat + 1)}`;
        const kind = i < 30 ? 'plain' : i < 55 ? 'sizes' : i < 80 ? 'modifiers' : 'full';
        const withImage = kind === 'full' || (kind === 'plain' && i % 3 === 0) || i % 10 === 7;
        const sizes = kind === 'sizes' || kind === 'full' ? sizesFor(d.price) : [];
        const mods = kind === 'modifiers' || kind === 'full' ? inlineGroupsFor(i) : [];
        await db.insert(menuItems).values({
            id, categoryId: catId,
            name: `[LT] ${d.en}${suffix}`,
            nameAr: `[تجربة] ${d.ar}${suffix}`,
            description: `Load test item ${i + 1} (${kind})`,
            descriptionAr: `صنف تجربة رقم ${i + 1} (${kind === 'plain' ? 'عادي' : kind === 'sizes' ? 'اختيارات' : kind === 'modifiers' ? 'إضافات' : 'كامل'})`,
            price: d.price, cost: Math.round(d.price * 0.4),
            image: withImage ? `https://picsum.photos/seed/restoflow-${P}-${i + 1}/600/400` : null,
            status: 'published', isAvailable: true,
            preparationTime: 10 + (i % 20),
            isPopular: i % 9 === 0, isFeatured: kind === 'full' && i % 2 === 0,
            sortOrder: i + 1,
            sku: `LT-S-${pad3(i + 1)}`, barcode: `LTS${String(200000 + i)}`,
            sizes, modifierGroups: mods,
        } as any);
        // link shared groups via join table for modifier-kind items (tests both paths)
        if (kind === 'modifiers' || kind === 'full') {
            const g = GROUPS[i % GROUPS.length];
            await db.insert(menuItemModifiers).values({ menuItemId: id, modifierGroupId: g.id, sortOrder: 0 } as any);
        }
    }

    // 5) recipes: base recipe for items 31..100 (70 recipes), each 2-4 stock ingredients
    console.log('📖 Creating ~70 recipes...');
    let recipeCount = 0;
    for (let i = 30; i < 100; i++) {
        const itemId = `item-${P}-${pad3(i + 1)}`;
        const recipeId = `recipe-${P}-${pad3(i + 1)}`;
        await db.insert(recipes).values({ id: recipeId, menuItemId: itemId, yield: 1, instructions: 'Load test recipe', version: 1 } as any);
        recipeCount++;
        const nIng = 2 + (i % 3); // 2-4
        for (let k = 0; k < nIng; k++) {
            const invId = invIds[(i * 3 + k * 11) % 85]; // only raw (non-composite) ingredients
            await db.insert(recipeIngredients).values({
                recipeId, inventoryItemId: invId,
                quantity: 0.05 + ((i + k) % 8) * 0.05,
                unit: 'KG', notes: 'loadtest',
                lastKnownCost: 10, lastCostUpdate: new Date(),
            } as any);
        }
        // Link composite stock items into 2 recipes so POS sales trigger AUTO-PRODUCTION:
        // LT-S-035 (كريب شاورما) consumes خلطة شاورما, LT-S-089 (فطار شرقي) consumes بسطرمة
        const compositeLinks: Record<number, { inv: string; qty: number; unit: string }> = {
            34: { inv: invIds[98], qty: 0.05, unit: 'KG' },  // خلطة بهارات شاورما
            88: { inv: invIds[92], qty: 0.15, unit: 'KG' },  // بسطرمة
        };
        const link = compositeLinks[i];
        if (link) {
            await db.insert(recipeIngredients).values({
                recipeId, inventoryItemId: link.inv,
                quantity: link.qty, unit: link.unit, notes: 'loadtest-auto-production',
                lastKnownCost: 10, lastCostUpdate: new Date(),
            } as any);
        }
        // one size-specific recipe for full-kind items (tests size BOM path)
        if (i >= 80 && i % 2 === 0) {
            const sizeRecipeId = `recipe-${P}-${pad3(i + 1)}-large`;
            await db.insert(recipes).values({ id: sizeRecipeId, menuItemId: itemId, sizeId: 'size-m', yield: 1, instructions: 'Large size recipe', version: 1 } as any);
            recipeCount++;
            const invId = invIds[(i * 5) % 85];
            await db.insert(recipeIngredients).values({ recipeId: sizeRecipeId, inventoryItemId: invId, quantity: 0.3, unit: 'KG', lastKnownCost: 10, lastCostUpdate: new Date() } as any);
        }
    }

    // 6) verify
    const countOf = async (text: string) => (await pool.query(text)).rows?.[0]?.n ?? 0;
    const invN = await countOf(`SELECT COUNT(*) AS n FROM inventory_items WHERE id LIKE '%${P}%'`);
    const menuN = await countOf(`SELECT COUNT(*) AS n FROM menu_items WHERE id LIKE '%${P}%'`);
    const compN = await countOf(`SELECT COUNT(*) AS n FROM inventory_items WHERE id LIKE '%${P}%' AND is_composite = 1`);
    const imgN = await countOf(`SELECT COUNT(*) AS n FROM menu_items WHERE id LIKE '%${P}%' AND image IS NOT NULL`);
    const recN = await countOf(`SELECT COUNT(*) AS n FROM recipes WHERE id LIKE '%${P}%'`);
    console.log('──────────────────────────────────');
    console.log(`✅ stock items:    ${invN} (target 100, composite ${compN} target 15)`);
    console.log(`✅ sales items:    ${menuN} (target 100, with images ${imgN} target ~30)`);
    console.log(`✅ recipes:        ${recN} (target ~80 incl. size variants, created ${recipeCount})`);
    console.log('Test in POS/Menu/Inventory — all names carry [تجربة] / [LT] prefix.');
    console.log('To remove: npx tsx scripts/seed-load-test-catalog.ts --cleanup-only');
    process.exit(0);
}

main().catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); });
