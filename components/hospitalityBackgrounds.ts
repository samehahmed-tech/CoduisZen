export type HospitalityBackground = {
    id: string;
    type: 'image' | 'video';
    src: string;
    poster?: string;
    name: string;
    nameAr: string;
    mood: string;
    moodAr: string;
};

const image = (id: string, file: string, name: string, nameAr: string, mood: string, moodAr: string): HospitalityBackground => ({
    id, type: 'image', src: `/wallpapers/hospitality/${file}`, name, nameAr, mood, moodAr,
});

const video = (id: string, file: string, poster: string, name: string, nameAr: string, mood: string, moodAr: string): HospitalityBackground => ({
    id, type: 'video', src: `/wallpapers/hospitality/${file}`, poster: `/wallpapers/hospitality/${poster}`, name, nameAr, mood, moodAr,
});

export const HOSPITALITY_BACKGROUNDS: HospitalityBackground[] = [
    image('cafe-rustic', 'hospitality-01-cafe-rustic.jpg', 'Rustic Café', 'كافيه ريفي', 'Warm welcome', 'دفء وترحاب'),
    image('cafe-modern', 'hospitality-02-cafe-modern.jpg', 'Modern Café', 'كافيه عصري', 'Clean rhythm', 'إيقاع عصري'),
    image('coffee-shop', 'hospitality-03-coffee-shop.jpg', 'Coffee House', 'بيت القهوة', 'Daily craft', 'حرفة يومية'),
    image('cafe-soft-light', 'hospitality-04-cafe-soft-light.jpg', 'Soft Light', 'إضاءة هادئة', 'Quiet service', 'خدمة هادئة'),
    image('cafe-window', 'hospitality-05-cafe-window.jpg', 'Window Seat', 'جلسة الشباك', 'Open morning', 'صباح مفتوح'),
    image('restaurant-evening', 'hospitality-06-restaurant-evening.jpg', 'Evening Table', 'طاولة المساء', 'After-hours dining', 'ضيافة المساء'),
    image('restaurant-table', 'hospitality-07-restaurant-table.jpg', 'Set Table', 'طاولة جاهزة', 'Ready to serve', 'جاهزة للتقديم'),
    image('restaurant-daylight', 'hospitality-08-restaurant-daylight.jpg', 'Daylight Dining', 'غداء في النور', 'Bright service', 'خدمة مشرقة'),
    image('cafe-table', 'hospitality-09-cafe-table.jpg', 'Table Story', 'حكاية الطاولة', 'Simple moments', 'لحظات بسيطة'),
    image('coffee-pastry', 'hospitality-10-coffee-pastry.jpg', 'Coffee & Pastry', 'قهوة ومعجنات', 'Fresh start', 'بداية طازجة'),
    image('bakery-warm', 'hospitality-11-bakery-warm.jpg', 'Warm Bakery', 'مخبز دافئ', 'Fresh from oven', 'طازج من الفرن'),
    image('cafe-greenery', 'hospitality-12-cafe-greenery.jpg', 'Green Corner', 'ركن أخضر', 'Natural pause', 'استراحة طبيعية'),
    image('window-table', 'hospitality-13-window-table.jpg', 'Morning Window', 'شباك الصباح', 'Calm focus', 'تركيز هادئ'),
    image('bakery-window', 'hospitality-14-bakery-window.jpg', 'Bakery Window', 'واجهة المخبز', 'Open kitchen', 'مطبخ مفتوح'),
    video('notebook-cafe', 'hospitality-15-notebook-cafe.mp4', 'hospitality-10-coffee-pastry.jpg', 'Notebook Café', 'مقهى الملاحظات', 'Slow thinking', 'تفكير هادئ'),
    video('cafe-gathering', 'hospitality-16-cafe-gathering.mp4', 'hospitality-01-cafe-rustic.jpg', 'Café Gathering', 'جلسة كافيه', 'Human rhythm', 'إيقاع إنساني'),
    video('studying-cafe', 'hospitality-17-studying-cafe.mp4', 'hospitality-12-cafe-greenery.jpg', 'Study Corner', 'ركن المذاكرة', 'Focused flow', 'تدفق التركيز'),
    video('coffee-conversation', 'hospitality-18-coffee-conversation.mp4', 'hospitality-05-cafe-window.jpg', 'Coffee Conversation', 'حديث القهوة', 'Easy connection', 'تواصل بسيط'),
    video('barista-counter', 'hospitality-19-barista-counter.mp4', 'hospitality-02-cafe-modern.jpg', 'Counter Service', 'خدمة الكاونتر', 'Fast hospitality', 'ضيافة سريعة'),
    video('latte-pour', 'hospitality-20-latte-pour.mp4', 'hospitality-10-coffee-pastry.jpg', 'Latte Pour', 'صب اللاتيه', 'Craft in motion', 'حرفة متحركة'),
];
