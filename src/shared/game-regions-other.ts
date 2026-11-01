import type { ExplorationRoute } from './gameplay.ts';

export const OTHER_ROUTES: ExplorationRoute[] = [
  {
    id: 'ursus_survey', regionId: 'ursus', name: '林缘观测',
    description: '沿标记安全点记录雪线、封闭路段与林地气象，不进入矿井或冲突现场。',
    furnitureId: 'furni_snowVenue_chair_01', unlockRegionIds: ['kjerag', 'sami'],
    events: [
      { id: 'ursus_survey_1', title: '气象牌出现两版读数', safe: '并列留档。', specialty: '辅助或术师核对仪器。', professions: ['SUPPORT', 'CASTER'], bonus: 'records' },
      { id: 'ursus_survey_2', title: '积雪遮住返程旗标', safe: '退回已知路牌。', specialty: '先锋或狙击确认连续旗标。', professions: ['PIONEER', 'SNIPER'], bonus: 'return' },
    ],
  },
  {
    id: 'victoria_station', regionId: 'victoria', name: '站台与档案',
    description: '核对伦蒂尼姆公共交通公告，归档可交换的城市路线资料。',
    furnitureId: 'furni_trainStation_bench_01', unlockRegionIds: ['kazimierz', 'laterano'],
    events: [
      { id: 'victoria_station_1', title: '线路牌缺角', safe: '注明待核。', specialty: '辅助或狙击对读相邻公告。', professions: ['SUPPORT', 'SNIPER'], bonus: 'records' },
      { id: 'victoria_station_2', title: '转运柜包裹错分', safe: '交回分拣台。', specialty: '先锋或特种沿开放服务通道回收。', professions: ['PIONEER', 'SPECIAL'], bonus: 'return' },
    ],
  },
  {
    id: 'columbia_facility', regionId: 'columbia', name: '设施标识',
    description: '整理特里蒙公开设施与民用物流标识，不进入封闭研究设施。',
    furnitureId: 'furni_cafe_chair_R_01', unlockRegionIds: ['rim_billiton', 'bolivar'],
    events: [
      { id: 'columbia_facility_1', title: '卸货门编号过时', safe: '登记差异。', specialty: '辅助或术师比对公开设备目录。', professions: ['SUPPORT', 'CASTER'], bonus: 'records' },
      { id: 'columbia_facility_2', title: '反光板遮住测绘标记', safe: '重新绕点。', specialty: '重装或近卫移动可调测量架。', professions: ['TANK', 'WARRIOR'], bonus: 'return' },
    ],
  },
  {
    id: 'kazimierz_venue', regionId: 'kazimierz', name: '场馆导向',
    description: '核对公共场馆人流导向、无障碍路线与开放时段，不参加骑士对抗。',
    furnitureId: 'furni_kazimierz_stool_01', unlockRegionIds: [],
    events: [
      { id: 'kazimierz_venue_1', title: '导向牌与公示冲突', safe: '按正式公告记录。', specialty: '辅助或狙击交叉确认。', professions: ['SUPPORT', 'SNIPER'], bonus: 'records' },
      { id: 'kazimierz_venue_2', title: '临时栏杆挡住推车', safe: '按公告绕行。', specialty: '重装或特种整理开放通道。', professions: ['TANK', 'SPECIAL'], bonus: 'return' },
    ],
  },
  {
    id: 'kjerag_lake', regionId: 'kjerag', name: '湖岸步道',
    description: '记录银心湖题材的公开步道、测距点和返程标志，不把站点当作原作新增地名。',
    furnitureId: 'furni_tradeLounge_lowchair_01', unlockRegionIds: [],
    events: [
      { id: 'kjerag_lake_1', title: '雾气遮住测距终点', safe: '记录可确认区间。', specialty: '狙击或术师复核远端标记。', professions: ['SNIPER', 'CASTER'], bonus: 'records' },
      { id: 'kjerag_lake_2', title: '积雪压住测绳', safe: '改走标注步道。', specialty: '近卫或重装清理允许通行的测点。', professions: ['WARRIOR', 'TANK'], bonus: 'return' },
    ],
  },
  {
    id: 'laterano_archive', regionId: 'laterano', name: '公开图册交接',
    description: '核对社区索引，接收跨区转交的公开港务图册，不暗示当地与伊比利亚接壤。',
    furnitureId: 'furni_NHL_sofa_01', unlockRegionIds: ['iberia'],
    events: [
      { id: 'laterano_archive_1', title: '图册版次缺失', safe: '只录可确认页。', specialty: '辅助或术师核对印记。', professions: ['SUPPORT', 'CASTER'], bonus: 'records' },
      { id: 'laterano_archive_2', title: '递送袋未标社区编号', safe: '送公开分拣台。', specialty: '先锋或特种核对可通行站点。', professions: ['PIONEER', 'SPECIAL'], bonus: 'return' },
    ],
  },
  {
    id: 'leithanien_canal', regionId: 'leithanien', name: '水尺与公告',
    description: '整理公共演出公告与运河水尺记录，不改写原作城市事件。',
    furnitureId: 'furni_nightView_celloChair_01', unlockRegionIds: ['minos', 'siracusa'],
    events: [
      { id: 'leithanien_canal_1', title: '公告页被风吹散', safe: '收集可辨页。', specialty: '辅助或术师核对版次和计时设备。', professions: ['SUPPORT', 'CASTER'], bonus: 'records' },
      { id: 'leithanien_canal_2', title: '水尺反光无法读数', safe: '改走另一观测点。', specialty: '重装或狙击固定遮光板并确认方向。', professions: ['TANK', 'SNIPER'], bonus: 'return' },
    ],
  },
  {
    id: 'siracusa_market', regionId: 'siracusa', name: '街区索引',
    description: '核对公开市场门牌与商户开放时段，不接帮派战斗委托。',
    furnitureId: 'furni_gangster_sofa_01', unlockRegionIds: [],
    events: [
      { id: 'siracusa_market_1', title: '摊位登记重复', safe: '保留两份差异。', specialty: '辅助或医疗复核时间与保存条件。', professions: ['SUPPORT', 'MEDIC'], bonus: 'records' },
      { id: 'siracusa_market_2', title: '旧桥名导致绕行', safe: '沿正式索引通行。', specialty: '先锋或特种确认开放支路。', professions: ['PIONEER', 'SPECIAL'], bonus: 'return' },
    ],
  },
  {
    id: 'iberia_coast', regionId: 'iberia', name: '岸上潮位',
    description: '从安全岸上观察点核对浮标编号与潮位牌，不安排下水战斗。',
    furnitureId: 'furni_shipRoom_bed_01', unlockRegionIds: ['aegir'],
    events: [
      { id: 'iberia_coast_1', title: '盐样包装受潮', safe: '封存样本并注明状态。', specialty: '医疗或辅助复核封装。', professions: ['MEDIC', 'SUPPORT'], bonus: 'records' },
      { id: 'iberia_coast_2', title: '潮痕遮住浮标编号', safe: '移至下一岸上观测点。', specialty: '狙击或先锋沿既有安全标记确认。', professions: ['SNIPER', 'PIONEER'], bonus: 'return' },
    ],
  },
  {
    id: 'sargon_supply', regionId: 'sargon', name: '渡口与补给',
    description: '登记公开渡口、补给点与跨区图册编号，不把城镇间旅行压成原作实际两小时。',
    furnitureId: 'furni_SargonFair_bed_01', unlockRegionIds: ['durin', 'hotlands'],
    events: [
      { id: 'sargon_supply_1', title: '水尺短时波动', safe: '记录区间。', specialty: '医疗或术师复核样本与读数。', professions: ['MEDIC', 'CASTER'], bonus: 'records' },
      { id: 'sargon_supply_2', title: '转运标签掉落在侧道', safe: '送待核目录台。', specialty: '先锋或特种沿开放路径取回。', professions: ['PIONEER', 'SPECIAL'], bonus: 'return' },
    ],
  },
  {
    id: 'sami_forest', regionId: 'sami', name: '林地样本',
    description: '沿连续旗标记录雪线、样本状态和可见返程点，不突破未知危险区。',
    furnitureId: 'furni_samiRoom_bed_01', unlockRegionIds: ['infy_ice'],
    events: [
      { id: 'sami_forest_1', title: '保温袋封口松开', safe: '重新封装并记录途中时间。', specialty: '医疗或术师检查保存条件。', professions: ['MEDIC', 'CASTER'], bonus: 'records' },
      { id: 'sami_forest_2', title: '两条足迹通向同一测点', safe: '走公开标记路线。', specialty: '先锋或狙击确认下一面旗。', professions: ['PIONEER', 'SNIPER'], bonus: 'return' },
    ],
  },
];
