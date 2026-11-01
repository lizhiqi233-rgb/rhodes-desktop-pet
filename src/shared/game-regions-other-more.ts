import type { ExplorationRoute } from './gameplay.ts';

export const OTHER_MORE_ROUTES: ExplorationRoute[] = [
  {
    id: 'bolivar_promenade', regionId: 'bolivar', name: '海滨公共地图',
    description: '整理多索雷斯题材的公共路线、摊位图与步道公告，不介入阵营冲突。',
    furnitureId: 'furni_bolivar_bed_01', unlockRegionIds: ['siesta'],
    events: [
      { id: 'bolivar_promenade_1', title: '摊位图仍用旧版', safe: '记录变化。', specialty: '辅助或狙击对读固定路牌。', professions: ['SUPPORT', 'SNIPER'], bonus: 'records' },
      { id: 'bolivar_promenade_2', title: '木板步道部分封闭', safe: '走已公布的平地绕行线。', specialty: '重装或特种核对开放栈道。', professions: ['TANK', 'SPECIAL'], bonus: 'return' },
    ],
  },
  {
    id: 'rim_billiton_tracks', regionId: 'rim_billiton', name: '旧轨道清册',
    description: '核对矿区外围货运标识和旧轨道编号，不进入矿井。',
    furnitureId: 'furni_rabbitTown_workStool_01', unlockRegionIds: ['kazdel'],
    events: [
      { id: 'rim_billiton_tracks_1', title: '站点白板漏记搬运记录', safe: '注明待核。', specialty: '辅助或术师核对仓单与计时牌。', professions: ['SUPPORT', 'CASTER'], bonus: 'records' },
      { id: 'rim_billiton_tracks_2', title: '检查车偏离停放标线', safe: '走步行检查线。', specialty: '重装或特种从安全侧固定车辆。', professions: ['TANK', 'SPECIAL'], bonus: 'return' },
    ],
  },
  {
    id: 'minos_steps', regionId: 'minos', name: '石阶与水尺',
    description: '对读公开水尺、渡口与石砌方向标记，不新增古国政治设定。',
    furnitureId: 'furni_village_stool_01', unlockRegionIds: [],
    events: [
      { id: 'minos_steps_1', title: '方向符号有两种读法', safe: '拓印而不猜测。', specialty: '辅助或狙击核对公开地名表。', professions: ['SUPPORT', 'SNIPER'], bonus: 'records' },
      { id: 'minos_steps_2', title: '落叶遮住可触及的刻度', safe: '换到下一测点。', specialty: '近卫或重装清理安全位置。', professions: ['WARRIOR', 'TANK'], bonus: 'return' },
    ],
  },
  {
    id: 'higashi_streets', regionId: 'higashi', name: '节会路标',
    description: '核对公开街区图、灯标与节会步道；任务不是原作新剧情。',
    furnitureId: 'furni_higashiYard_seat_01', unlockRegionIds: [],
    events: [
      { id: 'higashi_streets_1', title: '地图保留旧桥名', safe: '并列留档。', specialty: '辅助或术师对读新旧版次。', professions: ['SUPPORT', 'CASTER'], bonus: 'records' },
      { id: 'higashi_streets_2', title: '夜间一段灯标未亮', safe: '走亮灯主道。', specialty: '先锋或狙击确认连续路牌。', professions: ['PIONEER', 'SNIPER'], bonus: 'return' },
    ],
  },
  {
    id: 'kazdel_signs', regionId: 'kazdel', name: '公共路线牌',
    description: '记录可辨认的道路和公开可通行旧设施，不安排军事冲突。',
    furnitureId: 'furni_ScarMarket_stool_01', unlockRegionIds: [],
    events: [
      { id: 'kazdel_signs_1', title: '归还箱混有未登记物件', safe: '整箱封存。', specialty: '辅助或医疗整理标签与保存状态。', professions: ['SUPPORT', 'MEDIC'], bonus: 'records' },
      { id: 'kazdel_signs_2', title: '一块旧路牌倒伏', safe: '记录位置后绕行。', specialty: '重装或近卫稳固允许处理的底座。', professions: ['TANK', 'WARRIOR'], bonus: 'return' },
    ],
  },
  {
    id: 'aegir_buoys', regionId: 'aegir', name: '回收浮标资料',
    description: '在可抵达的安全调查站整理阿戈尔水文资料与回收坐标，不把阿戈尔都设为陆上城市。',
    furnitureId: 'furni_skadisp_bed_01', unlockRegionIds: [],
    events: [
      { id: 'aegir_buoys_1', title: '测深仪两次读数不同', safe: '保留读数区间。', specialty: '术师或辅助校验设备与历史记录。', professions: ['CASTER', 'SUPPORT'], bonus: 'records' },
      { id: 'aegir_buoys_2', title: '牵引线缠在回收架外侧', safe: '停在安全点等待。', specialty: '重装或特种从固定侧处理。', professions: ['TANK', 'SPECIAL'], bonus: 'return' },
    ],
  },
  {
    id: 'durin_lifts', regionId: 'durin', name: '升降点记录',
    description: '核对公开升降点、照明标记与上下层班次，不凭空新增原作城市。',
    furnitureId: 'furni_cabin_bed_01', unlockRegionIds: [],
    events: [
      { id: 'durin_lifts_1', title: '灯标反光让方向难辨', safe: '按连续地面标线记录。', specialty: '术师或狙击对读灯标。', professions: ['CASTER', 'SNIPER'], bonus: 'records' },
      { id: 'durin_lifts_2', title: '队列牌漏记一班', safe: '等候下一班。', specialty: '先锋或辅助核对两层公示。', professions: ['PIONEER', 'SUPPORT'], bonus: 'return' },
    ],
  },
  {
    id: 'siesta_observation', regionId: 'siesta', name: '海滨观测牌',
    description: '整理汐斯塔题材的公开海滨与火山观察资料，不指定原作灾害的前后时间线。',
    furnitureId: 'furni_outdoor_chair_01', unlockRegionIds: [],
    events: [
      { id: 'siesta_observation_1', title: '盐雾遮住天气牌', safe: '注明缺字。', specialty: '医疗或辅助核对上次记录。', professions: ['MEDIC', 'SUPPORT'], bonus: 'records' },
      { id: 'siesta_observation_2', title: '读数需从坡道另一端复核', safe: '走公开步道。', specialty: '先锋或狙击确认开放回路。', professions: ['PIONEER', 'SNIPER'], bonus: 'return' },
    ],
  },
  {
    id: 'infy_ice_markers', regionId: 'infy_ice', name: '冰原边缘观测',
    description: '从自拟边缘标尺站沿已立旗标前往安全观测点，再原路返营，不编造冰原原住民城市。',
    furnitureId: 'furni_snowVenue_stool_01', unlockRegionIds: [],
    events: [
      { id: 'infy_ice_markers_1', title: '样本袋开始结霜', safe: '封存并注明状态。', specialty: '医疗或术师核验保存条件。', professions: ['MEDIC', 'CASTER'], bonus: 'records' },
      { id: 'infy_ice_markers_2', title: '新雪掩住下一面旗', safe: '退回最近已知标尺。', specialty: '先锋或狙击沿已有旗标复核。', professions: ['PIONEER', 'SNIPER'], bonus: 'return' },
    ],
  },
  {
    id: 'hotlands_shelter', regionId: 'hotlands', name: '阴坡补给调查',
    description: '在自拟阴坡标记、峡沟测点和临时回收站记录通风与安全饮水，不编造原作城市或当地干员。',
    furnitureId: 'furni_volcaRoom_chair_01', unlockRegionIds: [],
    events: [
      { id: 'hotlands_shelter_1', title: '水量牌与箱单不一致', safe: '采用可确认的保守读数。', specialty: '医疗或辅助复核标签。', professions: ['MEDIC', 'SUPPORT'], bonus: 'records' },
      { id: 'hotlands_shelter_2', title: '午后路段暴露时间过长', safe: '按公开阴坡路线返回。', specialty: '重装或特种分拆固定采样箱。', professions: ['TANK', 'SPECIAL'], bonus: 'return' },
    ],
  },
];
