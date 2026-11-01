import type { Specialty } from '../../shared/gameplay.ts';
import type { OperatorSource } from './types.ts';
import { applySkinGameplayMetadata, SKIN_GAMEPLAY_METADATA_COUNTS } from './skin-gameplay-metadata.ts';

// Current operator relationships and base skills from the pinned ArknightsGameData tables.
export const GAMEPLAY_METADATA_SOURCE = 'https://github.com/Kengxxiao/ArknightsGameData/tree/fe7d8d05edc36cf5678a24bfe9e84e891f6cf7ad/zh_CN/gamedata/excel';
export const GAMEPLAY_METADATA_COUNTS = { operators: 432, familyGroups: 38, specialties: 404, unmappedSpecialties: 28, ...SKIN_GAMEPLAY_METADATA_COUNTS } as const;

// Families use char_meta_table.spCharGroups plus char_patch_table.infos for Amiya forms.
const FAMILY_ROWS = [
  'char_002_amiya char_1001_amiya2 char_1037_amiya3',
  'char_003_kalts char_1052_kalts2',
  'char_010_chen char_1013_chen2 char_1050_chen3',
  'char_017_huang char_1040_blaze2',
  'char_102_texas char_1028_texas2',
  'char_103_angel char_1041_angel2',
  'char_108_silent char_1031_slent2',
  'char_112_siege char_1019_siege2',
  'char_113_cqbw char_1035_wisdel',
  'char_115_headbr char_1051_headb2',
  'char_120_hibisc char_1024_hbisc2',
  'char_121_lava char_1011_lava2',
  'char_123_fang char_1036_fang2',
  'char_124_kroos char_1021_kroos2',
  'char_135_halo char_1047_halo2',
  'char_136_hsguma char_1044_hsgma2',
  'char_140_whitew char_1038_whitw2',
  'char_143_ghost char_1023_ghost2',
  'char_148_nearl char_1014_nearl2',
  'char_172_svrash char_1045_svash2',
  'char_174_slbell char_1046_sbell2',
  'char_180_amgoat char_1016_agoat2',
  'char_181_flower char_1022_flwr2',
  'char_187_ccheal char_1026_gvial2',
  'char_235_jesica char_1034_jesca2',
  'char_250_phatom char_1042_phatm2',
  'char_253_greyy char_1027_greyy2',
  'char_261_sddrag char_1020_reed2',
  'char_263_skadi char_1012_skadi2',
  'char_278_orchid char_1048_orchd2',
  'char_279_excu char_1032_excu2',
  'char_282_catap char_1049_catap2',
  'char_291_aglina char_1015_aglna2',
  'char_293_thorns char_1039_thorn2',
  'char_306_leizi char_1043_leizi2',
  'char_308_swire char_1033_swire2',
  'char_500_noirc char_1030_noirc2',
  'char_502_nblade char_1029_yato2',
];
// Specialty uses the first PHASE_0 level-1 skill in buffChar slot order; only its room is mapped.
const SPECIALTY_ROWS: Record<Specialty, string> = {
  supplies: `char_003_kalts char_1019_siege2 char_102_texas char_1032_excu2 char_1033_swire2 char_1034_jesca2
char_1036_fang2 char_1039_thorn2 char_103_angel char_1042_phatm2 char_1047_halo2 char_1051_headb2
char_1052_kalts2 char_108_silent char_109_fmout char_110_deepcl char_117_myrrh char_122_beagle
char_123_fang char_124_kroos char_126_shotst char_127_estell char_128_plosis char_129_bluep
char_131_flameb char_135_halo char_140_whitew char_141_nights char_1502_crosly char_150_snakek
char_151_myrtle char_163_hpsts char_172_svrash char_180_amgoat char_181_flower char_185_frncat
char_187_ccheal char_190_clour char_196_sunbr char_198_blackd char_199_yak char_2013_cerber
char_2014_nian char_201_moeshd char_2025_shu char_208_melan char_209_ardign char_210_stward
char_211_adnach char_214_kafka char_219_meteo char_226_hmau char_230_savage char_235_jesica
char_237_gravel char_240_wyvern char_241_panda char_242_otter char_243_waaifu char_248_mgllan
char_252_bibeak char_254_vodfox char_271_spikes char_272_strong char_277_sqrrel char_281_popka
char_282_catap char_283_midn char_284_spot char_289_gyuki char_290_vigna char_293_thorns
char_301_cutter char_311_mudrok char_325_bison char_328_cammou char_332_archet char_336_folivo
char_345_folnic char_346_aosta char_348_ceylon char_349_chiave char_363_toddi char_365_aprl
char_369_bena char_373_lionhd char_378_asbest char_379_sesa char_381_bubble char_383_snsant
char_391_rosmon char_400_weedy char_4011_lessng char_4019_ncdeer char_402_tuye char_4032_provs
char_4037_demetr char_4039_horn char_4040_rockr char_4041_chnut char_4045_heidi char_4046_ebnhlz
char_4048_doroth char_4054_malist char_4055_bgsnow char_4056_titi char_4058_pepe char_4062_totter
char_4063_quartz char_4066_highmo char_4067_lolxh char_4072_ironmn char_4077_palico char_4078_bdhkgt
char_4083_chimes char_4088_hodrer char_4091_ulika char_4105_almond char_4106_bryota char_4107_vrdant
char_4116_blkkgt char_4117_ray char_4119_wanqin char_4130_luton char_4137_udflow char_4138_narant
char_4140_lasher char_4141_marcil char_4144_chilc char_4147_mitm char_4155_talr char_4162_cathy
char_4163_rosesa char_4164_tecno char_4165_ctrail char_416_zumama char_4171_wulfen char_4173_nowell
char_4178_alanna char_4191_tippi char_4193_lemuen char_4198_christ char_4203_kichi char_4204_mantra
char_4207_branch char_4208_wintim char_4211_snhunt char_4212_nasti char_4213_skybx char_421_crow
char_4221_ju char_4222_taraxa char_4223_botany char_4229_aphris char_4230_mcnist char_4236_tmslot
char_4237_jcinta char_423_blemsh char_431_ashlok char_433_windft char_437_mizuki char_440_pinecn
char_446_aroma char_449_glider char_452_bstalk char_464_cement char_478_kirara char_484_robrta
char_485_pallas char_486_takila char_488_buildr char_489_serum char_491_humus char_493_firwhl
char_496_wildmn char_499_kaitou char_500_noirc char_502_nblade`,
  records: `char_002_amiya char_009_12fce char_010_chen char_1011_lava2 char_1015_aglna2 char_1021_kroos2
char_1024_hbisc2 char_1029_yato2 char_1030_noirc2 char_1035_wisdel char_1040_blaze2 char_1044_hsgma2
char_1045_svash2 char_1048_orchd2 char_1050_chen3 char_118_yuki char_130_doberm char_133_mm
char_144_red char_148_nearl char_149_scave char_155_tiger char_158_milu char_197_poca
char_2012_typhon char_2015_dusk char_2023_ling char_2024_chyue char_2027_wang char_202_demkni
char_206_gnosis char_213_mostma char_225_haak char_236_rope char_274_astesi char_275_breeze
char_291_aglina char_294_ayer char_304_zebra char_306_leizi char_308_swire char_322_lmlee
char_367_swllow char_4013_kjera char_4016_kazema char_4017_puzzle char_401_elysm char_4023_rfalcn
char_4026_vulpis char_4027_heyak char_4031_liesel char_4036_forcer char_4052_surfer char_405_absin
char_4064_mlynar char_4071_peper char_4098_vvana char_4100_caper char_4102_threye char_4104_coldst
char_4114_harold char_4131_odda char_4132_ascln char_4134_cetsyr char_4142_laios char_4166_varkis
char_4179_monstr char_4182_oblvns char_4183_mortis char_4184_dolris char_4185_amoris char_4186_tmoris
char_4194_rmixer char_4195_radian char_4199_makiri char_420_flamtl char_4217_makoto char_4228_closur
char_4231_clemnt char_427_vigil char_445_wscoot char_456_ash char_457_blitz char_458_rfrost
char_459_tachak char_474_glady char_492_quercu char_497_ctable`,
  support: `char_017_huang char_1012_skadi2 char_1013_chen2 char_1014_nearl2 char_1016_agoat2 char_101_sora
char_1020_reed2 char_1022_flwr2 char_1023_ghost2 char_1026_gvial2 char_1027_greyy2 char_1028_texas2
char_1038_whitw2 char_1041_angel2 char_1043_leizi2 char_1049_catap2 char_106_franka char_107_liskam
char_112_siege char_113_cqbw char_115_headbr char_120_hibisc char_121_lava char_134_ifrit
char_136_hsguma char_137_brownb char_143_ghost char_147_shining char_154_morgan char_157_dagda
char_159_peacok char_164_nightm char_166_skfire char_171_bldsk char_173_slchan char_174_slbell
char_179_cgbird char_188_helage char_192_falco char_193_frostl char_194_leto char_195_glassb
char_2026_yu char_204_platnm char_212_ansel char_215_mantic char_218_cuttle char_220_grani
char_222_bpipe char_245_cello char_249_mlyss char_250_phatom char_253_greyy char_258_podego
char_260_durnar char_261_sddrag char_263_skadi char_265_sophia char_279_excu char_285_medic2
char_286_cast3 char_297_hamoni char_298_susuro char_300_phenxi char_302_glaze char_326_glacus
char_333_sidero char_338_iris char_340_shwaz char_341_sntlla char_344_beewax char_347_jaksel
char_350_surtr char_356_broca char_358_lisa char_362_saga char_376_therex char_377_gdglow
char_385_finlpp char_388_mint char_394_hadiya char_4000_jnight char_4004_pudd char_4006_melnte
char_4009_irene char_4010_etlchi char_4014_lunacu char_4015_spuria char_4025_aprot2 char_4042_lumen
char_4043_erato char_4047_pianst char_4051_akkord char_4079_haini char_4081_warmy char_4082_qiubai
char_4093_frston char_411_tomimi char_4121_zuole char_4122_grabds char_4123_ela char_4124_iana
char_4125_rdoc char_4126_fuze char_4133_logos char_4136_phonor char_4139_papyrs char_4143_sensi
char_4145_ulpia char_4146_nymph char_4148_philae char_415_flint char_4187_graceb char_4188_confes
char_4196_reckpr char_4202_haruka char_4214_cairn char_4215_buddy char_4218_aigis char_4220_kormr
char_4225_tanya char_4226_veen char_4227_gallus char_422_aurora char_4234_pedro char_4235_thumpy
char_426_billro char_430_fartth char_450_necras char_451_robin char_469_indigo char_472_pasngr
char_475_akafyu char_476_blkngt char_479_sleach char_487_bobb char_494_vendla char_501_durin`,
};
const UNMAPPED_SPECIALTY_IDS = `char_1031_slent2 char_1046_sbell2 char_145_prove char_183_skgoat char_264_f12yin char_278_orchid
char_337_utage char_343_tknogi char_355_ethan char_366_acdrop char_393_toledo char_4065_judge
char_4080_lin char_4087_ines char_4109_baslin char_4110_delphn char_4151_tinman char_4172_xingzh
char_4177_brigid char_4219_yukari char_4224_turdus char_4232_hbound char_436_whispr char_455_nothin
char_466_qanik char_473_mberry char_498_inside char_503_rang`;

const trustGroups = new Map<string, string>();
for (const row of FAMILY_ROWS) {
  const [groupId, ...members] = row.split(/\s+/);
  for (const member of members) trustGroups.set(member, groupId!);
}
const specialtyByOperator = new Map<string, Specialty>();
for (const specialty of ['supplies', 'records', 'support'] as const) {
  for (const id of SPECIALTY_ROWS[specialty].split(/\s+/)) if (id) specialtyByOperator.set(id, specialty);
}
const unsupportedSpecialties = new Set(UNMAPPED_SPECIALTY_IDS.split(/\s+/).filter(Boolean));

export function applyGameplayMetadata(operators: OperatorSource[]): void {
  for (const operator of operators) {
    operator.trustGroupId = trustGroups.get(operator.id) ?? operator.id;
    operator.specialty = specialtyByOperator.get(operator.id) ?? null;
    operator.specialtyReason = operator.specialty ? null : unsupportedSpecialties.has(operator.id)
      ? 'No supported first base skill maps to a specialty for this operator.'
      : 'No bundled base-skill fact exists for this operator ID.';
    applySkinGameplayMetadata(operator);
  }
}
