/**
 * Synthetic TEST ONLY Stage 1 Fixtures
 * All cook locations, profiles, accounts, and dishes are strictly synthetic test fixtures.
 */

export const SYNTHETIC_TEST_USERS = [
  {
    id: 'user-cust-test-1',
    role: 'CUSTOMER',
    displayName: 'Nima Tehrani (TEST ONLY)',
    phonePrivate: '+1-416-555-0101',
    emailPrivate: 'nima.customer.test@sofreh.invalid',
    preferredLocale: 'en-CA',
    authToken: 'test-token-customer-nima'
  },
  {
    id: 'user-cust-test-2',
    role: 'CUSTOMER',
    displayName: 'Sara Shirazi (TEST ONLY)',
    phonePrivate: '+1-416-555-0102',
    emailPrivate: 'sara.customer.test@sofreh.invalid',
    preferredLocale: 'fa-IR',
    authToken: 'test-token-customer-sara'
  },
  {
    id: 'user-cook-test-1',
    role: 'COOK',
    displayName: 'Maman Pari Kitchen (TEST ONLY)',
    phonePrivate: '+1-416-555-0201',
    emailPrivate: 'pari.cook.test@sofreh.invalid',
    preferredLocale: 'fa-IR',
    authToken: 'test-token-cook-pari'
  },
  {
    id: 'user-cook-test-2',
    role: 'COOK',
    displayName: 'Chef Kambiz Northern Grill (TEST ONLY)',
    phonePrivate: '+1-416-555-0202',
    emailPrivate: 'kambiz.cook.test@sofreh.invalid',
    preferredLocale: 'en-CA',
    authToken: 'test-token-cook-kambiz'
  },
  {
    id: 'user-cook-test-3',
    role: 'COOK',
    displayName: 'Khanoom Golnar Stew House (TEST ONLY)',
    phonePrivate: '+1-416-555-0203',
    emailPrivate: 'golnar.cook.test@sofreh.invalid',
    preferredLocale: 'fa-IR',
    authToken: 'test-token-cook-golnar'
  }
];

function buildDishFoodPhotoDataUri({ bg1, bg2, plate, accent, label, icon }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="100%" stop-color="${bg2}"/>
      </linearGradient>
    </defs>
    <rect width="160" height="120" rx="16" fill="url(#g)"/>
    <circle cx="80" cy="54" r="36" fill="${plate}" stroke="${accent}" stroke-width="3"/>
    <circle cx="80" cy="54" r="26" fill="${accent}" fill-opacity="0.22"/>
    <text x="80" y="63" text-anchor="middle" font-size="28">${icon}</text>
    <rect x="14" y="94" width="132" height="18" rx="9" fill="rgba(20,36,27,0.76)"/>
    <text x="80" y="106" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="10" font-weight="700">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const SYNTHETIC_TEST_COOKS = [
  {
    id: 'cook-test-pari',
    userId: 'user-cook-test-1',
    kitchenNameEn: 'Maman Pari Saffron Kitchen [TEST ONLY]',
    kitchenNameFa: 'آشپزخانه زعفرانی مامان پری [فقط آزمایشی - TEST ONLY]',
    bioEn: 'SYNTHETIC TEST FIXTURE — Slow-simmered traditional Tehran-style stews and crispy tahdig.',
    bioFa: 'داده آزمایشی مصنوعی (TEST ONLY) — خورشت‌های جاافتاده سنتی تهرانی با ته‌دیگ زعفرانی.',
    neighborhood: 'North York • Yonge & Finch',
    publicLat: 43.7798,
    publicLng: -79.4152,
    exactPickupAddressPrivate: 'UNIT-PRIVATE-101, 5480 Yonge St, North York, ON (TEST ONLY)',
    publicAddressVisibility: 'AREA_ONLY',
    pickupAddressConsent: true,
    pickupWindowEn: 'Pickup Today 4:00 PM – 8:30 PM',
    pickupWindowFa: 'تحویل حضوری امروز ۱۶:۰۰ تا ۲۰:۳۰',
    deliveryFeeCents: 450, // CA$4.50 cook-set delivery fee
    supportsPickup: true,
    supportsDelivery: true,
    deliveryRadiusKm: 6.5,
    isSyntheticTestFixture: true,
    syntheticBadgeLabel: 'TEST ONLY'
  },
  {
    id: 'cook-test-kambiz',
    userId: 'user-cook-test-2',
    kitchenNameEn: 'Chef Kambiz Gilaki Table [TEST ONLY]',
    kitchenNameFa: 'سفره گیلکی سرآشپز کامبیز [فقط آزمایشی - TEST ONLY]',
    bioEn: 'SYNTHETIC TEST FIXTURE — Northern Caspian herbs, pomegranate walnut stew, and smoked rice.',
    bioFa: 'داده آزمایشی مصنوعی (TEST ONLY) — غذاهای محلی گیلان با رب انار، گردو و برنج دودی.',
    neighborhood: 'Willowdale • Sheppard Centre',
    publicLat: 43.7615,
    publicLng: -79.4111,
    exactPickupAddressPrivate: 'UNIT-PRIVATE-202, 4841 Yonge St, North York, ON (TEST ONLY)',
    publicAddressVisibility: 'PUBLIC_EXACT',
    pickupAddressConsent: true,
    pickupWindowEn: 'Pickup Today 5:00 PM – 9:00 PM',
    pickupWindowFa: 'تحویل حضوری امروز ۱۷:۰۰ تا ۲۱:۰۰',
    deliveryFeeCents: 600, // CA$6.00 cook-set delivery fee
    supportsPickup: true,
    supportsDelivery: true,
    deliveryRadiusKm: 8.0,
    isSyntheticTestFixture: true,
    syntheticBadgeLabel: 'TEST ONLY'
  },
  {
    id: 'cook-test-golnar',
    userId: 'user-cook-test-3',
    kitchenNameEn: 'Golnar Shiraz HomePot [TEST ONLY]',
    kitchenNameFa: 'دیگچه خانگی گلنار شیراز [فقط آزمایشی - TEST ONLY]',
    bioEn: 'SYNTHETIC TEST FIXTURE — Authentic Kalam Polo Shirazi and saffron jeweled rice.',
    bioFa: 'داده آزمایشی مصنوعی (TEST ONLY) — کلم‌پلو شیرازی اصیل و مرصع‌پلو زعفرانی.',
    neighborhood: 'Thornhill • Yonge & Steeles',
    publicLat: 43.7984,
    publicLng: -79.4205,
    exactPickupAddressPrivate: 'PUBLIC-PICKUP-303, 7089 Yonge St, Thornhill, ON (TEST ONLY)',
    publicAddressVisibility: 'PUBLIC_EXACT',
    pickupAddressConsent: true,
    pickupWindowEn: 'Pickup Today 4:30 PM – 8:00 PM',
    pickupWindowFa: 'تحویل حضوری امروز ۱۶:۳۰ تا ۲۰:۰۰',
    deliveryFeeCents: 350, // CA$3.50 cook-set delivery fee
    supportsPickup: true,
    supportsDelivery: false,
    deliveryRadiusKm: 0,
    isSyntheticTestFixture: true,
    syntheticBadgeLabel: 'TEST ONLY'
  }
];

export const SYNTHETIC_TEST_DISHES = [
  { id: 'dish-test-bread-6', cookId: 'cook-test-pari', titleEn: 'Barbari Bread with Sesame (TEST ONLY)', titleFa: '????? ????? ?? ????? (TEST ONLY)', descriptionEn: 'Warm synthetic flatbread for the demo menu.', descriptionFa: '????? ?????? ?????? ???????.', priceCents: 450, totalPortions: 12, remainingPortions: 12, serviceWindowStartIso: '2026-10-31T16:00:00-04:00', serviceWindowEndIso: '2026-10-31T20:30:00-04:00', allergens: ['gluten'], isActive: true, availabilityMode: 'TODAY_AVAILABLE', scheduleNoteEn: 'Demo bread batch ready today', scheduleNoteFa: '????? ??????? ?????? ?????', photoUrl: buildDishFoodPhotoDataUri({ bg1: '#92400e', bg2: '#d97706', plate: '#fffbeb', accent: '#f59e0b', label: 'Barbari Bread', icon: 'BR' }) },
  { id: 'dish-test-pickles-7', cookId: 'cook-test-pari', titleEn: 'House Pickles Sampler (TEST ONLY)', titleFa: '????? ????? ?????? (TEST ONLY)', descriptionEn: 'Synthetic Persian pickle sample for the demo order.', descriptionFa: '????? ??????? ?????? ???????.', priceCents: 550, totalPortions: 10, remainingPortions: 10, serviceWindowStartIso: '2026-10-31T16:00:00-04:00', serviceWindowEndIso: '2026-10-31T20:30:00-04:00', allergens: [], isActive: true, availabilityMode: 'TODAY_AVAILABLE', scheduleNoteEn: 'Demo pickle sampler ready today', scheduleNoteFa: '????? ??????? ?????? ?????', photoUrl: buildDishFoodPhotoDataUri({ bg1: '#14532d', bg2: '#65a30d', plate: '#f7fee7', accent: '#84cc16', label: 'Pickles', icon: 'PK' }) },
  { id: 'dish-test-soda-8', cookId: 'cook-test-pari', titleEn: 'Persian Soda Lime (TEST ONLY)', titleFa: '??????? ?????? ?????? (TEST ONLY)', descriptionEn: 'Synthetic chilled soda add-on for the demo menu.', descriptionFa: '??????? ?????? ?????? ???????.', priceCents: 300, totalPortions: 16, remainingPortions: 16, serviceWindowStartIso: '2026-10-31T16:00:00-04:00', serviceWindowEndIso: '2026-10-31T20:30:00-04:00', allergens: [], isActive: true, availabilityMode: 'TODAY_AVAILABLE', scheduleNoteEn: 'Demo soda available today', scheduleNoteFa: '??????? ??????? ?????? ?????', photoUrl: buildDishFoodPhotoDataUri({ bg1: '#075985', bg2: '#0ea5e9', plate: '#e0f2fe', accent: '#38bdf8', label: 'Persian Soda', icon: 'SD' }) },
  { id: 'dish-test-yogurt-9', cookId: 'cook-test-pari', titleEn: 'Mast Yogurt with Mint (TEST ONLY)', titleFa: '????? ?? ????? (TEST ONLY)', descriptionEn: 'Synthetic yogurt side with dried mint for the sample order.', descriptionFa: '????? ?????? ?????? ???????.', priceCents: 400, totalPortions: 12, remainingPortions: 12, serviceWindowStartIso: '2026-10-31T16:00:00-04:00', serviceWindowEndIso: '2026-10-31T20:30:00-04:00', allergens: ['dairy'], isActive: true, availabilityMode: 'TODAY_AVAILABLE', scheduleNoteEn: 'Demo yogurt side available today', scheduleNoteFa: '????? ??????? ?????? ?????', photoUrl: buildDishFoodPhotoDataUri({ bg1: '#1e3a8a', bg2: '#60a5fa', plate: '#eff6ff', accent: '#93c5fd', label: 'Mast Yogurt', icon: 'YG' }) },
  {
    id: 'dish-test-ghormeh-1',
    cookId: 'cook-test-pari',
    titleEn: 'Ghormeh Sabzi with Saffron Tahdig (TEST ONLY)',
    titleFa: 'قورمه‌سبزی جاافتاده با ته‌دیگ زعفرانی (TEST ONLY)',
    descriptionEn: 'Fragrant seven-herb stew with dried Persian limes, red kidney beans, and braised beef.',
    descriptionFa: 'خورشت سبزی معطر با لیمو عمانی، لوبیا قرمز و گوشت گوساله به همراه چلوی زعفرانی.',
    priceCents: 1850,
    totalPortions: 12,
    remainingPortions: 8,
    serviceWindowStartIso: '2026-10-31T16:00:00-04:00',
    serviceWindowEndIso: '2026-10-31T20:30:00-04:00',
    allergens: [],
    isActive: true,
    availabilityMode: 'TODAY_AVAILABLE',
    scheduleNoteEn: 'Fresh batch ready today 4:00 PM – 8:30 PM',
    scheduleNoteFa: 'پخت تازه امروز ۱۶:۰۰ تا ۲۰:۳۰',
    photoUrl: buildDishFoodPhotoDataUri({
      bg1: '#1b4332',
      bg2: '#2d6a4f',
      plate: '#fefae0',
      accent: '#d97706',
      label: 'Ghormeh Sabzi',
      icon: '🍲'
    })
  },
  {
    id: 'dish-test-zereshk-2',
    cookId: 'cook-test-pari',
    titleEn: 'Zereshk Polo ba Morgh (TEST ONLY)',
    titleFa: 'زرشک‌پلو با مرغ مجلسی (TEST ONLY)',
    descriptionEn: 'Saffron braised chicken leg quarters served with ruby barberry rice and pistachio slivers.',
    descriptionFa: 'مرغ زعفرانی مجلسی با برنج ایرانی، زرشک پلویی و خلال پسته و بادام.',
    priceCents: 1750,
    totalPortions: 10,
    remainingPortions: 5,
    serviceWindowStartIso: '2026-10-31T16:00:00-04:00',
    serviceWindowEndIso: '2026-10-31T20:30:00-04:00',
    allergens: ['tree-nuts'],
    isActive: true,
    availabilityMode: 'TODAY_AVAILABLE',
    scheduleNoteEn: 'Fresh batch ready today 4:00 PM – 8:30 PM',
    scheduleNoteFa: 'پخت تازه امروز ۱۶:۰۰ تا ۲۰:۳۰',
    photoUrl: buildDishFoodPhotoDataUri({
      bg1: '#7f1d1d',
      bg2: '#b45309',
      plate: '#fffbeb',
      accent: '#dc2626',
      label: 'Zereshk Polo',
      icon: '🍗'
    })
  },
  {
    id: 'dish-test-fesenjan-3',
    cookId: 'cook-test-kambiz',
    titleEn: 'Khoresht Fesenjan — Walnut Pomegranate Stew (TEST ONLY)',
    titleFa: 'خورشت فسنجان گردویی شمال (TEST ONLY)',
    descriptionEn: 'Rich toasted walnut and tart pomegranate molasses stew served with smoked Caspian rice.',
    descriptionFa: 'خورشت فسنجان با گردوی تازه آسیاب‌شده و رب انار ترش و ملس همراه با کته دودی.',
    priceCents: 2100,
    totalPortions: 8,
    remainingPortions: 6,
    serviceWindowStartIso: '2026-10-31T17:00:00-04:00',
    serviceWindowEndIso: '2026-10-31T21:00:00-04:00',
    allergens: ['walnuts', 'tree-nuts'],
    isActive: true,
    availabilityMode: 'TODAY_AVAILABLE',
    scheduleNoteEn: 'Fresh batch ready today 5:00 PM – 9:00 PM',
    scheduleNoteFa: 'پخت تازه امروز ۱۷:۰۰ تا ۲۱:۰۰',
    photoUrl: buildDishFoodPhotoDataUri({
      bg1: '#432818',
      bg2: '#6f1d1b',
      plate: '#fdf8f5',
      accent: '#99582a',
      label: 'Fesenjan',
      icon: '🥘'
    })
  },
  {
    id: 'dish-test-mirza-4',
    cookId: 'cook-test-kambiz',
    titleEn: 'Mirza Ghasemi Charcoal Eggplant (TEST ONLY)',
    titleFa: 'میرزاقاسمی بادمجان کبابی (TEST ONLY)',
    descriptionEn: 'Smoky fire-roasted eggplant mashed with garlic, tomatoes, turmeric, and farm eggs.',
    descriptionFa: 'بادمجان کبابی دودی با سیر تازه، گوجه‌فرنگی و تخم‌مرغ محلی.',
    priceCents: 1450,
    totalPortions: 10,
    remainingPortions: 9,
    serviceWindowStartIso: '2026-10-31T17:00:00-04:00',
    serviceWindowEndIso: '2026-10-31T21:00:00-04:00',
    allergens: ['eggs'],
    isActive: true,
    availabilityMode: 'TODAY_AVAILABLE',
    scheduleNoteEn: 'Fresh batch ready today 5:00 PM – 9:00 PM',
    scheduleNoteFa: 'پخت تازه امروز ۱۷:۰۰ تا ۲۱:۰۰',
    photoUrl: buildDishFoodPhotoDataUri({
      bg1: '#3b1f2b',
      bg2: '#8b2635',
      plate: '#fffdf7',
      accent: '#e07a5f',
      label: 'Mirza Ghasemi',
      icon: '🍆'
    })
  },
  {
    id: 'dish-test-kalam-5',
    cookId: 'cook-test-golnar',
    titleEn: 'Kalam Polo Shirazi with Mini Kofteh (TEST ONLY)',
    titleFa: 'کلم‌پلو شیرازی با کوفته‌ریزه (TEST ONLY)',
    descriptionEn: 'Herbed cabbage rice layered with saffron, tarragon, basil, and seasoned beef meatballs.',
    descriptionFa: 'پلو مخلوط با کلم قمری، سبزیجات معطر شیرازی و کوفته‌ریزه گوشت.',
    priceCents: 1800,
    totalPortions: 6,
    remainingPortions: 4,
    serviceWindowStartIso: '2026-10-31T16:30:00-04:00',
    serviceWindowEndIso: '2026-10-31T20:00:00-04:00',
    allergens: [],
    isActive: true,
    availabilityMode: 'TODAY_AVAILABLE',
    scheduleNoteEn: 'Fresh batch ready today 4:30 PM – 8:00 PM',
    scheduleNoteFa: 'پخت تازه امروز ۱۶:۳۰ تا ۲۰:۰۰',
    photoUrl: buildDishFoodPhotoDataUri({
      bg1: '#2d4a3e',
      bg2: '#52796f',
      plate: '#f8f9fa',
      accent: '#eab308',
      label: 'Kalam Polo',
      icon: '🍚'
    })
  },
  {
    id: 'dish-test-tahchin-reg-1',
    cookId: 'cook-test-pari',
    titleEn: 'Saffron Chicken Tahchin Cake (Regular Menu — Unavailable Today)',
    titleFa: 'تهچین مرغ و بادمجان زعفرانی (منوی ثابت — امروز ناموجود)',
    descriptionEn: 'Crispy baked saffron yogurt rice cake layered withpulled chicken and barberries.',
    descriptionFa: 'تهچین قالبی زعفرانی با ماست چکیده، مرغ ریش‌ریش و زرشک (پخت روزهای جمعه).',
    priceCents: 1950,
    totalPortions: 8,
    remainingPortions: 0,
    serviceWindowStartIso: '2026-11-06T16:00:00-04:00',
    serviceWindowEndIso: '2026-11-06T20:30:00-04:00',
    allergens: ['dairy', 'eggs'],
    isActive: true,
    availabilityMode: 'REGULAR_UNAVAILABLE',
    scheduleNoteEn: 'Regular menu item • Cooked Fridays & Saturdays (Unavailable today)',
    scheduleNoteFa: 'از منوی ثابت آشپز • پخت در روزهای جمعه و شنبه (امروز پخت نمی‌شود)',
    photoUrl: buildDishFoodPhotoDataUri({
      bg1: '#78350f',
      bg2: '#b45309',
      plate: '#fef3c7',
      accent: '#f59e0b',
      label: 'Tahchin (Fri)',
      icon: '🥧'
    })
  },
  {
    id: 'dish-test-baghali-reg-2',
    cookId: 'cook-test-kambiz',
    titleEn: 'Baghali Polo ba Mahicheh (Regular Menu — Unavailable Today)',
    titleFa: 'باقالی‌پلو با ماهیچه گوسفندی (منوی ثابت — امروز ناموجود)',
    descriptionEn: 'Dill and fava bean saffron rice with 5-hour braised lamb shank.',
    descriptionFa: 'چلو شوید و باقالی تازه با ماهیچه گوسفندی زعفرانی (ویژه آخر هفته).',
    priceCents: 2600,
    totalPortions: 6,
    remainingPortions: 0,
    serviceWindowStartIso: '2026-11-07T17:00:00-04:00',
    serviceWindowEndIso: '2026-11-07T21:00:00-04:00',
    allergens: [],
    isActive: true,
    availabilityMode: 'REGULAR_UNAVAILABLE',
    scheduleNoteEn: 'Regular menu item • Weekend specialty (Unavailable today)',
    scheduleNoteFa: 'از منوی ثابت آشپز • پخت ویژه آخر هفته (امروز پخت نمی‌شود)',
    photoUrl: buildDishFoodPhotoDataUri({
      bg1: '#14532d',
      bg2: '#166534',
      plate: '#f0fdf4',
      accent: '#15803d',
      label: 'Baghali Polo',
      icon: '🍖'
    })
  },
  {
    id: 'dish-test-ash-reg-3',
    cookId: 'cook-test-golnar',
    titleEn: 'Ash-e Reshteh with Kashk & Mint (Regular Menu — Unavailable Today)',
    titleFa: 'آش رشته سنتی با کشک و نعنا داغ (منوی ثابت — امروز ناموجود)',
    descriptionEn: 'Thick herb and noodle soup topped with caramelized onions, garlic, mint oil, and whey.',
    descriptionFa: 'آش رشته پرسبزی با کشک محلی، پیازداغ، سیرداغ و نعناداغ.',
    priceCents: 1400,
    totalPortions: 10,
    remainingPortions: 0,
    serviceWindowStartIso: '2026-11-04T16:30:00-04:00',
    serviceWindowEndIso: '2026-11-04T20:00:00-04:00',
    allergens: ['gluten', 'dairy'],
    isActive: true,
    availabilityMode: 'REGULAR_UNAVAILABLE',
    scheduleNoteEn: 'Regular menu item • Next batch Wednesday evening (Unavailable today)',
    scheduleNoteFa: 'از منوی ثابت آشپز • نوبت پخت بعدی چهارشنبه (امروز پخت نمی‌شود)',
    photoUrl: buildDishFoodPhotoDataUri({
      bg1: '#1e3a8a',
      bg2: '#1d4ed8',
      plate: '#eff6ff',
      accent: '#10b981',
      label: 'Ash Reshteh',
      icon: '🥣'
    })
  }
];
