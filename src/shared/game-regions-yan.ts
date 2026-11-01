import type { ExplorationRoute } from './gameplay.ts';

export const YAN_ROUTES: ExplorationRoute[] = [
  {
    id: 'yan_lungmen', regionId: 'yan', name: '龙门',
    description: '核对公开街区图与递送站点，整理外区联络资料；不介入原作角色剧情。',
    furnitureId: 'furni_RhodesRabbit_sofa_01', unlockRegionIds: ['higashi', 'columbia'],
    events: [
      { id: 'yan_lungmen_1', title: '货箱巷号与登记册不一致', safe: '送公共核对点复核。', specialty: '辅助复核两版清单。', professions: ['SUPPORT'], bonus: 'records' },
      { id: 'yan_lungmen_2', title: '施工挡住原递送口', safe: '沿公告绕行。', specialty: '先锋或特种确认开放侧道。', professions: ['PIONEER', 'SPECIAL'], bonus: 'return' },
    ],
  },
  {
    id: 'yan_shangshu', regionId: 'yan', name: '尚蜀',
    description: '记录山径驿点、溪桥测绳和可复核的公开路标。',
    furnitureId: 'furni_TianshiMansion_bench_01', unlockRegionIds: ['sargon', 'leithanien'],
    events: [
      { id: 'yan_shangshu_1', title: '测量标记被水流移动', safe: '保留偏差记录。', specialty: '狙击或术师对读参照点。', professions: ['SNIPER', 'CASTER'], bonus: 'records' },
      { id: 'yan_shangshu_2', title: '运输箱卡在桥侧', safe: '改走固定便道。', specialty: '重装或近卫稳定轻型运输架。', professions: ['TANK', 'WARRIOR'], bonus: 'return' },
    ],
  },
  {
    id: 'yan_yumen', regionId: 'yan', name: '玉门',
    description: '核对荒路补给标记、饮水标签和返程可见路牌。',
    furnitureId: 'furni_s1_bed_01', unlockRegionIds: ['ursus', 'victoria'],
    events: [
      { id: 'yan_yumen_1', title: '水量牌被风沙遮盖', safe: '注明缺字。', specialty: '医疗或辅助核验箱单。', professions: ['MEDIC', 'SUPPORT'], bonus: 'records' },
      { id: 'yan_yumen_2', title: '测量箱固定绳松动', safe: '分批转运。', specialty: '重装或特种重新固定。', professions: ['TANK', 'SPECIAL'], bonus: 'return' },
    ],
  },
];
