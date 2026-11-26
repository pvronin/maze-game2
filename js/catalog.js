/**
 * catalog.js
 * Expandable content catalog for Player Skins, Flashlights, Equipment Gear,
 * Maze Environments (Maps), Enemy Creatures (including multiple spider species),
 * Missions, Achievements, and balanced Scoring/Rating evaluation.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HorrorMaze = root.HorrorMaze || {};
    Object.assign(root.HorrorMaze, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PLAYER_SKINS = [
    {
      id: 'explorer',
      price: 0,
      color: '#334155',
      trim: '#94a3b8',
      hood: '#cbd5e1',
      name: { en: 'Vault Explorer', fa: 'کاوشگر سرداب' },
      desc: {
        en: 'Balanced field jacket suited for every labyrinth.',
        fa: 'پوشش متعادل و استاندارد برای ورود به هر هزارتو.',
      },
      stats: { hp: 70, speed: 70, stamina: 70, stealth: 65, vision: 60 },
      mods: { hpMult: 1.0, speedMult: 1.0, staminaMult: 1.0, stealthMult: 1.0, visionMult: 1.0 },
      skill: {
        id: 'map_scan',
        mode: 'active',
        cooldownSec: 60,
        durationSec: 8,
        shortLabel: { en: 'MAP SCAN', fa: 'اسکن نقشه' },
        name: { en: 'Tactical Flare Scan', fa: 'اسکن کامل هزارتو' },
        desc: {
          en: 'Every 60s, press [V] to clearly reveal the entire maze, exit, keys, and enemies for 8s.',
          fa: 'هر ۶۰ ثانیه با زدن [V] تمام نقشه، جای کلیدها، درِ خروجی و دشمنان را تا ۸ ثانیه واضح می‌بینید.',
        },
      },
    },
    {
      id: 'scout',
      price: 160,
      color: '#1e3a5f',
      trim: '#38bdf8',
      hood: '#e0f2fe',
      name: { en: 'Tunnel Runner', fa: 'دونده تونل' },
      desc: {
        en: 'Lightweight rig built for rapid sprints and wider dark awareness.',
        fa: 'تجهیزات سبک برای سرعت، استقامت بالا و دید محیطی گسترده‌تر.',
      },
      stats: { hp: 55, speed: 92, stamina: 90, stealth: 72, vision: 74 },
      mods: { hpMult: 0.85, speedMult: 1.12, staminaMult: 1.25, stealthMult: 0.92, visionMult: 1.16 },
      skill: {
        id: 'adrenaline_rush',
        mode: 'active',
        cooldownSec: 32,
        durationSec: 6.5,
        shortLabel: { en: 'OVERDRIVE', fa: 'جهش سرعت' },
        name: { en: 'Adrenaline Overdrive', fa: 'جهش آدرنالین' },
        desc: {
          en: 'Every 32s, press [V] to refill Stamina and move +38% faster for 6.5s with zero drain.',
          fa: 'هر ۳۲ ثانیه با زدن [V] استقامت پر می‌شود و تا ۶.۵ ثانیه ۳۸٪ سریع‌تر می‌دوید.',
        },
      },
    },
    {
      id: 'warden',
      price: 240,
      color: '#3f2e21',
      trim: '#d97706',
      hood: '#fde68a',
      name: { en: 'Iron Warden', fa: 'نگهبان آهنین' },
      desc: {
        en: 'Reinforced coat that endures harsher trap blows; heavy visor narrows peripheral sight.',
        fa: 'زره سنگین با تحمل بالای ضربه تله‌ها و کلاهخود محافظ با دید محیطی کمتر.',
      },
      stats: { hp: 96, speed: 62, stamina: 62, stealth: 48, vision: 50 },
      mods: { hpMult: 1.25, speedMult: 0.93, staminaMult: 0.92, stealthMult: 1.15, visionMult: 0.92 },
      skill: {
        id: 'shock_stun',
        mode: 'active',
        cooldownSec: 50,
        durationSec: 20,
        shortLabel: { en: 'STUN 20s', fa: 'شوک ۲۰ث' },
        name: { en: 'Concussive Shock-Strike', fa: 'ضربه شوک بی‌هوش‌کننده' },
        desc: {
          en: 'Every 50s, press [V] to stun enemies within 5.5 tiles for 20s (16s vs Boss).',
          fa: 'هر ۵۰ ثانیه با زدن [V] دشمنان تا ۵.۵ خانه را تا ۲۰ ثانیه (باس ۱۶ ثانیه) بی‌هوش می‌کند.',
        },
      },
    },
    {
      id: 'phantom',
      price: 340,
      color: '#1e1b4b',
      trim: '#a855f7',
      hood: '#e9d5ff',
      name: { en: 'Shadow Stalker', fa: 'سایه‌گرد' },
      desc: {
        en: 'Muffled cloak with night-adapted eyes for stealth and wide dark vision.',
        fa: 'ردای بی‌صدا با چشمان سازگار با تاریکی برای دید دایره‌ای وسیع و مخفی‌کاری.',
      },
      stats: { hp: 66, speed: 78, stamina: 84, stealth: 96, vision: 84 },
      mods: { hpMult: 0.95, speedMult: 1.05, staminaMult: 1.12, stealthMult: 0.72, visionMult: 1.26 },
      skill: {
        id: 'auto_cloak',
        mode: 'passive',
        cooldownSec: 40,
        durationSec: 5,
        shortLabel: { en: 'AUTO CLOAK', fa: 'نامرئی خودکار' },
        name: { en: 'Spectral Veil (Automatic)', fa: 'حجاب سایه خودکار (بدون کلیک)' },
        desc: {
          en: 'Passive: Automatically turns invisible for 5s when spotted by a creature (40s auto CD).',
          fa: 'خودکار: هنگام دیده شدن توسط دشمن ۵ ثانیه نامرئی می‌شوید (شارژ خودکار هر ۴۰ ثانیه).',
        },
      },
    },
    {
      id: 'doctor',
      price: 450,
      color: '#064e3b',
      trim: '#34d399',
      hood: '#f8fafc',
      name: { en: 'Plague Alchemist', fa: 'کیمیاگر طاعون' },
      desc: {
        en: 'Alchemical goggles & mask offering unmatched circular sight and endurance.',
        fa: 'عینک کیمیاگری و ماسک ویژه با بالاترین شعاع دید دایره‌ای و استقامت بقا.',
      },
      stats: { hp: 86, speed: 76, stamina: 82, stealth: 80, vision: 92 },
      mods: { hpMult: 1.15, speedMult: 1.04, staminaMult: 1.15, stealthMult: 0.84, visionMult: 1.36 },
      skill: {
        id: 'alchemical_immunity',
        mode: 'passive',
        cooldownSec: 45,
        durationSec: 0,
        shortLabel: { en: 'BIO IMMUNE', fa: 'ضدگاز + درمان' },
        name: { en: 'Alchemical Immunity (Automatic)', fa: 'مصونیت کیمیاگری (بدون کلیک)' },
        desc: {
          en: 'Passive: Immune to Toxic Gas, regenerates +2.5 HP/s when hurt, and brews 1 Smoke Bomb every 45s.',
          fa: 'خودکار: ضد گاز سمی، بازیابی ۲.۵ سلامت/ثانیه و ساخت یک بمب دودزا هر ۴۵ ثانیه.',
        },
      },
    },
  ];

  const FLASHLIGHTS = [
    {
      id: 'standard',
      price: 0,
      beamColor: 'rgba(251, 191, 36, 0.16)',
      bulbColor: '#fbbf24',
      name: { en: 'Standard Torch', fa: 'چراغ‌قوه استاندارد' },
      desc: {
        en: 'Reliable brass flashlight with balanced beam and battery drain.',
        fa: 'چراغ‌قوه مطمئن با زاویه دید و مصرف باتری متعادل.',
      },
      stats: { power: 68, battery: 68, width: 65, utility: 60 },
      mods: { range: 8.8, spreadDeg: 58, drainMult: 1.0, trapRevealMult: 1.0 },
    },
    {
      id: 'lantern',
      price: 140,
      beamColor: 'rgba(253, 186, 116, 0.18)',
      bulbColor: '#fb923c',
      name: { en: 'Miner Lantern', fa: 'فانوس معدنچی' },
      desc: {
        en: 'Wide 92° flood beam and long battery life, shorter max reach.',
        fa: 'نور بسیار پهن ۹۲ درجه و عمر باتری بالا با برد کوتاه‌تر.',
      },
      stats: { power: 52, battery: 92, width: 95, utility: 72 },
      mods: { range: 7.0, spreadDeg: 92, drainMult: 0.72, trapRevealMult: 1.1 },
    },
    {
      id: 'tactical',
      price: 250,
      beamColor: 'rgba(224, 242, 254, 0.17)',
      bulbColor: '#e0f2fe',
      name: { en: 'Halogen Spotlight', fa: 'نورافکن تاکتیکی' },
      desc: {
        en: 'Piercing 11.5-tile white beam that exposes distant corridors; drains faster.',
        fa: 'نور سفید پرفشار با برد بسیار بلند؛ مصرف باتری بیشتر.',
      },
      stats: { power: 96, battery: 52, width: 46, utility: 75 },
      mods: { range: 11.5, spreadDeg: 44, drainMult: 1.22, trapRevealMult: 1.2 },
    },
    {
      id: 'uv_relic',
      price: 380,
      beamColor: 'rgba(167, 139, 250, 0.2)',
      bulbColor: '#c084fc',
      name: { en: 'UV Relic Lamp', fa: 'چراغ فرابنفش باستانی' },
      desc: {
        en: 'Spectral violet beam that reveals hidden traps early from afar.',
        fa: 'نور بنفش ویژه که تله‌های پنهان را از فاصله دورتر آشکار می‌کند.',
      },
      stats: { power: 82, battery: 78, width: 72, utility: 98 },
      mods: { range: 9.6, spreadDeg: 66, drainMult: 0.92, trapRevealMult: 1.55 },
    },
  ];

  const GEAR_ITEMS = [
    {
      id: 'none',
      price: 0,
      name: { en: 'No Extra Gear', fa: 'بدون تجهیز اضافه' },
      desc: {
        en: 'Travel light with standard survival pockets.',
        fa: 'حرکت بدون تجهیزات جانبی اضافه.',
      },
      stats: { stealth: 50, vision: 50, battery: 50, stamina: 50, utility: 50 },
      mods: { hearingMult: 1.0, batteryCapMult: 1.0, disarmBonus: 0, regenMult: 1.0, ambientVisionBonus: 0, sonarSense: false, bonusSmoke: 0 },
    },
    {
      id: 'keen_senses',
      price: 280,
      name: { en: 'Echolocation Ear-Piece', fa: 'سمعک ادراک و شنوایی' },
      desc: {
        en: 'Amplifies subtle echoes to expand your circular ambient vision and emit sound ripples from distant threats.',
        fa: 'تقویت شدید شنوایی محیطی برای افزایش شعاع دید دایره‌ای در تاریکی و نمایش امواج صوتی دشمن و آیتم‌ها.',
      },
      stats: { stealth: 72, vision: 96, battery: 55, stamina: 55, utility: 88 },
      mods: { hearingMult: 0.85, batteryCapMult: 1.0, disarmBonus: 0.2, regenMult: 1.0, ambientVisionBonus: 1.15, sonarSense: true, bonusSmoke: 0 },
    },
    {
      id: 'padded_boots',
      price: 150,
      name: { en: 'Muffled Boots', fa: 'چکمه‌های بی‌صدا' },
      desc: {
        en: 'Dampens sprint footsteps so creatures hear you less often.',
        fa: 'کاهش شدید صدای قدم‌ها هنگام دویدن.',
      },
      stats: { stealth: 95, vision: 52, battery: 50, stamina: 65, utility: 60 },
      mods: { hearingMult: 0.62, batteryCapMult: 1.0, disarmBonus: 0, regenMult: 1.08, ambientVisionBonus: 0, sonarSense: false, bonusSmoke: 0 },
    },
    {
      id: 'battery_belt',
      price: 210,
      name: { en: 'Auxiliary Battery Pack', fa: 'پک باتری کمکی' },
      desc: {
        en: 'Increases flashlight capacity by 35% and boosts passive recharge.',
        fa: 'افزایش ۳۵ درصدی ظرفیت باتری و شارژ سریع‌تر.',
      },
      stats: { stealth: 50, vision: 56, battery: 96, stamina: 55, utility: 75 },
      mods: { hearingMult: 1.0, batteryCapMult: 1.35, disarmBonus: 0, regenMult: 1.0, ambientVisionBonus: 0.15, sonarSense: false, bonusSmoke: 0 },
    },
    {
      id: 'disarm_kit',
      price: 260,
      name: { en: 'Sapper Disarm Kit', fa: 'کیت خنثی‌سازی تله' },
      desc: {
        en: 'Extends trap disarm reach and packs an extra Smoke Bomb.',
        fa: 'افزایش برد خنثی‌سازی تله‌ها به همراه یک بمب دودزای اضافه.',
      },
      stats: { stealth: 65, vision: 55, battery: 55, stamina: 60, utility: 98 },
      mods: { hearingMult: 0.9, batteryCapMult: 1.0, disarmBonus: 0.55, regenMult: 1.0, ambientVisionBonus: 0, sonarSense: false, bonusSmoke: 1 },
    },
    {
      id: 'adrenaline_vial',
      price: 330,
      name: { en: 'Adrenaline Injector', fa: 'آمپول آدرنالین' },
      desc: {
        en: 'Dramatically accelerates stamina recovery during tense chases.',
        fa: 'بازیابی سریع استقامت در تعقیب و گریزهای نفس‌گیر.',
      },
      stats: { stealth: 55, vision: 62, battery: 55, stamina: 96, utility: 80 },
      mods: { hearingMult: 0.95, batteryCapMult: 1.0, disarmBonus: 0, regenMult: 1.45, ambientVisionBonus: 0.25, sonarSense: false, bonusSmoke: 0 },
    },
  ];

  const MAP_THEMES = [
    {
      id: 'crypt',
      price: 0,
      name: { en: 'Stone Crypt', fa: 'سرداب سنگی' },
      desc: {
        en: 'Cold subterranean limestone corridors and rusted vault gates.',
        fa: 'راهروهای سنگی مرطوب و دروازه‌های زنگ‌زده زیرزمینی.',
      },
      stats: { threat: 60, reward: 60, width: 65, power: 65 },
      rewardMult: 1.0,
      braidBonus: 0,
      palette: {
        bg: '#04060a',
        floorA: '#1e2634',
        floorB: '#18202c',
        wallTop: '#334155',
        wallFace: '#1e293b',
        wallEdge: '#52637a',
        particleColor: 'rgba(226, 232, 240, 0.35)',
        accent: '#d97706',
        decor: 'stone',
      },
    },
    {
      id: 'sewers',
      price: 220,
      name: { en: 'Flooded Sewers', fa: 'فاضلاب متروکه' },
      desc: {
        en: 'Moss-slick drainage tunnels with echoing water puddles and green spores.',
        fa: 'تونل‌های خزه‌گرفته با گودال‌های آب و بخار سبز مه‌آلود.',
      },
      stats: { threat: 70, reward: 75, width: 75, power: 60 },
      rewardMult: 1.15,
      braidBonus: 0.08,
      palette: {
        bg: '#030807',
        floorA: '#132624',
        floorB: '#0f1f1e',
        wallTop: '#24403c',
        wallFace: '#152926',
        wallEdge: '#3b6660',
        particleColor: 'rgba(110, 231, 183, 0.35)',
        accent: '#10b981',
        decor: 'puddles',
      },
    },
    {
      id: 'catacombs',
      price: 320,
      name: { en: 'Ashen Catacombs', fa: 'دخمه خاکستر' },
      desc: {
        en: 'Volcanic obsidian halls lit by drifting embers and tight choke corridors.',
        fa: 'تالارهای بازالت سیاه با اخگرهای معلق و گذرگاه‌های پرفشار.',
      },
      stats: { threat: 82, reward: 85, width: 55, power: 75 },
      rewardMult: 1.25,
      braidBonus: -0.04,
      palette: {
        bg: '#090404',
        floorA: '#241717',
        floorB: '#1c1212',
        wallTop: '#3f2626',
        wallFace: '#291717',
        wallEdge: '#663c3c',
        particleColor: 'rgba(251, 146, 60, 0.45)',
        accent: '#f97316',
        decor: 'embers',
      },
    },
    {
      id: 'spider_nest',
      price: 420,
      name: { en: 'Arachnid Nest', fa: 'لانه عنکبوت‌ها' },
      desc: {
        en: 'Web-draped caverns pulsing with eerie violet spores and tangled corners.',
        fa: 'غارهای پوشیده از تار عنکبوت با هاگ‌های بنفش اسرارآمیز.',
      },
      stats: { threat: 90, reward: 92, width: 72, power: 68 },
      rewardMult: 1.35,
      braidBonus: 0.06,
      palette: {
        bg: '#06040b',
        floorA: '#1f182e',
        floorB: '#181324',
        wallTop: '#362952',
        wallFace: '#221936',
        wallEdge: '#5b4785',
        particleColor: 'rgba(192, 132, 252, 0.4)',
        accent: '#a855f7',
        decor: 'webs',
      },
    },
    {
      id: 'bio_lab',
      price: 540,
      name: { en: 'Containment Sector', fa: 'آزمایشگاه قرنطینه' },
      desc: {
        en: 'Steel grating corridors, hazard stripes, and sterile emergency lighting.',
        fa: 'راهروهای فلزی قرنطینه با خطوط هشدار و نورپردازی اضطراری.',
      },
      stats: { threat: 95, reward: 98, width: 80, power: 82 },
      rewardMult: 1.45,
      braidBonus: 0.1,
      palette: {
        bg: '#03060a',
        floorA: '#1a2432',
        floorB: '#141c28',
        wallTop: '#2b3b4e',
        wallFace: '#18222e',
        wallEdge: '#4e6785',
        particleColor: 'rgba(56, 189, 248, 0.36)',
        accent: '#38bdf8',
        decor: 'grating',
      },
    },
  ];

  const ENEMY_TYPES = [
    {
      id: 'stalker',
      price: 0,
      archetype: 'humanoid',
      bodyColor: '#14111d',
      chaseColor: '#2b090c',
      eyeColor: '#ef4444',
      accentColor: '#4c1d95',
      name: { en: 'The Stalker', fa: 'تعقیب‌گر سایه' },
      desc: {
        en: 'Gaunt bone-masked horror that hunts patiently via sight and sound.',
        fa: 'موجود استخوان‌پوش که با بینایی و شنوایی به شکار می‌پردازد.',
      },
      stats: { speed: 70, threat: 72, stealth: 65, utility: 60 },
      mods: { speedMult: 1.0, sightMult: 1.0, dashCooldown: 0, dropsWeb: false },
    },
    {
      id: 'cellar_spider',
      price: 180,
      archetype: 'spider',
      legs: 8,
      scale: 0.92,
      bodyColor: '#1c1917',
      chaseColor: '#451a03',
      eyeColor: '#f59e0b',
      accentColor: '#92400e',
      name: { en: 'Cellar Skitterer', fa: 'عنکبوت زیرزمین' },
      desc: {
        en: 'Agile 8-legged arachnid that lunges in sudden bursts down straight halls.',
        fa: 'عنکبوت چابک هشت‌پا با جهش‌های ناگهانی در راهروهای مستقیم.',
      },
      stats: { speed: 92, threat: 78, stealth: 78, utility: 70 },
      mods: { speedMult: 1.08, sightMult: 0.94, dashCooldown: 4.5, dropsWeb: false },
    },
    {
      id: 'widow_weaver',
      price: 300,
      archetype: 'spider',
      legs: 8,
      scale: 1.05,
      bodyColor: '#09090b',
      chaseColor: '#450a0a',
      eyeColor: '#ef4444',
      accentColor: '#dc2626',
      name: { en: 'Crimson Widow', fa: 'عنکبوت بیوه سرخ' },
      desc: {
        en: 'Venomous weaver that leaves temporary slowing silk webs behind it.',
        fa: 'تارهای ابریشمی موقت و کندکننده در مسیر حرکت خود می‌تند.',
      },
      stats: { speed: 76, threat: 86, stealth: 80, utility: 92 },
      mods: { speedMult: 1.0, sightMult: 1.04, dashCooldown: 0, dropsWeb: true },
    },
    {
      id: 'crypt_wraith',
      price: 400,
      archetype: 'wraith',
      bodyColor: '#0f172a',
      chaseColor: '#1e1b4b',
      eyeColor: '#38bdf8',
      accentColor: '#818cf8',
      name: { en: 'Crypt Wraith', fa: 'شبح دخمه' },
      desc: {
        en: 'Drifting apparition with sharp spectral sight and eerie silence.',
        fa: 'روح سرگردان با دید گسترده و حرکت بی‌صدا در تاریکی.',
      },
      stats: { speed: 82, threat: 88, stealth: 95, utility: 84 },
      mods: { speedMult: 1.04, sightMult: 1.18, dashCooldown: 0, dropsWeb: false },
    },
    {
      id: 'broodmother',
      price: 520,
      archetype: 'spider',
      legs: 8,
      scale: 1.22,
      bodyColor: '#1f1024',
      chaseColor: '#500724',
      eyeColor: '#f43f5e',
      accentColor: '#db2777',
      name: { en: 'Abyssal Broodmother', fa: 'مادر عنکبوت‌های مغاک' },
      desc: {
        en: 'Massive armored spider combining silk webs with relentless chase bursts.',
        fa: 'عنکبوت غول‌پیکر زره‌پوش با تارهای چسبنده و یورش‌های ویرانگر.',
      },
      stats: { speed: 86, threat: 98, stealth: 60, utility: 96 },
      mods: { speedMult: 1.06, sightMult: 1.1, dashCooldown: 5.5, dropsWeb: true },
    },
  ];

  const BOSS_DEF = {
    id: 'abyssal_warden',
    archetype: 'boss',
    bodyColor: '#1f0b14',
    chaseColor: '#4c0519',
    eyeColor: '#fbbf24',
    accentColor: '#e11d48',
    name: { en: 'The Abyssal Warden', fa: 'نگهبان مغاک (باس)' },
    desc: {
      en: 'Armored final guardian that unleashes telegraphed seismic shockwaves and shadow surges.',
      fa: 'نگهبان زره‌پوش مرحله آخر با امواج شوک قابل پیش‌بینی و یورش سایه.',
    },
    mods: { speedMult: 1.04, sightMult: 1.14, dashCooldown: 0, dropsWeb: false },
  };

  const MISSIONS = [
    {
      id: 'm_escape_any',
      type: 'wins',
      target: 1,
      reward: 90,
      name: { en: 'First Descent', fa: 'نخستین فرار' },
      desc: { en: 'Escape any labyrinth alive.', fa: 'یک بار زنده از هزارتو فرار کنید.' },
    },
    {
      id: 'm_keys_10',
      type: 'keys',
      target: 10,
      reward: 120,
      name: { en: 'Locksmith', fa: 'کلیددار سرداب' },
      desc: { en: 'Collect 10 sealed keys across runs.', fa: 'در مجموع ۱۰ کلید جمع‌آوری کنید.' },
    },
    {
      id: 'm_disarm_5',
      type: 'disarms',
      target: 5,
      reward: 130,
      name: { en: 'Steady Hands', fa: 'دستان مطمئن' },
      desc: { en: 'Safely disarm 5 traps using [E].', fa: '۵ تله را با دکمه [E] خنثی کنید.' },
    },
    {
      id: 'm_fast_escape',
      type: 'fast_win',
      target: 1,
      reward: 170,
      name: { en: 'Against the Clock', fa: 'مسابقه با زمان' },
      desc: { en: 'Escape with at least 90s remaining.', fa: 'با حداقل ۹۰ ثانیه زمان باقی‌مانده فرار کنید.' },
    },
    {
      id: 'm_unscathed',
      type: 'no_damage_win',
      target: 1,
      reward: 220,
      name: { en: 'Untouched Ghost', fa: 'سایه دست‌نیافتنی' },
      desc: { en: 'Escape without taking any damage.', fa: 'بدون دریافت هیچ آسیبی از هزارتو خارج شوید.' },
    },
    {
      id: 'm_hard_win',
      type: 'hard_win',
      target: 1,
      reward: 300,
      name: { en: 'Apex Survivor', fa: 'بازمانده قله' },
      desc: { en: 'Escape on Hard difficulty.', fa: 'در درجه سختی «سخت» پیروز شوید.' },
    },
    {
      id: 'm_mp_win',
      type: 'mp_win',
      target: 1,
      reward: 200,
      name: { en: 'Center Champion', fa: 'قهرمان مرکز' },
      desc: { en: 'Finish 1st in a Multiplayer race.', fa: 'در مسابقه چندنفره جایگاه اول را کسب کنید.' },
    },
  ];

  const ACHIEVEMENTS = [
    {
      id: 'ach_relic',
      type: 'relics',
      target: 3,
      reward: 150,
      name: { en: 'Relic Hunter', fa: 'شکارچی عتیقه' },
      desc: { en: 'Discover 3 hidden Ancient Relics.', fa: '۳ عتیقه باستانی پنهان را کشف کنید.' },
    },
    {
      id: 'ach_hide',
      type: 'hides',
      target: 5,
      reward: 110,
      name: { en: 'Breath in the Dark', fa: 'نفس در تاریکی' },
      desc: { en: 'Conceal yourself in alcoves 5 times.', fa: '۵ بار در شکاف دیوارها پنهان شوید.' },
    },
    {
      id: 'ach_5wins',
      type: 'wins',
      target: 5,
      reward: 260,
      name: { en: 'Labyrinth Master', fa: 'استاد هزارتو' },
      desc: { en: 'Complete 5 single-player escapes.', fa: '۵ بار در بخش تک‌نفره پیروز شوید.' },
    },
    {
      id: 'ach_collector',
      type: 'purchases',
      target: 3,
      reward: 180,
      name: { en: 'Prepared Survivor', fa: 'بازمانده مجهز' },
      desc: { en: 'Unlock 3 items in the Armory Shop.', fa: '۳ آیتم از فروشگاه بازی را خریداری کنید.' },
    },
  ];

  function getById(list, id) {
    return list.find((item) => item.id === id) || list[0];
  }

  /**
   * Computes meaningful, itemized performance score, Grade (S..D), Stars (1..5),
   * and Soul Shards reward for both Single-Player and Multiplayer matches.
   */
  function calculateRunRating(params) {
    const {
      victory,
      elapsedTime,
      timeRemaining,
      keysCollected,
      totalKeys,
      trapsDisarmed,
      relicsCollected = 0,
      hpRatio = 0,
      tookDamage = true,
      difficultyId = 'normal',
      mapId = 'crypt',
      mpRank = null, // 1..4 for multiplayer
      mpPlayerCount = 1,
    } = params;

    const diffMult = difficultyId === 'hard' ? 1.5 : difficultyId === 'normal' ? 1.2 : 1.0;
    const mapDef = getById(MAP_THEMES, mapId);
    const mapMult = mapDef ? mapDef.rewardMult : 1.0;

    let completionPts = 0;
    if (mpRank !== null) {
      if (mpRank === 1) completionPts = 900;
      else if (mpRank === 2) completionPts = 600;
      else if (mpRank === 3) completionPts = 400;
      else completionPts = 180;
    } else {
      completionPts = victory ? 650 : 100;
    }

    const timePts = victory || mpRank !== null ? Math.round(Math.max(0, timeRemaining) * 10) : 0;
    const objectivePts = keysCollected * 240 + relicsCollected * 200;
    const trapPts = trapsDisarmed * 110;
    const stealthPts = victory && !tookDamage ? 350 : victory ? Math.round(hpRatio * 200) : 0;

    const subtotal = completionPts + timePts + objectivePts + trapPts + stealthPts;
    const totalMult = Number((diffMult * mapMult).toFixed(2));
    const totalScore = Math.round(subtotal * totalMult);

    // Grade & Stars
    let grade = 'D';
    let stars = 1;
    if (mpRank !== null) {
      if (mpRank === 1) { grade = 'S'; stars = 5; }
      else if (mpRank === 2) { grade = mpPlayerCount === 2 ? 'B' : 'A'; stars = mpPlayerCount === 2 ? 3 : 4; }
      else if (mpRank === 3) { grade = 'B'; stars = 3; }
      else { grade = 'C'; stars = 2; }
    } else if (!victory) {
      grade = keysCollected >= Math.max(1, totalKeys - 1) ? 'C' : 'D';
      stars = keysCollected >= 1 ? 1 : 0;
    } else {
      if (totalScore >= 3600) { grade = 'S'; stars = 5; }
      else if (totalScore >= 2600) { grade = 'A'; stars = 4; }
      else if (totalScore >= 1800) { grade = 'B'; stars = 3; }
      else { grade = 'C'; stars = 2; }
    }

    // Balanced Soul Shards currency reward
    let shardsEarned = Math.round(totalScore / 34) + relicsCollected * 25;
    if (!victory && mpRank === null) {
      shardsEarned = Math.max(12, Math.round(keysCollected * 16 + trapsDisarmed * 10 + elapsedTime * 0.15));
    }

    return {
      totalScore,
      grade,
      stars,
      shardsEarned,
      xpEarned: Math.round(shardsEarned * 1.4),
      breakdown: {
        completionPts,
        timePts,
        objectivePts,
        trapPts,
        stealthPts,
        totalMult,
      },
    };
  }

  return {
    PLAYER_SKINS,
    FLASHLIGHTS,
    GEAR_ITEMS,
    MAP_THEMES,
    ENEMY_TYPES,
    BOSS_DEF,
    MISSIONS,
    ACHIEVEMENTS,
    getById,
    calculateRunRating,
  };
});
