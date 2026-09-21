const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'dist', 'cockpit-2.html');
const backupSourcePath = '/Users/admin/.ai-os/backups/github/p007-thailand-travel-cockpit/2026-09-19/20260919_180000_rebuild_d1-stable-pre-change/cockpit-2.html';
const outputPath = path.join(projectRoot, 'dist', 'cockpit-2.html');
const currentSource = fs.readFileSync(sourcePath, 'utf8');
const source = currentSource.includes('const DAYS=') ? currentSource : fs.readFileSync(backupSourcePath, 'utf8');

function extractObject(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing ${startMarker}`);
  const bodyStart = start + startMarker.length;
  const bodyEnd = source.indexOf(endMarker, bodyStart);
  if (bodyEnd < 0) throw new Error(`Missing ${endMarker}`);
  return Function(`return (${source.slice(bodyStart, bodyEnd)})`)();
}

const days = extractObject('const DAYS=', ';\nconst D1_DINNER');
const dinnerStart = source.indexOf('const D1_DINNER=') + 'const D1_DINNER='.length;
const dinnerEnd = source.indexOf('];', dinnerStart) + 1;
const dinner = Function(`return (${source.slice(dinnerStart, dinnerEnd)})`)();

// 2026-09-21 起，dist/index.html 是行程数据的唯一工作源。
// 旧版稳定生成器保留了历史 DAYS 快照；如果不在这里覆盖，D5 的新格兰岛路线
// 会在生成时悄悄退回旧的 4 节点版本。只覆盖行程对象，保留本生成器的
// 图片固化、转场地图和餐饮候选逻辑，避免把发布结构整体改写。
const itinerarySourcePath = path.join(projectRoot, 'dist', 'index.html');
const itinerarySource = fs.readFileSync(itinerarySourcePath, 'utf8');
const itineraryStart = itinerarySource.indexOf('const days = ');
const itineraryEnd = itinerarySource.indexOf('};\n\n  const foodItems', itineraryStart);
if (itineraryStart >= 0 && itineraryEnd >= 0) {
  const itineraryDays = Function(`return (${itinerarySource.slice(itineraryStart + 'const days = '.length, itineraryEnd + 1)})`)();
  if (itineraryDays.D5) {
    days.D5 = itineraryDays.D5;
    // index.html 使用 photo 字段，稳定发布页使用 img 字段；统一到发布模型。
    for (const stop of days.D5.stops || []) {
      if (!stop.img && stop.photo) stop.img = stop.photo;
    }
  }
}

if (!days.D1 || !Array.isArray(days.D1.stops) || !Array.isArray(dinner) || dinner.length !== 3) {
  throw new Error('D1 data is incomplete; refusing to rebuild');
}

// 食物卡统一放回对应时间轴。评分优先使用项目已有的 Google Maps 快照；
// 未能在当前快照中确认的候选明确标为“待复核”，不把推测写成已确认。
const foodImage = {
  'Mariga Restaurant': 'assets/mariga-exterior-reference.jpg',
  'Gigi Eatery & Café Asoke': 'assets/gigi-eatery-asoke.jpg',
  'Amritsr Restaurant Sukhumvit Soi 11': 'assets/amritsr-sukhumvit-front-v2.jpg',
  '168 Thai Restaurant - Chatuchak Market': 'assets/168-thai-market-stall.jpg',
  'PASTA AMA Centralworld': 'assets/pasta-ama-centralworld.jpg',
  'Nara Thai Cuisine CentralWorld': 'assets/nara-centralworld-front.jpg',
  "Kub Kao' Kub Pla CentralWorld": 'assets/kub-kao-kub-pla-centralworld-front.jpg',
  'Som Som Seafood': 'assets/som-som-seafood-front-v2.jpg',
  'KHAO-SO-i ICONSIAM': 'assets/khao-so-i-iconsiam.jpg',
  'Baan Ice Restaurant @ ICONSIAM': 'assets/baan-ice-iconsiam-front.jpg',
  'Kamui Hokkaido Dining at ICONSIAM': 'assets/kamui-iconsiam-front.jpg',
  'GINGER FARM kitchen at Terminal 21 Pattaya': 'assets/gingerfarm-terminal21-pattaya-front.jpg',
  'Nara Thai Cuisine Terminal 21 Pattaya': 'assets/nara-terminal21-pattaya-front.jpg',
  'Firepork - Terminal 21 Pattaya': 'assets/firepork-terminal21-pattaya-front.jpg',
  'Chutney Kebab · Curry · Biryani · Grill · Halal': 'assets/chutney-terminal21-pattaya-front.jpg',
  'Indiagate Restaurant Pattaya Beach Road': 'assets/indiagate-pattaya-front.jpg',
  'Karma Indian Restaurant Pattaya': 'assets/karma-indian-pattaya-front.jpg',
  'Anytime Cafe Pattaya': 'assets/anytime-cafe-pattaya-front.jpg',
  'At Home Cafe & Eatery': 'assets/at-home-cafe-front-v2.jpg',
  'Err Urban Rustic Thai': 'assets/err-urban-rustic-thai-front.jpg',
  'TANA Restaurant': 'assets/tana-tha-tien-front.jpg',
  'Krua Apsorn Premium Or Tor Kor': 'assets/krua-apsorn-ortorkor-front.jpg',
  'Villa Restaurant at Chaokhun Villa': 'assets/villa-restaurant-chaokhun-front.jpg',
  'Chaokhun Villa': 'assets/villa-restaurant-chaokhun-front.jpg',
  'Cattleya Restaurant · Nong Nooch Garden': 'assets/cattleya-nong-nooch-front.webp'
};

const rejectedImageNames = new Set(['iconsiam-exterior.jpg', 'terminal-21-pattaya.jpg', 'tiffany-show-pattaya.jpg', 'nong-nooch-pattaya.jpg']);
const candidate = (name, type, rating, price, location, source, map, note, imageName, distance) => {
  const requested = imageName && (imageName.includes('/') || imageName.includes('.jpg') || imageName.includes('.png'))
    ? (imageName.startsWith('assets/') ? imageName : `assets/${imageName}`)
    : '';
  const rejected = requested && rejectedImageNames.has(requested.replace('assets/', ''));
  const img = rejected ? (foodImage[name] || '') : (requested || foodImage[name] || '');
  return { name, type, rating, price, location, source, map, note, distance, img,
    imageStatus: img ? '已核验门头/入口图' : '门头照片待核验，暂不冒充店铺图' };
};

const foodSlots = {
  '酒店内晚餐或补给': dinner.map((item) => ({
    name: item.name, type: item.type, rating: item.rating, price: item.price,
    location: 'Samala Hotel Bangkok 内 / Sukhumvit Soi 15', source: 'Google Maps 检索',
    map: item.map, note: 'D1 抵达晚；优先就近，若入境或交通延误，直接取消外出。',
    distance: item.distance, img: foodImage[item.name] || item.img,
    imageStatus: (foodImage[item.name] || item.img) ? '已保存门店/入口参考图' : '门头照片待核验，暂不冒充店铺图',
  })),
  '168 Thai Restaurant · Project 3 附近': [
    candidate('168 Thai Restaurant - Chatuchak Market', '泰式', 'Google Maps 4.8/1,017', '฿200–400', '恰图恰周末市场 Project 3 · 275–276 号铺', 'Google Maps 检索', 'https://www.google.com/maps/search/168+Thai+Restaurant+Chatuchak+Market+Bangkok', '在市场内，先解决座位和饮水。', '168 Thai Restaurant - Chatuchak Market', '市场内 · 步行约 0–5 分钟'),
    candidate('Krua Apsorn Premium Or Tor Kor', '泰式 / 海鲜', 'Google Maps 评分待复核', '฿200–600', 'Or Tor Kor Market · 恰图恰附近', 'Google Maps 候选', 'https://www.google.com/maps/search/Krua+Apsorn+Premium+Or+Tor+Kor+Bangkok', '同区域备选；先确认排队和营业。', 'Krua Apsorn Premium Or Tor Kor', '约 1–2 公里 · 步行/短途 Grab'),
    candidate('Savoey Restaurant Terminal 21 Asok', '泰式海鲜', 'Google Maps 评分待复核', '฿400–1,000', 'Terminal 21 Asok · 商场内', 'Google Maps 候选', 'https://www.google.com/maps/search/Savoey+Restaurant+Terminal+21+Asok+Bangkok', '不建议为了它专程绕路；这里只保留有门头图的备选。', '', '跨区 · 不建议当天专程前往')
  ],
  'PASTA AMA · CentralWorld 7F': [
    candidate('PASTA AMA Centralworld', '意式泰融合 / 意面', 'Google Maps 4.8/784', '฿200–400', 'CentralWorld 7F · Zone B', '抖音＋Google Maps 核验', 'https://www.google.com/maps/search/PASTA+AMA+Centralworld+Bangkok', '抖音博主推荐；辣味培根奶油意面按现场菜单确认。', 'PASTA AMA Centralworld', 'CentralWorld 内 · 约 0–5 分钟'),
    candidate('Nara Thai Cuisine CentralWorld', '泰式', 'Google Maps 评分待复核', '฿400–1,000', 'CentralWorld 内', 'Google Maps 候选', 'https://www.google.com/maps/search/Nara+Thai+Cuisine+CentralWorld+Bangkok', 'PASTA AMA 排队过长时的同商场备选。', '', 'CentralWorld 内 · 以商场楼层为准'),
    candidate("Kub Kao' Kub Pla CentralWorld", '泰式', 'Google Maps 评分待复核', '฿400–1,000', 'CentralWorld 内', 'Google Maps 候选', 'https://www.google.com/maps/search/Kub+Kao+Kub+Pla+CentralWorld+Bangkok', '同商场备选；先看现场菜单和排队。', '', 'CentralWorld 内 · 以商场楼层为准')
  ],
  'Som Som Seafood · Banthat Thong': [
    candidate('Som Som Seafood', '泰式海鲜', 'Google Maps 4.3/1,663', '฿200–1,000', 'Stadium One · 659 Chulalongkorn 4 Alley', '抖音＋Google Maps 核验', 'https://www.google.com/maps/search/Som+Som+Seafood+Bangkok', '抖音博主推荐；主餐优先。', 'Som Som Seafood', 'Banthat Thong 内 · 约 0–10 分钟'),
    candidate('Banthat Thong Night Market 美食区', '夜市小吃', 'Google Maps 4.6/188（场景快照）', '฿100–500', 'Banthat Thong Road / 朱拉隆功商圈', '抖音＋Google Maps 场景核验', 'https://www.google.com/maps/search/Banthat+Thong+Night+Market+Bangkok', '爆浆吐司、榴莲、迷你菠萝只选一到两个；没有对应门头图，本轮不把别家照片放进来。', '', '约 0.3–1.0 公里 · 步行/Grab'),
    candidate('建兴酒家 Siam Square One', '泰式海鲜', 'Google Maps 2.8/103', '฿800–1,000', 'Siam Square One 一带', '抖音＋Google Maps 核验', 'https://www.google.com/maps/search/%E5%BB%BA%E5%85%B4%E9%85%92%E5%AE%B6+Siam+Square+One+Bangkok', '评分偏低且分店不确定，只列作“看菜单后再决定”的备选。', '', '约 2–3 公里 · 不建议为它专程绕路')
  ],
  '大皇宫': [
    candidate('Siw Lang Khao Man Gai', '泰式鸡饭', 'Google Maps 4.7/129', '฿1–200', '大皇宫附近 · 40 Na Phra Lan Rd', 'Google Maps 检索', 'https://www.google.com/maps/search/Siw+Lang+Khao+Man+Gai+Bangkok', '老城路线内的平价首选。', '', '约 0.5–1.0 公里 · 步行/短途 Grab'),
    candidate('TANA Restaurant', '泰式', 'Google Maps 评分待复核', '฿200–600', 'Tha Tien / 卧佛寺附近', 'Google Maps 候选', 'https://www.google.com/maps/search/TANA+Restaurant+Tha+Tien+Bangkok', '先看营业和现场排队，不把它当成抖音原店。', '', '约 1 公里内 · 步行/短途 Grab'),
    candidate('Err Urban Rustic Thai', '泰式', 'Google Maps 评分待复核', '฿400–1,000', '老城 / Tha Tien 方向', 'Google Maps 候选', 'https://www.google.com/maps/search/Err+Urban+Rustic+Thai+Bangkok', '预算和体力允许时的第三备选，出发前复核。', '', '约 1–2 公里 · 以 Google Maps 为准')
  ],
  'ICONSIAM 内解决晚餐': [
    candidate('KHAO-SO-i ICONSIAM', '泰北 / 泰式面食', 'Google Maps 4.8/252', '฿200–400', 'ICONSIAM G 层 G13', 'Google Maps 检索', 'https://www.google.com/maps/search/KHAO-SO-i+ICONSIAM+Bangkok', '当天主餐候选；留在 ICONSIAM 内，不再跨区。', 'KHAO-SO-i ICONSIAM', 'ICONSIAM 内 · 约 0–10 分钟'),
    candidate('Baan Ice Restaurant @ ICONSIAM', '泰式', 'Google Maps 4.9/5,564', '฿400–1,000', 'ICONSIAM 内', 'Google Maps 检索', 'https://www.google.com/maps/search/Baan+Ice+Restaurant+ICONSIAM+Bangkok', 'Google Maps 快照评分很高；具体楼层出发前点开确认。', 'iconsiam-exterior.jpg', 'ICONSIAM 内 · 以楼层为准'),
    candidate('Kamui Hokkaido Dining at ICONSIAM', '日式 / 海鲜', 'Google Maps 4.8/270', '฿600–1,500', 'ICONSIAM 内', 'Google Maps 检索', 'https://www.google.com/maps/search/Kamui+Hokkaido+Dining+ICONSIAM+Bangkok', '预算更高的同商场备选；现在改用 Kamui 自己的入口图。', 'iconsiam-exterior.jpg', 'ICONSIAM 内 · 以楼层为准')
  ],
  '园内午餐 → 返回 Mytt': [
    candidate('Cattleya Restaurant · Nong Nooch Garden', '园内泰式 / 自助餐', 'Google Maps 评分待复核', '฿200–600', '东芭乐园园内 · Cattleya Restaurant', '园区/公开门店图', 'https://www.google.com/maps/search/Cattleya+Restaurant+Nong+Nooch+Garden+Pattaya', '只在园内解决午餐，现场按开放餐区选择。', 'Cattleya Restaurant · Nong Nooch Garden', '园内 · 以园区步行路线为准'),
    candidate('GINGER FARM kitchen at Terminal 21 Pattaya', '泰式 / 综合餐厅', 'Google Maps 4.6/834', '฿200–1,000', 'Terminal 21 Pattaya · 2F Tokyo Zone', 'Google Maps 检索', 'https://www.google.com/maps/search/GINGER+FARM+kitchen+Terminal+21+Pattaya', '如果园内餐饮不合适，改为回城后解决；不建议为它额外折返。', 'GINGER FARM kitchen at Terminal 21 Pattaya', '回城后 · 约 20–30 分钟车程'),
    candidate('Nara Thai Cuisine Terminal 21 Pattaya', '泰式', 'Google Maps 4.6（快照）', '฿400–1,000', 'Terminal 21 Pattaya · Tokyo Zone', 'Google Maps 检索', 'https://www.google.com/maps/search/Nara+Thai+Cuisine+Terminal+21+Pattaya', '回城后同商场备选；先看是否还在营业。', 'terminal-21-pattaya.jpg', '回城后 · 商场内')
  ],
  '提前晚餐 → Tiffany’s Show': [
    candidate('Skybar Summer Club - Pattaya Restaurant and Rooftop Bar', '餐厅 / rooftop', 'Google Maps 4.9/483', '฿400–1,200', 'Tiffany’s Show 附近 / Siam@Siam Pattaya', 'Google Maps 检索', 'https://www.google.com/maps/search/Skybar+Summer+Club+Pattaya', '演出前优先按场次倒推；不要把晚餐拖到入场前。', 'Skybar Summer Club - Pattaya Restaurant and Rooftop Bar', '约 1 公里内 · Grab/步行视体力'),
    candidate('Firepork - Terminal 21 Pattaya', '韩式烤肉', 'Google Maps 4.8/2,341', '฿400–800', 'Terminal 21 Pattaya · 3F', 'Google Maps 检索', 'https://www.google.com/maps/search/Firepork+Terminal+21+Pattaya', '时间紧时的室内备选；先确认排队和用餐时长。', 'terminal-21-pattaya.jpg', '约 1–2 公里 · 以 Grab 为准'),
    candidate('Chutney Kebab · Curry · Biryani · Grill · Halal', '印度 / 清真', 'Google Maps 4.8（快照）', '฿200–800', 'Terminal 21 Pattaya · 2F', 'Google Maps 检索', 'https://www.google.com/maps/search/Chutney+Kebab+Curry+Biryani+Grill+Halal+Terminal+21+Pattaya', '同商场备选；现在改用 Chutney 入口图，不再使用商场外景。', 'terminal-21-pattaya.jpg', '约 1–2 公里 · 以 Grab 为准')
  ],
  'Terminal 21 Pattaya': [
    candidate('GINGER FARM kitchen at Terminal 21 Pattaya', '泰式 / 综合餐厅', 'Google Maps 4.6/834', '฿200–1,000', 'Terminal 21 Pattaya · 2F Tokyo Zone', 'Google Maps 检索', 'https://www.google.com/maps/search/GINGER+FARM+kitchen+Terminal+21+Pattaya', 'D4 当晚主候选；就在当天商场内。', 'GINGER FARM kitchen at Terminal 21 Pattaya', '商场内 · 约 0–10 分钟'),
    candidate('Firepork - Terminal 21 Pattaya', '韩式烤肉', 'Google Maps 4.8/2,341', '฿400–800', 'Terminal 21 Pattaya · 3F', 'Google Maps 检索', 'https://www.google.com/maps/search/Firepork+Terminal+21+Pattaya', '排队过长时的同商场备选。', 'terminal-21-pattaya.jpg', '商场内 · 以楼层为准'),
    candidate('Nara Thai Cuisine Terminal 21 Pattaya', '泰式', 'Google Maps 4.6（快照）', '฿400–1,000', 'Terminal 21 Pattaya · Tokyo Zone', 'Google Maps 检索', 'https://www.google.com/maps/search/Nara+Thai+Cuisine+Terminal+21+Pattaya', '同商场备选；出发前复核营业时间。', 'terminal-21-pattaya.jpg', '商场内 · 以楼层为准')
  ],
  '返程': [
    candidate('Indiagate Restaurant Pattaya Beach Road', '印度菜', 'Google Maps 4.9/1,748', '฿200–1,000', '芭提雅海滩路一带', 'Google Maps 检索', 'https://www.google.com/maps/search/Indiagate+Restaurant+Pattaya+Beach+Road', 'D5 回到 Mytt 后的高评分晚餐候选；回程晚则改 Grab 外卖。', 'Indiagate Restaurant Pattaya Beach Road', '约 2–4 公里 · Grab 约 10–20 分钟'),
    candidate('Anytime Cafe Pattaya', '咖啡 / 西式简餐', 'Google Maps 4.9/1,031（附近检索快照）', '฿300–800', 'Bali Hai Pier 附近', 'Google Maps 场景检索', 'https://www.google.com/maps/search/Anytime+Cafe+Pattaya', '回程顺路备选；以实时营业和位置为准。', '', '约 1–2 公里 · Grab/步行视体力'),
    candidate('Karma Indian Restaurant Pattaya', '印度菜', 'Google Maps 4.8/479（附近检索快照）', '฿300–800', 'Bali Hai Pier / 南芭提雅附近', 'Google Maps 场景检索', 'https://www.google.com/maps/search/Karma+Indian+Restaurant+Pattaya', '第三候选；海岛返程后先休息，不建议为餐厅绕远。', '', '约 2–4 公里 · 以 Grab 实时为准')
  ],
  '最后一晚': [
    candidate('At Home Cafe & Eatery', '泰式 / 咖啡馆', 'Google Maps 4.6/约 600+（快照）', '฿200–400', 'Lat Krabang 24/1 · PP Garden Home 附近', 'Google Maps 检索', 'https://www.google.com/maps/search/At+Home+Cafe+%26+Eatery+Lat+Krabang+Bangkok', '优先外卖或就近堂食；图片为实际门店参考。', 'At Home Cafe & Eatery', '约 0.4 公里级别工作估计'),
    candidate('Nud Nua Suvarnabhumi (Thai Local Food)', '泰式本地菜', 'Google Maps 4.6/807', '฿200–400', '832 Lat Krabang Rd', 'Google Maps 检索', 'https://www.google.com/maps/search/Nud+Nua+Suvarnabhumi+Thai+Local+Food', 'At Home 无法配送时的第二候选；下单前看 Grab 范围。', '', '机场附近 · 以 Grab 实时为准'),
    candidate('Chaokhun Villa', '泰式 / 餐厅', 'Google Maps 4.6/约 600+（快照）', '฿200–600', 'Lat Krabang 区', 'Google Maps 检索', 'https://www.google.com/maps/search/Chaokhun+Villa+Lat+Krabang+Bangkok', '第三候选，先确认营业、配送和酒店方向。', '', 'Lat Krabang 区 · 以 Grab 实时为准')
  ]
};

// 何雨虹的抖音餐饮来源：门店画面、食物画面、口述菜品和视频时间证据均来自用户提供的 Excel。
// Google Maps 只用于位置/评分入口核验；无法确认具体门店的画面明确标为“待核验”。
const heyuhongSource = {
  blogger: '何雨虹🌈',
  videoTitle: '《泰好吃了下次还来！》',
  videoId: '7679832730724933733',
  videoUrl: 'https://www.douyin.com/video/7679832730724933733',
  published: '2026-08-30',
  duration: '约 08:00',
  interfaceReference: '界面参考与餐饮来源严格分离；本页餐饮只采用何雨虹视频及用户提供的 Excel 证据。'
};

const heyuhongRecommendations = [
  { id:'som-som', name:'Som Som Seafood', slot:'D2 18:00–19:30 · Banthat Thong 晚餐', category:'泰式海鲜', foods:'咖喱螃蟹；蟹肉炒饭；烤河虾；咸蛋黄鱿鱼；鸡蛋蚵仔', budget:'฿200–1,000；视频未给单项价格', location:'Stadium One · 659 Chulalongkorn 4 Alley', storeImage:'assets/douyin-heyuhong/som-som-seafood-store.jpg', foodImage:'assets/douyin-heyuhong/som-som-seafood-food.jpg', storeEvidence:'视频 00:16 · 帧 480 · 门店画面', foodEvidence:'视频 00:24 · 帧 720 · 菜品画面', status:'已定位；到店再看菜单和排队', maps:'https://www.google.com/maps/search/Som+Som+Seafood+Bangkok', note:'D2 主餐优先；图片是视频原始画面，不把其他餐厅照片混进来。' },
  { id:'toast', name:'爆浆吐司（Banthat Thong）', slot:'D2 19:30–20:15 · Banthat Thong 夜市饭后', category:'夜市甜品', foods:'斑斓椰香爆浆吐司；泰茶爆浆吐司', budget:'视频口述约“五六块一个”，币种以现场为准', location:'Banthat Thong Night Market / 朱拉隆功；摊位待现场定位', storeImage:'assets/douyin-heyuhong/banthat-toast-store.jpg', foodImage:'assets/douyin-heyuhong/banthat-toast-food.jpg', storeEvidence:'视频 01:35 · 帧 2850 · 摊位画面', foodEvidence:'视频 01:43 · 帧 3090 · 食物画面', status:'REVIEW_REQUIRED · 不强行匹配同名摊位', maps:'https://www.google.com/maps/search/Banthat+Thong+Night+Market+Bangkok', note:'作为夜市顺路小份加餐，不为它额外跨区。' },
  { id:'durian', name:'榴莲（Banthat Thong）', slot:'D2 19:30–20:15 · Banthat Thong 夜市饭后', category:'水果摊', foods:'帕拉乌 / 金枕榴莲（视频口述存在冲突）', budget:'现场称重', location:'Banthat Thong；具体摊位待现场核验', storeImage:'assets/douyin-heyuhong/durian-banthat-store.jpg', foodImage:'assets/douyin-heyuhong/durian-banthat-food.jpg', storeEvidence:'视频 02:08 · 帧 3840 · 摊位画面', foodEvidence:'视频 02:24 · 帧 4320 · 榴莲画面', status:'REVIEW_REQUIRED · 品种以现场和视频回看为准', maps:'https://www.google.com/maps/search/Banthat+Thong+Bangkok', note:'只在有空、有胃口时买少量；不要把口述品种当成已核验商品名。' },
  { id:'mini-pineapple', name:'迷你菠萝（Banthat Thong）', slot:'D2 19:30–20:15 · Banthat Thong 夜市饭后', category:'水果摊', foods:'泰式迷你菠萝', budget:'现场询价', location:'Banthat Thong；与水果摊位置待核验', storeImage:'assets/douyin-heyuhong/mini-pineapple-banthat-store.jpg', foodImage:'assets/douyin-heyuhong/mini-pineapple-banthat-food.jpg', storeEvidence:'视频 02:08 · 帧 3840 · 同一水果摊画面', foodEvidence:'视频 02:36 · 帧 4680 · 菠萝画面', status:'视频场景已保留；摊位待现场定位', maps:'https://www.google.com/maps/search/Banthat+Thong+Bangkok', note:'和榴莲视为同一段水果摊线索，不新增一段交通。' },
  { id:'somboon', name:'建兴酒家 / Somboon Seafood', slot:'D2 20:15–20:45 · 晚餐备选', category:'泰式海鲜', foods:'铁板生蚝；烤鱿鱼蘸酱；芦笋＋香菇＋虾', budget:'฿800–1,000', location:'Siam Square One 一带；视频/地图分店仍需核对', storeImage:'assets/douyin-heyuhong/somboon-store.jpg', foodImage:'assets/douyin-heyuhong/somboon-food.jpg', storeEvidence:'视频 02:48 · 帧 5040 · 门店画面', foodEvidence:'视频 03:09 · 帧 5670 · 菜品画面', status:'REVIEW_REQUIRED · 地图快照 2.8/103；仅作备选', maps:'https://www.google.com/maps/search/Somboon+Seafood+Siam+Square+One+Bangkok', note:'评分偏低且分店不确定，不替代 Som Som 主餐；只有时间和体力允许才核对。' },
  { id:'andaman', name:'安达曼海鲜（外卖）', slot:'D7 18:00–19:00 · PP Garden Home 晚餐', category:'海鲜外卖', foods:'椒盐皮皮虾（约 20 多只，已剥壳）；蟹肉＋蟹黄（约 350g，已剥壳）', budget:'视频未给价格；以 Grab 实时为准', location:'PP Garden Home 配送点；商家地址未确认', storeImage:'assets/douyin-heyuhong/andaman-seafood-store.jpg', foodImage:'assets/douyin-heyuhong/andaman-seafood-food.jpg', storeEvidence:'视频 03:24 · 帧 6120 · 外卖/商家画面', foodEvidence:'视频 03:35 · 帧 6450 · 菜品画面', status:'REVIEW_REQUIRED · 先测试 Grab 配送范围', maps:'https://www.google.com/maps/search/Andaman+Seafood+Bangkok', note:'酒店定位只是收货地址，不要把它当成实体门店地址。' },
  { id:'thai-tea', name:'泰茶（街边饮品）', slot:'D2 19:30–20:15 · Banthat Thong 夜市饭后', category:'街边饮品', foods:'固体泰茶；冰泰奶茶', budget:'现场询价', location:'视频街景；招牌疑似 K HIRI THAI TEA，门店待核验', storeImage:'assets/douyin-heyuhong/thai-tea-store.jpg', foodImage:'assets/douyin-heyuhong/thai-tea-food.jpg', storeEvidence:'视频 04:18 · 帧 7740 · 街边门店画面', foodEvidence:'视频 04:26 · 帧 7980 · 饮品画面', status:'REVIEW_REQUIRED · 只保留为顺路线索', maps:'https://www.google.com/maps/search/K+HIRI+THAI+TEA+Bangkok', note:'如果就在夜市动线上再买；不为一杯饮品单独叫车。' },
  { id:'pasta-ama', name:'PASTA AMA CentralWorld', slot:'D2 15:40–16:25 · CentralWorld 7F 加餐', category:'意式泰融合 / 意面', foods:'辣味培根奶油意面（按视频画面与描述匹配）', budget:'฿200–400', location:'CentralWorld 7F · Zone B · 999/9 Rama I Rd', storeImage:'assets/douyin-heyuhong/pasta-ama-store.jpg', foodImage:'assets/douyin-heyuhong/pasta-ama-food.jpg', storeEvidence:'视频 04:45 · 帧 8550 · 门店画面', foodEvidence:'视频 04:42 · 帧 8460 · 菜品画面', status:'已定位；菜单以现场为准', maps:'https://www.google.com/maps/search/PASTA+AMA+Centralworld+Bangkok', note:'视频没有直接口述店名，按 CentralWorld 场景和菜品画面匹配；到店看招牌。' },
  { id:'bread-ahead', name:'Bread Ahead Siam Paragon', slot:'D2 16:25–17:05 · 暹罗甜品分支', category:'甜甜圈 / 烘焙', foods:'现做甜甜圈与糕点；草莓甜品画面未单独标注', budget:'现场菜单为准', location:'Siam Paragon B1-200；视频地图卡显示该店', storeImage:'assets/douyin-heyuhong/bread-ahead-store.jpg', foodImage:'assets/douyin-heyuhong/bread-ahead-food.jpg', storeEvidence:'视频 05:14 · 帧 9420 · 门店招牌画面', foodEvidence:'视频 05:43 · 帧 10290 · 甜品画面', status:'已定位；营业时间出发前复核', maps:'https://www.google.com/maps/search/Bread+Ahead+Siam+Paragon+Bangkok', note:'和 Siam Square 逛店并列为 D2 甜品分支；排队过长就跳过。' },
  { id:'central-park', name:'Central Park Bangkok 抖音美食组合', slot:'D3 15:30–19:30 · 景点后分支', category:'综合美食场景', foods:'猪肉＋虾＋椰汁酱；冬阴功；“加油站炙烤牛肉”（音频可能不准）；橘子甜品；太妃香蕉', budget:'视频未给价格', location:'Central Park Bangkok · 946 Rama IV Rd；具体店铺待定位', storeImage:'assets/douyin-heyuhong/central-park-store.jpg', foodImage:'assets/douyin-heyuhong/central-park-food.jpg', storeEvidence:'视频 05:50 · 帧 10500 · 场景画面', foodEvidence:'视频 06:15 · 帧 11250 · 菜品组合画面', status:'REVIEW_REQUIRED · 不把商场当成单一餐厅', maps:'https://www.google.com/maps/search/Central+Park+Bangkok+946+Rama+IV+Road', note:'只作为 D3 体力允许时的分支，不挤占大皇宫—卧佛寺—郑王庙主线。' },
  { id:'have-a-zeed', name:'Have a Zeed by Steak Lao（Terminal 21 Asok）/ kanomsiam', slot:'D3 19:30–20:30 · 晚餐分支', category:'泰式餐饮 / 斑斓甜品', foods:'咖喱蟹；视频中名称不清的饮品；kanomsiam 斑斓甜品', budget:'视频未给价格', location:'Terminal 21 Asok；具体餐厅、饮品和甜品摊位待拆分定位', storeImage:'assets/douyin-heyuhong/have-a-zeed-store.jpg', foodImage:'assets/douyin-heyuhong/have-a-zeed-food.jpg', storeEvidence:'视频 07:15 · 帧 13050 · 商场/门店画面', foodEvidence:'视频 07:23 · 帧 13290 · 菜品/甜品画面', status:'REVIEW_REQUIRED · 视频内可能是两家店', maps:'https://www.google.com/maps/search/Have+a+Zeed+by+Steak+Lao+Terminal+21+Asok+Bangkok', note:'先把它当作 D3 晚餐分支；到 Terminal 21 后按门头拆分确认，不强行合并成一家店。' },
  { id:'milk-boy', name:'Milk Boy（朱拉隆功商圈地标）', slot:'D2 19:30–20:15 · Banthat Thong 夜市动线', category:'饮品 / 地标线索', foods:'视频未清晰确认具体饮品', budget:'现场询价', location:'朱拉隆功 / Banthat Thong 商圈；具体门店待核验', storeImage:'assets/douyin-heyuhong/milk-boy-store.jpg', foodImage:'assets/douyin-heyuhong/milk-boy-food.jpg', storeEvidence:'视频 01:31 · 帧 2730 · 店面/地标画面', foodEvidence:'同一画面 · 未单独出现可核验菜品', status:'REVIEW_REQUIRED · 仅保留门店线索', maps:'https://www.google.com/maps/search/Milk+Boy+Banthat+Thong+Bangkok', note:'它是顺路认地标用的线索，不单独安排用餐时间。' }
];
const heyuhongNames = new Set(heyuhongRecommendations.map(item => item.name));

const transferMap = {
  '机场 → Samala Hotel Bangkok': { from: '素万那普机场 BKK · Exit 4', to: 'Samala Hotel Bangkok', mode: 'Grab / 出租车', taxiTime: '约 35–60 分钟', fare: '฿350–500；高峰/高速约 ฿550–700', distance: '约 28 公里', note: '行李多或晚点优先 Grab；机场快线＋MRT 只作体力和时间允许时的方案。' },
  '恰图恰 → 暹罗': { from: 'Chatuchak Weekend Market', to: 'Siam / OneSiam', mode: 'BTS/MRT＋步行；行李多则 Grab', taxiTime: 'Grab 约 25–45 分钟', fare: '฿180–350（实时动态价）', distance: '约 10–12 公里', note: '把换乘和找入口单独留出来，不把市场结束等同于马上开始购物。' },
  '二楼步行天桥 → OneSiam Skywalk': { from: 'Siam Discovery 二楼连廊', to: 'OneSiam Skywalk / CentralWorld 方向', mode: '步行天桥', taxiTime: '不建议打车；步行约 10–20 分钟', fare: '฿0', distance: '约 0.8–1.2 公里', note: '顺着商场连廊走；只需要看方向，不需要叫车。' },
  '暹罗 → Banthat Thong': { from: 'Siam / CentralWorld', to: 'Banthat Thong Road / Stadium One', mode: 'Grab / 出租车', taxiTime: '约 10–25 分钟', fare: '฿100–220（实时动态价）', distance: '约 3–5 公里', note: '先看餐厅排队和取号情况，晚餐不要卡死在 18:00 正点。' },
  '酒店 → 大皇宫': { from: 'Samala Hotel Bangkok', to: '大皇宫入口', mode: 'Grab / 出租车；早高峰预留堵车', taxiTime: '约 25–45 分钟', fare: '฿180–320（实时动态价）', distance: '约 8 公里', note: '遮肩、遮膝和饮水提前准备；以下方 Google Maps 入口为准。' },
  '摆渡船 → 郑王庙': { from: 'Tha Tien / 卧佛寺码头', to: 'Wat Arun 郑王庙码头', mode: '步行至码头＋摆渡船', taxiTime: '摆渡约 5–15 分钟，不含排队', fare: '约 ฿5–20/人；现场确认', distance: '跨湄南河约 0.5 公里', note: '这是船渡，不建议把它写成打车；船班、天气和排队以当天为准。' },
  '早餐、退房 → Ekkamai → 芭提雅北站': { from: '曼谷酒店 / Ekkamai', to: '芭提雅北站', mode: '步行/Grab 到 Ekkamai＋大巴', taxiTime: '到车站约 10–25 分钟；大巴约 2–2.5 小时', fare: 'Grab ฿100–220；大巴票现场/平台核价', distance: '跨城约 150 公里', note: '这是跨城交通段，图片取消；不要把大巴时长当硬承诺。' },
  'Mytt 放行李 → 午餐': { from: '芭提雅北站 / Mytt Pattaya', to: 'Mytt 附近午餐点', mode: 'Grab / 步行', taxiTime: '约 5–15 分钟', fare: '฿60–150；步行 ฿0', distance: '约 1–3 公里', note: '先放行李和补水，再开始下午景点；午餐点以现场开放为准。' },
  '真理寺': { from: 'Mytt Hotel Pattaya', to: 'Sanctuary of Truth 真理寺', mode: 'Grab / 出租车', taxiTime: '约 15–25 分钟', fare: '฿120–250（实时动态价）', distance: '约 7–9 公里', note: '去程、参观、回城分开看；门票和开放时间出发前复核。' },
  '公共船 → 纳班码头': { from: 'Bali Hai Pier 巴厘海码头', to: 'Koh Larn Naban Pier 纳班码头', mode: '公共船；快艇为备选', taxiTime: '船程约 35–50 分钟，不含排队', fare: '公共船约 ฿30–50/人；快艇另计', distance: '海上约 8–10 公里', note: '提前到码头确认返程船，不要把最后一班船卡死。' },
  'Mytt Hotel Pattaya → Bali Hai Pier': { from: 'Mytt Hotel Pattaya', to: 'Bali Hai Pier 巴厘海码头', mode: 'Grab / 双条车', taxiTime: '约 10–15 分钟', fare: '约 ฿80–150', distance: '约 2.5–3 公里', note: '给买票、找登船点和排队留缓冲。' },
  'Bali Hai Pier → Naban Pier 纳班码头': { from: 'Bali Hai Pier 巴厘海码头', to: 'Naban Pier 纳班码头', mode: '公共船；快艇为备选', taxiTime: '公共船约 35–50 分钟；快艇约 15 分钟', fare: '公共船约 ฿30–50/人；快艇约 ฿150/人工作版', distance: '海上约 8–10 公里', note: '船班、票价和返程时间按当天现场确认。' },
  'Nual Beach → Samae Beach': { from: 'Nual Beach', to: 'Samae Beach', mode: '摩托车 / 岛上接驳', taxiTime: '约 8–12 分钟', fare: '摩托车已含租车；接驳约 ฿50–100/人', distance: '约 2 公里', note: '岛上道路有坡，技术不熟练不要租车。' },
  'Samae Beach → Tien Beach': { from: 'Samae Beach', to: 'Tien Beach', mode: '摩托车 / 岛上接驳', taxiTime: '约 5–10 分钟', fare: '摩托车已含租车；接驳约 ฿50–100/人', distance: '约 1–2 公里', note: '按现场路况慢行，不需要为了短距离叫 Grab。' },
  'Tien Beach → Tawaen Beach Viewpoint': { from: 'Tien Beach', to: 'Tawaen Beach Viewpoint', mode: '摩托车 / 岛上接驳', taxiTime: '约 10–15 分钟', fare: '摩托车已含租车；接驳约 ฿50–100/人', distance: '约 3 公里', note: '先看观景点再决定是否进入 Tawaen 商业化海滩。' },
  'Tawaen Beach → TongLang Beach': { from: 'Tawaen Beach', to: 'TongLang Beach', mode: '摩托车 / 岛上接驳', taxiTime: '约 5–10 分钟', fare: '摩托车已含租车；接驳约 ฿50–100/人', distance: '约 1 公里', note: '提前看返程时间，不要把海滩停留拖过回码头缓冲。' },
  'TongLang Beach → Naban Pier': { from: 'TongLang Beach', to: 'Naban Pier 纳班码头', mode: '摩托车 / 岛上接驳', taxiTime: '约 15–20 分钟', fare: '摩托车已含租车；接驳约 ฿50–150/人', distance: '约 4–5 公里', note: '先还车，再确认返程船；不要把最后一班船当作默认方案。' },
  'Naban Pier → Bali Hai Pier': { from: 'Naban Pier 纳班码头', to: 'Bali Hai Pier 巴厘海码头', mode: '公共船；快艇为备选', taxiTime: '公共船约 35–50 分钟；快艇约 15 分钟', fare: '公共船约 ฿30–50/人；快艇约 ฿150/人工作版', distance: '海上约 8–10 公里', note: '视频线索为下午 5 点左右返程，出发日按现场船班复核。' },
  'Bali Hai Pier → Mytt Hotel Pattaya': { from: 'Bali Hai Pier 巴厘海码头', to: 'Mytt Hotel Pattaya', mode: 'Grab / 双条车', taxiTime: '约 10–15 分钟', fare: '约 ฿80–150', distance: '约 2.5–3 公里', note: '回酒店先放东西、冲洗和休息；海岛返程晚则取消额外夜逛。' },
  '纳班码头 → Tien Beach': { from: 'Naban Pier 纳班码头', to: 'Tien Beach 天海滩', mode: '双条车 / 摩托车；不建议把岛上段当 Grab', taxiTime: '约 10–20 分钟', fare: '约 ฿50–200/人，现场议价', distance: '约 4–5 公里', note: '按海滩、拍照、游泳和水上项目分配时间；项目不全部参加。' },
  'Tien Beach → 纳班 → 巴厘海码头': { from: 'Tien Beach', to: 'Naban Pier → Bali Hai Pier', mode: '岛上接驳＋公共船', taxiTime: '接驳约 10–20 分钟；船约 35–50 分钟', fare: '接驳约 ฿50–200/人；船约 ฿30–50/人', distance: '海上返程约 8–10 公里', note: '回到 Mytt 后先放东西、冲洗和休息，再决定晚餐。' },
  'Mytt → 东芭乐园': { from: 'Mytt Hotel Pattaya', to: 'Nong Nooch Tropical Garden 东芭乐园', mode: 'Grab / 包车', taxiTime: '约 35–55 分钟', fare: '฿350–700（单程实时动态价）', distance: '约 25–30 公里', note: '园林、拍照、表演三个单元按体力取舍；出发前确认开放和门票。' },
  '园内午餐 → 返回 Mytt': { from: '东芭乐园园内', to: 'Mytt Hotel Pattaya', mode: '园内简餐＋Grab / 包车返回', taxiTime: '返回约 35–55 分钟', fare: '返回 Grab/包车约 ฿350–700', distance: '约 25–30 公里', note: '图片取消；这一段重点是午餐、返程、洗澡和晚间演出的缓冲。' },
  '早餐、整理行李、去芭提雅北站': { from: 'Mytt Hotel Pattaya', to: '芭提雅北站', mode: 'Grab / 出租车', taxiTime: '约 10–20 分钟', fare: '฿100–220（实时动态价）', distance: '约 5–7 公里', note: '带行李优先 Grab；护照、机票和充电设备放在随身包。' },
  '大巴回曼谷东部客运站': { from: '芭提雅北站', to: '曼谷东部客运站 / Ekkamai', mode: '城际大巴', taxiTime: '车程约 2–2.5 小时', fare: '票价以平台/车站现场为准；约 ฿150–250 工作版', distance: '约 140–150 公里', note: '途中不安排额外景点；堵车时以现场到站时间为准。' },
  '机场附近酒店 → 素万那普机场': { from: 'PP Garden Home / 机场附近酒店', to: '素万那普机场 BKK', mode: 'Grab / 出租车', taxiTime: '约 10–25 分钟', fare: '฿120–250（实时动态价）', distance: '约 5–10 公里', note: '至少给值机、托运、安检和走到登机口各留缓冲。' },
};

const transferInfo = (stop) => {
  if (transferMap[stop.title]) return transferMap[stop.title];
  const parts = String(stop.title || '').split('→').map((x) => x.trim()).filter(Boolean);
  return {
    from: parts[0] || '起点（待确认）', to: parts[parts.length - 1] || '终点（待确认）',
    mode: 'Grab / 出租车', taxiTime: '出发前用 Grab / Google Maps 实时确认',
    fare: '以下单前实时价格为准', distance: '距离待实时确认',
    note: '这是工作版路线卡；未确认的实时交通数据不会伪装成已确认。'
  };
};

const isTransferStop = (stop) => stop.type === 'drive' || String(stop.title || '').includes('→') || String(stop.tag || '').includes('转场');
const foodCandidates = (stop) => {
  const title = String(stop.title || '');
  if (title.includes('卧佛寺')) return foodSlots['大皇宫'].filter(item => !heyuhongNames.has(item.name));
  if (title.includes('Tien Beach → 纳班') || title.includes('回 Mytt')) return foodSlots['返程'].filter(item => !heyuhongNames.has(item.name));
  if (String(stop.tag || '').includes('最后一晚')) return foodSlots['最后一晚'].filter(item => !heyuhongNames.has(item.name));
  const key = Object.keys(foodSlots).find((item) => item !== '大皇宫' && title.includes(item));
  return key ? foodSlots[key].filter(item => !heyuhongNames.has(item.name)) : null;
};

// 图片优先：将已经核验可下载的外链固化到同一发布目录，避免手机端被热链、跨站策略或源站改名影响。
const imageMap = new Map(Object.entries({
  'https://microsite-api.aot-prod.sawasdeebyaot.com/microsite/images/post/banner/post_453_20210715134814.jpg': 'assets/airport-suvarnabhumi-exterior.jpg',
  'https://res.klook.com/image/upload/fl_lossy.progressive%2Cw_1200%2Ch_800%2Cc_fill%2Cq_85/v1708056523/hotel/cgfn3vqtvsuhwblsxs8i.jpg': 'assets/samala-hotel-exterior.jpg',
  'https://images.squarespace-cdn.com/content/v1/5ee7e52abb85ae589d30a8db/19109792-e070-420f-b214-3be7e22d29a0/Chatuchak%2BWeekend%2BMarket%2Bentrance%2BBangkok%2BThailand-2.jpg?format=1500w': 'assets/chatuchak-market-entrance.jpg',
  'https://cdn-th.orstatic.com/userphoto/doorphoto/8/6LN/01AXYS5FA2EC1422724060px.jpg': 'assets/168-thai-market-stall.jpg',
  'https://www.gourmetandcuisine.com/Images/editor_upload/_editor20250707022051_original.jpg': 'assets/pasta-ama-centralworld-source.jpg',
  'https://img.wongnai.com/p/1920x0/2022/02/02/a252d11eb62043ba8ade64b2eb295ba8.jpg': 'assets/som-som-seafood-front.jpg',
  'https://images.treccani.it/ext-tool/extra/images/2/2a/2a411b77e3d1a56acb99c1ce7e8cd004.jpg': 'assets/grand-palace-bangkok.jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Wat%20Pho%20Bangkok%20Thailand.jpg': 'assets/wat-pho-bangkok.jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/WatArunBangkok.jpg': 'assets/wat-arun-bangkok.jpg',
  'https://cf-img-a-in.tosshub.com/sites/visualstory/wp/2023/06/WhatsApp-Image-2023-06-05-at-14.30.04.jpeg?size=%2A%3A900': 'assets/iconsiam-exterior.jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Ekkamai%20Bus%20Station%2020240824.jpg': 'assets/ekkamai-bus-station.jpg',
  'https://res.klook.com/klook-hotel/image/upload/fl_lossy.progressive%2Cw_1200%2Ch_800%2Cc_fill%2Cq_85/travelapi/20000000/19670000/19664700/19664685/febb46be_z.jpg': 'assets/mytt-hotel-pattaya.jpg',
  'https://ak-d.tripcdn.com/images/1mi6l224x8u6sajxs0EBB.jpg': 'assets/sanctuary-of-truth-pattaya.jpg',
  'https://media.triple.guide/triple-cms/c_limit%2Cf_auto%2Ch_2048%2Cw_2048/6e34a1f8-0749-406c-9b54-49de426fd1a5.jpeg': 'assets/terminal-21-pattaya.jpg',
  'https://cdn.buson.me/2017/11/Bali-Hai-Pier.jpg': 'assets/bali-hai-pier.jpg',
  'https://ak-d.tripcdn.com/images/100c16000000zzf5f4332.jpg?proc=source%2Ftrip': 'assets/tiffany-show-pattaya.jpg',
  'https://commons.wikimedia.org/wiki/Special:FilePath/Pattaya%20Bus%20Station%20-%20panoramio.jpg': 'assets/pattaya-bus-station.jpg',
  'https://pix8.agoda.net/hotelImages/90097760/0/7e2747ed41ef5d4e7d192f36e7fada92.jpg?va=1&ce=3&s=1024x': 'assets/pp-garden-home.jpg',
  'https://media.triple.guide/triple-cms/q_70%2Cf_auto/65f9b991-2786-40dd-ad4e-06699a4f3321': 'assets/mariga-exterior-reference.jpg',
  'https://img.wongnai.com/p/1920x0/2022/11/20/93a45ece95d049ebaf7549d8349de553.jpg': 'assets/gigi-eatery-asoke.jpg',
  'https://amritsr.com/wp-content/uploads/2024/11/WhatsApp-Image-2024-11-23-at-19.53.29-1536x1035.jpeg': 'assets/amritsr-sukhumvit.jpg'
}));

const localizeImage = src => imageMap.get(src) || src;
for (const day of Object.values(days)) {
  for (const stop of day.stops || []) {
    stop.img = localizeImage(stop.img);
    // 同一张 Klook 图在旧数据里同时被 D4 Mytt 和 D6 东芭复用，按真实地点拆开。
    if (stop.title.includes('东芭乐园') || stop.title.includes('园内午餐')) stop.img = 'assets/nong-nooch-pattaya.jpg';
    if (stop.title.includes('Mytt 放行李')) stop.img = 'assets/mytt-hotel-pattaya.jpg';
  }
}
for (const item of dinner) item.img = localizeImage(item.img);

const dataJson = JSON.stringify({ days, dinner, foodSlots, transferMap, heyuhongSource, heyuhongRecommendations });

// 时间轴紧凑版：保留时间列、节点线和卡片可读性，只收紧无意义的上下留白。
const compactSpacingCss = `<style>
.food-block{margin:2px 0 14px 106px;border:1px solid #f4c7b5;border-radius:18px;background:#fffaf7;overflow:hidden}
.food-image{width:142px;height:116px;object-fit:cover;border-radius:10px;background:#eef3f7}
.food-fallback{display:grid;width:142px;height:116px;place-items:center;border-radius:10px;background:linear-gradient(135deg,#fff7ed,#f0fdf4);color:#64748b;font-size:11px;text-align:center;padding:8px}
.food-image.is-broken{display:none}
.food-image.is-broken+.food-fallback{display:grid!important}
.food-source{margin-top:4px;font-size:10px!important;color:#9a3412!important;font-weight:800}
.segment-block{margin:1px 0 12px 106px;border:1px solid #cfe0eb;border-radius:16px;background:#f8fbff;overflow:hidden}
.segment-title{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;background:#edf6fb;border-bottom:1px solid #dbeafe;color:#1e3a5f}
.segment-title b{font-size:12px}.segment-title small{font-size:10px;color:#64748b;font-weight:800}
.segment-map{padding:8px 10px 0;background:#eaf3f7}.segment-map svg{display:block;width:100%;height:168px}
.segment-facts{display:flex;gap:6px;flex-wrap:wrap;padding:9px 10px;background:#fff;border-top:1px solid #dbeafe}
.segment-facts span{padding:6px 8px;border:1px solid #dbeafe;border-radius:9px;background:#f8fbff;color:#475569;font-size:10px}
.segment-facts b{display:block;color:#1e40af;font-size:11px;margin-top:1px}
.segment-note{padding:0 10px 9px;background:#fff;color:#64748b;font-size:10px}
.blogger-source{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 15px;padding:12px 14px;border:1px solid #fda4af;border-radius:16px;background:linear-gradient(135deg,#fff1f2,#fff7ed);color:#9f1239}.blogger-source strong{display:block;font-size:13px}.blogger-source span{display:block;margin-top:2px;font-size:11px;color:#7f1d1d}.blogger-source a{margin-left:auto;padding:7px 10px;border-radius:9px;background:#e11d48;color:#fff;text-decoration:none;font-size:11px;font-weight:900}.blogger-source small{flex-basis:100%;font-size:10px;color:#7c2d12}.heyuhong-block{margin:0 0 12px 0;border:1px solid #fda4af;border-radius:16px;background:#fff9fb;overflow:hidden}.heyuhong-head{padding:11px 13px;background:linear-gradient(135deg,#be123c,#f97316);color:#fff}.heyuhong-head h4{margin:0;font-size:15px}.heyuhong-head p{margin:3px 0 0;color:#fff1f2;font-size:11px}.heyuhong-list{display:grid;gap:8px;padding:9px}.heyuhong-item{display:grid;grid-template-columns:210px minmax(0,1fr);gap:10px;padding:9px;border:1px solid #fecdd3;border-radius:13px;background:#fff}.heyuhong-pics{display:grid;grid-template-columns:1fr 1fr;gap:5px;align-content:start}.heyuhong-pic{position:relative;min-width:0}.heyuhong-pic img,.heyuhong-pic .pic-fallback{display:block;width:100%;height:116px;object-fit:cover;border-radius:9px;background:#f8fafc}.heyuhong-pic .pic-fallback{display:grid;place-items:center;text-align:center;color:#64748b;font-size:10px;padding:5px}.heyuhong-pic img.is-broken{display:none}.heyuhong-pic img.is-broken+.pic-fallback{display:grid}.heyuhong-pic em{display:block;margin-top:2px;color:#9f1239;font-size:9px;font-style:normal;line-height:1.2}.heyuhong-item h5{font-size:14px;line-height:1.3;margin:2px 0 4px}.heyuhong-item p{margin:3px 0;color:var(--muted);font-size:11px}.heyuhong-item .heyuhong-status{color:#9f1239;font-weight:900}.heyuhong-item .heyuhong-status.ok{color:#047857}.heyuhong-item .buttons{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.heyuhong-item .map-button{margin-top:0}.heyuhong-badge{display:inline-block;padding:3px 6px;border-radius:999px;background:#fff1f2;color:#be123c;font-size:9px;font-weight:900}
.heyuhong-pic .pic-fallback{display:none}
.heyuhong-pic img.is-broken+.pic-fallback{display:grid}
.timeline{padding:12px 14px 14px}
.stop{gap:8px;padding-bottom:7px}
.stop:before{bottom:-1px}
.time{padding-top:5px;line-height:1.35}
.dot{margin-top:5px}
.stop-card{padding:10px 11px}
.stop-card h4{margin-top:5px}
.stop-card p{margin-top:3px}
.stop-img{margin-top:8px;height:150px}
.dinner-block{margin:0 0 8px 0}
.dinner-list{gap:8px;padding:10px}
.day-end{margin:0 0 0 106px}
@media(max-width:900px){
  .timeline{padding:8px 4px 10px}
  .stop{grid-template-columns:50px 14px minmax(0,1fr);gap:5px}
  .stop:before{left:56px}
  .time{padding-top:4px;font-size:11px}
  .stop{padding-bottom:5px}
  .stop-card{padding:9px 10px}
  .stop-img{height:132px}
  .dinner-block,.food-block,.segment-block,.heyuhong-block{margin-left:56px}
  .day-end{margin-left:56px}
}
@media(max-width:520px){
  .timeline{padding-left:2px;padding-right:3px}
  .stop{grid-template-columns:44px 14px minmax(0,1fr);gap:4px}
  .stop:before{left:50px}
  .time{padding-top:3px;font-size:10px;line-height:1.25}
  .dinner-block,.food-block,.segment-block,.heyuhong-block{margin-left:48px;margin-right:0}
  .day-end{margin-left:48px}
  .stop-img{height:128px}
  .dinner-item img,.dinner-item .fallback,.food-image,.food-fallback{height:145px}
  .heyuhong-item{grid-template-columns:1fr}.heyuhong-pic img,.heyuhong-pic .pic-fallback{height:150px}.blogger-source a{margin-left:0}
}
</style>`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>驾驶舱 2 号｜P-007 泰国旅行</title>
<style>
:root{--ink:#172033;--muted:#64748b;--line:#e4eaf0;--paper:#fff;--soft:#f6f9fc;--orange:#c2410c;--rose:#e11d48;--blue:#2563eb;--green:#047857;--purple:#7c3aed}
*{box-sizing:border-box}body{margin:0;background:#eef3f7;color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.shell{max-width:1180px;margin:0 auto;padding:18px}.top{position:sticky;top:12px;z-index:10;display:flex;gap:12px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:20px;padding:14px 18px;box-shadow:0 8px 28px #17203312}.mark{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#f97316,#e11d48);color:#fff;font-size:19px;font-weight:900;flex:0 0 auto}.top h1{font-size:19px;line-height:1.2;margin:0}.top p{color:var(--muted);font-size:12px;margin:3px 0 0}.top-actions{margin-left:auto;display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.pill{border:1px solid var(--line);border-radius:999px;background:#fff;padding:6px 10px;color:#475569;font-weight:800;font-size:12px}.pill.hot{border-color:#fecdd3;background:#fff1f2;color:#be123c}.pill.ok{border-color:#bbf7d0;background:#ecfdf5;color:#047857}.hero{padding:22px 2px 14px}.hero h2{font-size:28px;line-height:1.18;margin:0;letter-spacing:-.035em}.hero p{color:var(--muted);margin:7px 0 0}.notice{padding:11px 13px;border:1px solid #fed7aa;background:#fff7ed;border-radius:13px;color:#7c2d12;font-size:12px;margin:0 0 15px}.day-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 15px}.day-tab{cursor:pointer}.day-tab.active{background:#fff1f2;border-color:#fda4af;color:#be123c}.route-card,.timeline-card{background:#fff;border:1px solid var(--line);border-radius:22px;overflow:hidden;box-shadow:0 10px 30px #1720330d}.route-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 17px;border-bottom:1px solid var(--line)}.route-head h3{margin:0;font-size:16px}.route-head span{color:var(--muted);font-size:12px}.route-map{height:360px;background:#e7f0f4;position:relative;overflow:hidden}.route-map svg{width:100%;height:100%;display:block}.route-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:11px 14px;background:#fbfdff;color:var(--muted);font-size:12px}.nav-link{display:inline-flex;align-items:center;gap:4px;color:#b45309;text-decoration:none;font-weight:900}.route-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px 14px;background:#fbfdff;border-top:1px solid var(--line)}.stat{padding:9px 10px;background:#fff;border:1px solid #dbeafe;border-radius:11px}.stat small{display:block;color:var(--muted);font-size:10px}.stat b{display:block;color:#1e40af;font-size:12px;margin-top:2px}.timeline-card{margin-top:15px}.timeline-head{padding:16px 17px;background:linear-gradient(135deg,#fff7ed,#fff1f2);border-bottom:1px solid var(--line)}.timeline-head h3{margin:0;font-size:18px}.timeline-head p{margin:5px 0 0;color:var(--muted);font-size:12px}.legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;color:var(--muted);font-size:11px}.legend i{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--rose);margin-right:4px}.legend .blue{background:#0284c7}.legend .orange{background:#ea580c}.legend .purple{background:var(--purple)}.timeline{padding:16px 18px 20px}.stop{display:grid;grid-template-columns:86px 16px minmax(0,1fr);gap:10px;position:relative;padding-bottom:12px}.stop:before{content:"";position:absolute;left:94px;top:19px;bottom:-4px;width:2px;background:#e2e8f0}.stop:last-of-type:before{display:none}.time{padding-top:9px;text-align:right;color:#be123c;font-weight:900;font-size:12px}.dot{z-index:1;width:16px;height:16px;margin-top:9px;border-radius:50%;background:var(--rose);border:3px solid #fff;box-shadow:0 0 0 2px #fda4af}.stop.drive .dot{background:#0284c7;box-shadow:0 0 0 2px #bae6fd}.stop.hotel .dot{background:var(--purple);box-shadow:0 0 0 2px #ddd6fe}.stop.food .dot{background:#ea580c;box-shadow:0 0 0 2px #fed7aa}.stop-card{min-width:0;border:1px solid var(--line);border-radius:16px;background:#fff;padding:12px}.stop-card.drive{border-style:dashed;background:#f8fbff;border-color:#bfdbfe}.stop-top{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.tag{padding:3px 7px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:900}.stop-card h4{font-size:15px;line-height:1.35;margin:7px 0 0}.stop-card p{font-size:12px;color:var(--muted);margin:5px 0 0}.stop-img{width:100%;height:170px;display:block;object-fit:cover;border-radius:11px;margin-top:10px;border:1px solid #e2e8f0;background:#eef3f7}.img-fallback{display:none;min-height:88px;margin-top:10px;border-radius:11px;background:linear-gradient(135deg,#fff7ed,#f0fdf4);place-items:center;text-align:center;color:#64748b;font-size:12px;padding:12px}.stop-img.is-broken+.img-fallback{display:grid}.meta-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.meta{padding:4px 8px;border-radius:999px;background:#f8fafc;color:#475569;font-size:10px;font-weight:800}.map-button{display:inline-flex;margin-top:9px;padding:7px 10px;border-radius:9px;background:#fff7ed;color:#b45309;text-decoration:none;font-size:11px;font-weight:900}.dinner-block{margin:2px 0 14px 106px;border:1px solid #f4c7b5;border-radius:18px;background:#fffaf7;overflow:hidden}.dinner-head{padding:14px 15px;background:linear-gradient(135deg,#f97316,#e11d48);color:#fff}.dinner-head h4{margin:0;font-size:17px}.dinner-head p{margin:4px 0 0;color:#fff7ed;font-size:12px}.dinner-intro{padding:11px 14px;color:#7c2d12;font-size:12px;border-bottom:1px solid #f4c7b5}.dinner-list{display:grid;gap:10px;padding:12px}.dinner-item{display:grid;grid-template-columns:142px minmax(0,1fr);gap:12px;padding:10px;border:1px solid #f1d6c3;border-radius:14px;background:#fff}.dinner-item img{width:142px;height:116px;object-fit:cover;border-radius:10px;background:#eef3f7}.dinner-item .fallback{display:none;width:142px;height:116px;place-items:center;border-radius:10px;background:#f8fafc;color:#64748b;font-size:11px;text-align:center}.dinner-item img.is-broken+.fallback{display:grid}.dinner-item h5{font-size:15px;margin:2px 0 4px}.dinner-item p{margin:3px 0;color:var(--muted);font-size:12px}.dinner-item .rating{color:#b45309;font-weight:900}.dinner-item .buttons{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px}.dinner-map{margin:0 12px 12px;border-radius:13px;overflow:hidden;background:#edf4f6;border:1px solid #dbe5e9}.dinner-map svg{display:block;width:100%;height:210px}.day-end{margin:2px 0 0 106px;padding:11px 13px;border:1px solid #bae6fd;background:#f0f9ff;border-radius:13px;color:#075985;font-size:12px}.source-note{margin:14px 0 0;padding:11px 13px;border-radius:12px;background:#fff7ed;color:#7c2d12;font-size:11px}.hidden{display:none!important}
@media(max-width:900px){.shell{padding:10px}.top{position:relative;top:auto;align-items:flex-start}.top-actions{margin-left:0;justify-content:flex-start}.hero h2{font-size:24px}.route-map{height:300px}.route-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.timeline{padding:13px 10px 16px}.stop{grid-template-columns:62px 14px minmax(0,1fr);gap:7px}.stop:before{left:69px}.dinner-block,.day-end{margin-left:83px}.dinner-item{grid-template-columns:94px minmax(0,1fr);gap:9px}.dinner-item img,.dinner-item .fallback{width:94px;height:94px}.dinner-item h5{font-size:13px}.dinner-item p{font-size:11px}.stop-img{height:145px}}
@media(max-width:520px){.route-head{display:block}.route-head span{display:block;margin-top:3px}.dinner-item{grid-template-columns:1fr}.dinner-item img,.dinner-item .fallback{width:100%;height:160px}.dinner-map svg{height:190px}}
</style>
${compactSpacingCss}
</head>
<body>
<main class="shell">
  <header class="top"><div class="mark">P7</div><div><h1>驾驶舱 2 号｜P-007 泰国旅行</h1><p>稳定路线图 · 时间轴 · 酒店 · 美食 · 精确导航</p></div><div class="top-actions"><span class="pill hot">D1–D8</span><span class="pill">地图 + 图片</span><span class="pill ok">可切换日期</span></div></header>
  <section class="hero"><h2 id="heroTitle"></h2><p id="heroSub"></p></section>
  <div class="notice">已取消每天顶部的总地图；现在按时间轴逐段看“上一站 → 下一站”的小地图。每段都标出距离、交通方式、耗时和费用，实时导航再点本段 Google Maps。餐饮来源已单独标出，避免把界面参考误认成博主推荐。</div>
<section class="blogger-source"><div><strong>🎵 何雨虹🌈 · 抖音餐饮来源</strong><span>《泰好吃了下次还来！》 · 视频约 08:00 · 发布 2026-08-30</span></div><a href="https://www.douyin.com/video/7679832730724933733" target="_blank" rel="noopener">打开抖音原视频 ↗</a><small>店名、门店画面、食物画面、推荐菜和视频时间点来自你提供的 Excel；Google Maps 只用于位置/评分入口核验。界面参考不作为餐饮来源。</small></section>
  <nav id="dayTabs" class="day-tabs" aria-label="选择日期"></nav>
  <section class="timeline-card">
    <div class="timeline-head"><h3 id="timelineTitle"></h3><p id="timelineSub"></p><div class="legend"><span><i></i>景点 / 店铺</span><span><i class="blue"></i>转场</span><span><i class="orange"></i>用餐</span><span><i class="purple"></i>酒店</span></div></div>
    <div id="timeline" class="timeline"></div>
  </section>
  <div class="source-note">小地图是“相邻节点关系图”，不是实时导航瓦片；距离、费用和时间是工作版估算，出发当天以 Grab、公交/地铁/船班和 Google Maps 实时结果为准。</div>
</main>
<script>
const payload = ${dataJson};
let active = 'D1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayKeys = Object.keys(payload.days);
const d1Dinner = payload.dinner;
const foodByStop = payload.foodSlots;
const heyuhongById = Object.fromEntries(payload.heyuhongRecommendations.map(item => [item.id, item]));
const heyuhongIds = itemIds => itemIds.map(id => heyuhongById[id]).filter(Boolean);
const routeTransfers = payload.transferMap;
function heyuhongImageHtml(src, alt, label){ return '<div class="heyuhong-pic">'+(src?'<img src="'+esc(src)+'" alt="'+esc(alt)+'" loading="eager" onerror="this.classList.add(\\'is-broken\\')"><div class="pic-fallback">图片加载失败<br>打开抖音原视频看画面</div>':'<div class="pic-fallback">暂无对应画面</div>')+'<em>'+esc(label)+'</em></div>'; }
function heyuhongBlock(items){ if(!items || !items.length) return ''; return '<section class="heyuhong-block"><div class="heyuhong-head"><h4>🎵 何雨虹🌈 抖音推荐 · 嵌入当前时间段</h4><p>以下卡片来自同一条视频；看门店画面认店，再看推荐菜。无法确认的内容保留 REVIEW_REQUIRED。</p></div><div class="heyuhong-list">'+items.map((r,i)=>'<article class="heyuhong-item"><div class="heyuhong-pics">'+heyuhongImageHtml(r.storeImage,r.name+' 门店画面','门店/场景 · '+r.storeEvidence)+heyuhongImageHtml(r.foodImage,r.name+' 食物画面','食物 · '+r.foodEvidence)+'</div><div><span class="heyuhong-badge">抖音推荐 · '+esc(r.slot)+'</span><h5>'+((i+1)+'. '+esc(r.name))+'</h5><p><b>推荐吃什么：</b>'+esc(r.foods)+'</p><p><b>位置：</b>'+esc(r.location)+'</p><p><b>预算：</b>'+esc(r.budget)+'</p><p class="heyuhong-status '+(r.status.startsWith('已定位')?'ok':'')+'">状态：'+esc(r.status)+'</p><p>'+esc(r.note)+'</p><div class="buttons"><a class="map-button" href="'+esc(r.maps)+'" target="_blank" rel="noopener">📍 Google Maps 位置</a><a class="map-button" href="'+esc(payload.heyuhongSource.videoUrl)+'" target="_blank" rel="noopener">🎵 看原视频</a></div></div></article>').join('')+'</div></section>'; }
const el = id => document.getElementById(id);
const safeImage = (src, label) => src ? "<img class=\\\"stop-img\\\" src=\\\""+esc(src)+"\\\" alt=\\\""+esc(label)+"\\\" loading=\\\"eager\\\" onerror=\\\"this.classList.add('is-broken')\\\"><div class=\\\"img-fallback\\\">图片加载失败<br>先看店名与导航入口</div>" : "<div class=\\\"img-fallback\\\" style=\\\"display:grid\\\">暂无已核验图片<br>请打开 Google Maps 查看现场图</div>";
const isTransferStop = stop => stop.type === 'drive' || String(stop.title || '').includes('→') || String(stop.tag || '').includes('转场');
const transferInfo = stop => {
  if (routeTransfers[stop.title]) return routeTransfers[stop.title];
  const parts = String(stop.title || '').split('→').map(x => x.trim()).filter(Boolean);
  return {from:parts[0]||'起点（待确认）',to:parts[parts.length-1]||'终点（待确认）',mode:'Grab / 出租车',taxiTime:'出发前用 Grab / Google Maps 实时确认',fare:'以下单前实时价格为准',distance:'距离待实时确认',note:'这是工作版路线卡；未确认的实时交通数据不会伪装成已确认。'};
};
const foodCandidates = stop => { const title=String(stop.title||''); if(title.includes('卧佛寺')) return (foodByStop['大皇宫']||[]).filter(r=>!payload.heyuhongRecommendations.some(x=>x.name===r.name)); if(title.includes('Tien Beach → 纳班')) return (foodByStop['返程']||[]).filter(r=>!payload.heyuhongRecommendations.some(x=>x.name===r.name)); if(String(stop.tag||'').includes('最后一晚')) return (foodByStop['最后一晚']||[]).filter(r=>!payload.heyuhongRecommendations.some(x=>x.name===r.name)); const key=Object.keys(foodByStop).find(item=>item!=='大皇宫' && title.includes(item)); return key ? foodByStop[key].filter(r=>!payload.heyuhongRecommendations.some(x=>x.name===r.name)) : null; };
const heyuhongCandidates = stop => { const title=String(stop.title||''); if(title.includes('PASTA AMA')) return heyuhongIds(['pasta-ama','bread-ahead']); if(title.includes('Som Som Seafood')) return heyuhongIds(['som-som','somboon']); if(title.includes('Banthat Thong 夜市')) return heyuhongIds(['toast','durian','mini-pineapple','thai-tea','milk-boy']); if(title.includes('ICONSIAM：')) return heyuhongIds(['central-park']); if(title.includes('ICONSIAM 内解决晚餐')) return heyuhongIds(['have-a-zeed']); if(String(stop.tag||'').includes('最后一晚')) return heyuhongIds(['andaman']); return null; };
const svgPoint = (coords, i, width, height) => { const lats = coords.map(x=>x[0]); const lngs = coords.map(x=>x[1]); const minLat=Math.min(...lats), maxLat=Math.max(...lats), minLng=Math.min(...lngs), maxLng=Math.max(...lngs); const x=100+(coords[i][1]-minLng)/Math.max(maxLng-minLng,.001)*(width-200); const y=height-90-(coords[i][0]-minLat)/Math.max(maxLat-minLat,.001)*(height-180); return [x,y]; };
function routeDistanceLabel(day){ const route=day.route||''; if(route.includes('素万那普')) return '打车/Grab · 约 28 公里'; if(route.includes('Chatuchak')) return 'BTS/MRT+步行 · 约 16 公里'; if(route.includes('大皇宫')) return '步行/打车 · 约 8 公里'; if(route.includes('Mytt Hotel Pattaya')) return '跨城车 · 约 150 公里'; if(route.includes('Bali Hai Pier')) return '打车/船 · 约 35 公里'; if(route.includes('Nong Nooch')) return '打车/包车 · 约 70 公里'; if(route.includes('芭提雅北站')) return '跨城车 · 约 140 公里'; if(route.includes('PP Garden Home')) return '打车/Grab · 约 5 公里'; return '交通方式与距离以 Google Maps 实时结果为准'; }
function routeSvg(day){ const coords=day.coords||[]; const width=1200,height=420; const pts=coords.map((_,i)=>svgPoint(coords,i,width,height)); if(!pts.length) return ''; const line=pts.map((p,i)=>(i?'L':'M')+' '+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' '); const start=pts[0], end=pts[pts.length-1]; const middle=pts.length>1?[(start[0]+end[0])/2,(start[1]+end[1])/2]:start; const routeParts=(day.route||day.title||'').split('→').map(x=>x.trim()).filter(Boolean); const startName=routeParts[0]||'起点'; const endName=routeParts[routeParts.length-1]||'终点'; const box=(p,name,color,side)=>{ const w=220,h=38; const x=side==='right'?Math.min(width-w-12,p[0]+24):Math.max(12,p[0]-w-24); const y=Math.max(92,Math.min(height-h-12,p[1]-h/2)); return '<g><circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="20" fill="'+color+'" stroke="#fff" stroke-width="7"/><circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="7" fill="#fff"/><rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w+'" height="'+h+'" rx="19" fill="#fff" stroke="'+color+'" stroke-width="2"/><text x="'+(x+14).toFixed(1)+'" y="'+(y+24).toFixed(1)+'" font-size="16" font-weight="900" fill="#172033">'+esc(name.slice(0,23))+'</text></g>'; }; const arrow='<path d="M'+(middle[0]-12).toFixed(1)+' '+(middle[1]-7).toFixed(1)+' L'+(middle[0]+13).toFixed(1)+' '+middle[1].toFixed(1)+' L'+(middle[0]-12).toFixed(1)+' '+(middle[1]+7).toFixed(1)+' Z" fill="#e11d48" stroke="#fff" stroke-width="3"/>'; const distance=routeDistanceLabel(day); const dw=230,dh=32; const distanceTag='<g><rect x="'+(middle[0]-dw/2).toFixed(1)+'" y="'+(middle[1]-dh-15).toFixed(1)+'" width="'+dw+'" height="'+dh+'" rx="16" fill="#fff7ed" stroke="#fb923c" stroke-width="2"/><text x="'+middle[0].toFixed(1)+'" y="'+(middle[1]-dh/2-15).toFixed(1)+'" text-anchor="middle" font-size="14" font-weight="900" fill="#9a3412">'+esc(distance)+'</text></g>'; return '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(day.route)+' 路线示意图"><defs><filter id="routeShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#172033" flood-opacity=".16"/></filter></defs><rect width="1200" height="420" fill="#e7f0f4"/><path d="M0 80H1200M0 210H1200M0 340H1200M180 0V420M430 0V420M720 0V420M990 0V420" stroke="#c6d7dd" stroke-width="3"/><path d="'+line+'" fill="none" stroke="#e11d48" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="18 13" filter="url(#routeShadow)"/><text x="32" y="38" font-size="22" font-weight="800" fill="#27495a">路线示意图 · '+esc(day.badge||'当天主线')+'</text><text x="32" y="66" font-size="15" fill="#64748b">起点 → 终点 · 距离是工作版估算，精确定位请点下方 Google Maps</text>'+distanceTag+arrow+box(start,startName,'#2563eb','right')+box(end,endName,'#7c3aed','left')+'</svg>'; }
function dinnerSvg(){ const hotel=[36,112], shops=[[190,46],[350,112],[190,178]]; const distanceLabels=['酒店内 · 0 米','约 300 米','约 570 米']; const distancePositions=[[112,76],[238,82],[112,154]]; const lines=shops.map((p,i)=>{ const [mx,my]=distancePositions[i]; const label=distanceLabels[i]; const w=i===0?104:86; return '<path d="M'+hotel[0]+' '+hotel[1]+' L'+p[0]+' '+p[1]+'" stroke="#f97316" stroke-width="3" stroke-dasharray="7 7"/><g><rect x="'+(mx-w/2).toFixed(1)+'" y="'+(my-13).toFixed(1)+'" width="'+w+'" height="26" rx="13" fill="#fff" stroke="#fb923c" stroke-width="1.5"/><text x="'+mx.toFixed(1)+'" y="'+(my+5).toFixed(1)+'" text-anchor="middle" font-size="11" font-weight="900" fill="#9a3412">'+label+'</text></g>'; }).join(''); const nodes='<circle cx="36" cy="112" r="14" fill="#7c3aed" stroke="#fff" stroke-width="6"/><text x="58" y="117" font-size="13" font-weight="900" fill="#172033">Samala Hotel · 起点</text>'+shops.map((p,i)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="13" fill="#ea580c" stroke="#fff" stroke-width="6"/><text x="'+(p[0]+20)+'" y="'+(p[1]+5)+'" font-size="13" font-weight="900" fill="#172033">'+(i+1)+'. '+esc(d1Dinner[i].name.slice(0,20))+'</text>').join(''); return '<svg viewBox="0 0 620 224" role="img" aria-label="酒店与三家晚餐候选位置及距离关系图"><rect width="620" height="224" fill="#edf4f6"/><path d="M0 32H620M0 96H620M0 160H620M120 0V224M290 0V224M470 0V224" stroke="#d6e3e6" stroke-width="2"/>'+lines+nodes+'</svg>'; }
function stats(day){ const c=day.coords||[]; const isD1=day.title.includes('BKK 机场'); const distance=isD1?'打车/Grab · 约 28 km':(c.length+' 个节点'); const time=isD1?'约 35–60 分钟':'按时间轴执行'; const fare=isD1?'฿350–500 正常车价':'出发前实时核价'; const peak=isD1?'高峰/高速 ฿550–700':'以当天 Grab 为准'; return '<div class="stat"><small>路线距离</small><b>'+distance+'</b></div><div class="stat"><small>预计车程</small><b>'+time+'</b></div><div class="stat"><small>Grab 参考</small><b>'+fare+'</b></div><div class="stat"><small>高峰提示</small><b>'+peak+'</b></div>'; }
function foodImageHtml(item){ return item.img ? "<img class=\\\"food-image\\\" src=\\\""+esc(item.img)+"\\\" alt=\\\""+esc(item.name)+" 门头或入口图\\\" loading=\\\"eager\\\" onerror=\\\"this.classList.add('is-broken')\\\"><div class=\\\"food-fallback\\\" style=\\\"display:none\\\">图片加载失败<br>打开 Google Maps 看现场图</div>" : "<div class=\\\"food-fallback\\\">门头照片待核验<br>不拿商场外景冒充店铺图</div>"; }
function foodBlock(stop, items){ const isD1=stop.title.includes('酒店内晚餐'); const usable=items.filter(r=>r.img).slice(0,3); const pending=items.length-usable.length; const title=isD1?'晚餐候选 · 放在当前时间轴内':'当前时段餐饮候选 · 已核验图片优先'; const map=isD1?'<div class="dinner-map">'+dinnerSvg()+'</div>':''; const empty=usable.length?'':'<div class="dinner-intro">本时段暂时没有可核验的对应门头图，先不把错图放进来；下方 Google Maps 入口仍可打开现场照片。</div>'; const note='推荐来源：Google Maps 高评分检索快照；本卡只展示已核验为该店门头/入口的图片。'+(pending?' 另有 '+pending+' 家候选暂不列入正式图文推荐。':''); return '<div class="food-block"><div class="dinner-head"><h4>'+title+'</h4><p>先看门头认店，再看楼层、距离和导航；候选卡就在对应时间段下面。</p></div><div class="dinner-intro">'+note+'</div>'+empty+'<div class="dinner-list">'+usable.map((r,i)=>'<article class="dinner-item">'+foodImageHtml(r)+'<div><h5>'+((i+1)+'. '+esc(r.name))+'</h5><p class="rating">'+esc(r.rating)+'</p><p>'+esc(r.type)+' · '+esc(r.price)+'</p><p>'+esc(r.location)+'</p><p>'+esc(r.distance||'距离待确认')+'</p><p class="food-source">来源：'+esc(r.source)+' · '+esc(r.imageStatus||'已核验图片')+'</p><p>'+esc(r.note)+'</p><div class="buttons"><a class="map-button" href="'+esc(r.map)+'" target="_blank" rel="noopener">📍 Google Maps</a></div></div></article>').join('')+'</div>'+map+'</div>'; }
const segmentInfo = (from,to) => { const rawFrom=String(from.title||''), t=String(to.title||''); const transferFrom=routeTransfers[rawFrom]; const f=transferFrom ? transferFrom.to : (rawFrom.includes('→') ? rawFrom.split('→').map(x=>x.trim()).filter(Boolean).pop() : rawFrom); if(routeTransfers[t] && t.includes('→')) return routeTransfers[t]; if(f.includes('大皇宫') && t.includes('卧佛寺')) return {from:'大皇宫入口',to:'卧佛寺入口',mode:'步行',taxiTime:'约 10–15 分钟',fare:'฿0',distance:'约 0.8–1.0 公里',note:'沿老城街区步行，注意遮阳和路口。'}; if(f.includes('卧佛寺') && t.includes('摆渡船')) return routeTransfers['摆渡船 → 郑王庙']; if(f.includes('郑王庙') && t.includes('ICONSIAM')) return {from:'郑王庙码头',to:'ICONSIAM',mode:'Grab / 出租车；也可按船班换乘',taxiTime:'约 15–30 分钟',fare:'约 ฿100–250',distance:'约 5–8 公里',note:'先确认 ICONSIAM 入口，再决定车或船；这里不放景点图。'}; if(f.includes('恰图恰') && t.includes('168 Thai')) return {from:'恰图恰周末市场',to:'168 Thai Restaurant · Project 3',mode:'步行',taxiTime:'约 5–10 分钟',fare:'฿0',distance:'约 0.2–0.5 公里',note:'市场内按 Project 3 和铺号找，不需要叫车。'}; if(f.includes('168 Thai') && t.includes('恰图恰 → 暹罗')) return routeTransfers['恰图恰 → 暹罗']; if((f.includes('Siam / OneSiam') || f.includes('暹罗')) && t.includes('KONVY')) return {from:'Siam / OneSiam',to:'KONVY · Siam Center M 层',mode:'商场内步行',taxiTime:'约 5–10 分钟',fare:'฿0',distance:'约 0.3–0.6 公里',note:'从 Siam 入口进商场后，先找 KONVY 大招牌。'}; if(f.includes('KONVY') && t.includes('Siam Discovery')) return {from:'KONVY · Siam Center M 层',to:'Siam Discovery · G 层入口',mode:'商场内步行',taxiTime:'约 5–10 分钟',fare:'฿0',distance:'约 0.4–0.6 公里',note:'沿 Siam Center 与 Siam Discovery 连廊走，不要下到马路。'}; if(f.includes('OneSiam Skywalk') && t.includes('PASTA AMA')) return {from:'OneSiam Skywalk',to:'PASTA AMA · CentralWorld 7F',mode:'步行天桥＋商场内步行',taxiTime:'约 10–20 分钟',fare:'฿0',distance:'约 0.5–0.8 公里',note:'沿天桥进入 CentralWorld，再找 7F Zone B。'}; if(f.includes('PASTA AMA') && t.includes('Nineties')) return {from:'PASTA AMA · CentralWorld 7F',to:'Nineties · Siam Square Soi 2',mode:'步行天桥＋街区步行',taxiTime:'约 10–20 分钟',fare:'฿0',distance:'约 0.8–1.2 公里',note:'从 CentralWorld 方向沿天桥回 Siam Square，再找 Soi 2。'}; if(f.includes('Gentle Woman') && t.includes('暹罗 → Banthat')) return routeTransfers['暹罗 → Banthat Thong']; if(f.includes('Som Som') && t.includes('夜市')) return {from:'Som Som Seafood',to:'Banthat Thong 夜市小份加餐',mode:'步行',taxiTime:'约 5–10 分钟',fare:'฿0',distance:'约 0.3–0.8 公里',note:'沿 Banthat Thong 主街找摊位，少量加餐即可。'}; if(f.includes('酒店内晚餐') && t.includes('回 Samala')) return {from:'Samala Hotel Bangkok',to:'酒店收口',mode:'酒店内步行',taxiTime:'约 0–5 分钟',fare:'฿0',distance:'0 公里',note:'晚餐后直接休息，不再安排跨区。'}; if(f.includes('Samala Hotel') && t.includes('办理入住')) return {from:'Samala Hotel Bangkok',to:'Samala Hotel Bangkok · 办理入住',mode:'酒店内步行',taxiTime:'约 0–5 分钟',fare:'฿0',distance:'0 公里',note:'已经到酒店，行李交给前台后直接办理入住，不需要再叫车。'}; if(f.includes('办理入住') && (t.includes('酒店内晚餐') || t.includes('晚餐'))) return {from:'Samala Hotel Bangkok · 房间',to:'Samala Hotel Bangkok · 晚餐',mode:'酒店内步行',taxiTime:'约 0–5 分钟',fare:'฿0',distance:'0 公里',note:'同一酒店内移动；如果改成外出晚餐，再单独生成外出路线。'}; if(f.includes('ICONSIAM：') && t.includes('ICONSIAM 内解决')) return {from:'ICONSIAM G 层/各楼层',to:'ICONSIAM 餐厅',mode:'商场内步行',taxiTime:'约 5–15 分钟',fare:'฿0',distance:'约 0.1–0.5 公里',note:'先看楼层牌和门头，再决定用餐，不跨区。'}; if(f.includes('园内午餐') && t.includes('泳池')) return {from:'Mytt Hotel Pattaya',to:'泳池 / 按摩 / 休息',mode:'酒店内步行',taxiTime:'约 0–5 分钟',fare:'฿0',distance:'0 公里',note:'返城后先洗澡和恢复体力。'}; if(f.includes('泳池') && t.includes('提前晚餐')) return {from:'Mytt Hotel Pattaya',to:'提前晚餐 / Tiffany’s Show',mode:'Grab / 步行',taxiTime:'约 10–20 分钟',fare:'约 ฿80–180',distance:'约 1–3 公里',note:'按演出入场时间倒推晚餐，不要把排队时间吃掉。'}; if(f.includes('PP Garden Home') && t.includes('商场、咖啡')) return {from:'PP Garden Home',to:'商场 / 咖啡 / 晚餐',mode:'Grab / 步行',taxiTime:'约 10–25 分钟',fare:'约 ฿80–220',distance:'约 2–6 公里',note:'最后一晚以休息和整理行李为主，不再跨城。'}; if(f.includes('起床、早餐') && t.includes('机场附近酒店')) return {from:'机场附近酒店',to:'素万那普机场 BKK',mode:'Grab / 出租车',taxiTime:'约 10–25 分钟',fare:'约 ฿120–250',distance:'约 5–10 公里',note:'给值机、托运、安检和步行留足缓冲。'}; return {from:f||'上一站',to:t||'下一站',mode:'Grab / 步行，按现场选择',taxiTime:'约 10–25 分钟',fare:'约 ฿0–220',distance:'约 0.5–5 公里',note:'相邻节点的工作版估算；出发前用 Google Maps 和 Grab 复核。'}; };
function segmentMapSvg(from,to,info){ const a=[86,104],b=[634,104],m=[360,104]; return '<svg viewBox="0 0 720 190" role="img" aria-label="'+esc(info.from)+' 到 '+esc(info.to)+' 的路线示意图"><defs><marker id="segmentArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#e11d48"/></marker></defs><rect width="720" height="190" fill="#eaf3f7"/><path d="M0 38H720M0 104H720M0 168H720M180 0V190M360 0V190M540 0V190" stroke="#d5e3e8" stroke-width="2"/><path d="M'+a[0]+' '+a[1]+' L'+b[0]+' '+b[1]+'" stroke="#e11d48" stroke-width="7" stroke-linecap="round" stroke-dasharray="16 11" marker-end="url(#segmentArrow)"/><g><rect x="'+(m[0]-92)+'" y="'+(m[1]-35)+'" width="184" height="30" rx="15" fill="#fff7ed" stroke="#fb923c" stroke-width="2"/><text x="'+m[0]+'" y="'+(m[1]-15)+'" text-anchor="middle" font-size="13" font-weight="900" fill="#9a3412">'+esc(info.distance)+'</text></g><circle cx="'+a[0]+'" cy="'+a[1]+'" r="18" fill="#2563eb" stroke="#fff" stroke-width="6"/><circle cx="'+b[0]+'" cy="'+b[1]+'" r="18" fill="#ea580c" stroke="#fff" stroke-width="6"/><text x="'+a[0]+'" y="'+(a[1]+5)+'" text-anchor="middle" font-size="13" font-weight="900" fill="#fff">1</text><text x="'+b[0]+'" y="'+(b[1]+5)+'" text-anchor="middle" font-size="13" font-weight="900" fill="#fff">2</text><text x="'+a[0]+'" y="35" text-anchor="middle" font-size="13" font-weight="900" fill="#172033">'+esc(info.from.slice(0,25))+'</text><text x="'+b[0]+'" y="35" text-anchor="middle" font-size="13" font-weight="900" fill="#172033">'+esc(info.to.slice(0,25))+'</text><text x="'+m[0]+'" y="155" text-anchor="middle" font-size="12" font-weight="800" fill="#475569">'+esc(info.mode)+' · '+esc(info.taxiTime)+'</text></svg>'; }
function segmentBlock(from,to){ const info=segmentInfo(from,to); const maps='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(info.from)+'&destination='+encodeURIComponent(info.to); return '<div class="segment-block"><div class="segment-title"><b>'+esc(info.from)+' → '+esc(info.to)+'</b><small>相邻点小地图</small></div><div class="segment-map">'+segmentMapSvg(from,to,info)+'</div><div class="segment-facts"><span><b>怎么走</b>'+esc(info.mode)+'</span><span><b>时间</b>'+esc(info.taxiTime)+'</span><span><b>费用</b>'+esc(info.fare)+'</span><span><b>距离</b>'+esc(info.distance)+'</span><a class="map-button" href="'+maps+'" target="_blank" rel="noopener">📍 打开本段路线</a></div><div class="segment-note">'+esc(info.note)+' · 工作版估算，出发前以实时路况、班次和 Grab 价格为准。</div></div>'; }
function stopCard(stop){ const transfer=isTransferStop(stop); return '<div class="stop-card '+(transfer?'drive':'')+'"><div class="stop-top"><span class="tag">'+esc(stop.tag||'行程')+'</span>'+(transfer?'<span class="tag">路线见上方小地图</span>':'')+'</div><h4>'+esc(stop.title)+'</h4><p>'+esc(stop.desc)+'</p>'+(transfer?'<div class="segment-note" style="margin-top:9px;padding:8px 0 0;background:transparent">本段只保留路线信息，不放景点图片；请先看上方两个点和连线。</div>':safeImage(stop.img,stop.title))+'<div class="meta-row">'+(transfer?'':'<span class="meta">'+esc(stop.lat)+', '+esc(stop.lng)+'</span>')+'<span class="meta">'+(transfer?'只显示路线，不放景点图':'识别卡')+'</span></div><a class="map-button" href="'+esc(stop.map)+'" target="_blank" rel="noopener">📍 Google Maps 查看位置 ↗</a></div>'; }
function render(){ const day=payload.days[active]; el('heroTitle').textContent=day.title; el('heroSub').textContent=day.date+' · '+day.badge+' · 每两个相邻地点一张小地图，图片只放在景点和餐厅卡'; el('timelineTitle').textContent=day.label+' 时间轴 · '+day.title; el('timelineSub').textContent='每段先看两个点和连线，再看距离、交通方式、时间与费用；何雨虹推荐餐饮已插入对应时间段，并保留门店图、食物图和视频证据。'; let html=''; let previous=null; (day.stops||[]).forEach(stop=>{ if(previous) html+=segmentBlock(previous,stop); html+='<article class="stop '+esc(stop.type||'')+'"><div class="time">'+esc(stop.time)+'</div><div class="dot"></div>'+stopCard(stop)+'</article>'; const heyuhong=heyuhongCandidates(stop); if(heyuhong) html+=heyuhongBlock(heyuhong); const candidates=foodCandidates(stop); if(candidates && candidates.length) html+=foodBlock(stop,candidates); previous=stop; }); html+='<div class="day-end">当天收口：按现场体力、天气、排队和 Grab 实时价格调整；不需要为了“打卡完整”硬赶下一个点。</div>'; el('timeline').innerHTML=html; el('dayTabs').innerHTML=dayKeys.map(k=>'<button class="pill day-tab '+(k===active?'active':'')+'" data-day="'+k+'">'+esc(payload.days[k].label)+'</button>').join(''); document.querySelectorAll('.day-tab').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.day;render();window.scrollTo({top:0,behavior:'smooth'})})); }
render();
</script>
</body>
</html>`;

fs.writeFileSync(outputPath, html);
console.log(JSON.stringify({ outputPath, days: Object.keys(days).length, d1Stops: days.D1.stops.length, dinner: dinner.length, bytes: Buffer.byteLength(html) }, null, 2));
