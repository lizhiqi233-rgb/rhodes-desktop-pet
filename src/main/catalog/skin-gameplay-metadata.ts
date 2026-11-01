import type { OperatorSource } from './types.ts';

// PRTS |价格 keeps its original amount (first number of e.g. 18→15), matched by exact operator and skin names.
// Category and voiceId facts: ArknightsGameData fe7d8d05 (26-10-22); PRTS gallery: https://prts.wiki/w/%E6%97%B6%E8%A3%85%E5%9B%9E%E5%BB%8A (25 series pages, 2026-10-27).
export const SKIN_GAMEPLAY_METADATA_COUNTS = { originalPrices: 401, eventSkins: 111, specialSkins: 14, voiceIds: 22 } as const;

const ORIGINAL_PRICE_ROWS = `
  char_003_kalts@boc#6=24 char_010_chen@nian#2=18 char_017_huang@as#1=18 char_017_huang@witch#5=18 char_1001_amiya2@casc#1=18 char_1001_amiya2@sale#16=24
  char_101_sora@epoque#17=18 char_101_sora@summer#1=18 char_1011_lava2@nian#6=18 char_1012_skadi2@boc#4=21 char_1012_skadi2@iteration#2=24 char_1013_chen2@boc#6=21
  char_1013_chen2@summer#20=21 char_1014_nearl2@epoque#17=21 char_1016_agoat2@epoque#34=24 char_1016_agoat2@epoque#57=24 char_1019_siege2@epoque#50=21 char_102_texas@epoque#7=15
  char_102_texas@winter#1=18 char_1020_reed2@epoque#30=21 char_1020_reed2@snow#8=18 char_1020_reed2@summer#17=21 char_1021_kroos2@game#3=18 char_1021_kroos2@nian#8=18
  char_1023_ghost2@boc#6=21 char_1024_hbisc2@unveiling#2=18 char_1026_gvial2@summer#12=21 char_1027_greyy2@breaker#1=18 char_1027_greyy2@snow#5=15 char_1028_texas2@epoque#36=21
  char_1028_texas2@iteration#1=21 char_103_angel@wild#1=18 char_1031_slent2@epoque#32=18 char_1032_excu2@sale#12=24 char_1032_excu2@sanrio#2=18 char_1033_swire2@ambienceSynesthesia#4=18
  char_1033_swire2@nlc#1=18 char_1034_jesca2@cfa#1=18 char_1035_wisdel@sale#14=24 char_1036_fang2@snow#8=18 char_1037_amiya3@sale#13=21 char_1038_whitw2@sale#15=24
  char_1039_thorn2@marthe#9=21 char_1040_blaze2@nlc#1=18 char_1040_blaze2@winter#5=18 char_1041_angel2@iteration#6=27 char_1042_phatm2@sightseer#4=21 char_1043_leizi2@game#8=18
  char_1044_hsgma2@whirlwind#11=21 char_1046_sbell2@ambienceSynesthesia#8=21 char_106_franka@ncg#1=18 char_107_liskam@nian#2=15 char_107_liskam@striker#1=18 char_108_silent@sweep#1=15
  char_112_siege@striker#2=18 char_113_cqbw@epoque#7=18 char_115_headbr@it#1=15 char_115_headbr@marthe#2=18 char_118_yuki@boc#2=15
  char_124_kroos@witch#1=18 char_128_plosis@yun#4=18 char_129_bluep@iteration#2=18 char_130_doberm@epoque#7=15 char_131_flameb@summer#8=18
  char_133_mm@summer#20=18 char_134_ifrit@rilakkuma#1=18 char_134_ifrit@summer#1=18 char_135_halo@epoque#25=18 char_136_hsguma@nian#3=18 char_137_brownb@kitchen#1=15
  char_140_whitew@boc#1=18 char_141_nights@breaker#1=18 char_143_ghost@winter#1=18 char_144_red@summer#6=18 char_145_prove@summer#3=15 char_147_shining@summer#1=18
  char_148_nearl@summer#2=18 char_149_scave@striker#2=15 char_150_snakek@wild#1=18 char_150_snakek@yun#7=18 char_1502_crosly@iteration#5=18 char_151_myrtle@summer#12=18
  char_151_myrtle@taiko#1=18 char_155_tiger@striker#2=18 char_158_milu@snow#2=15 char_158_milu@wild#2=18 char_164_nightm@unveiling#2=18 char_166_skfire@summer#1=18
  char_171_bldsk@witch#1=18 char_172_svrash@ambienceSynesthesia#4=21 char_172_svrash@snow#1=18 char_172_svrash@summer#4=18 char_173_slchan@wild#1=18 char_174_slbell@snow#1=15
  char_179_cgbird@sightseer#1=21 char_179_cgbird@witch#1=18 char_180_amgoat@sanrio#2=18 char_180_amgoat@summer#5=18 char_181_flower@epoque#9=15 char_185_frncat@wild#7=15
  char_187_ccheal@epoque#2=15 char_188_helage@boc#2=18 char_194_leto@sightseer#4=18 char_195_glassb@kitchen#1=18 char_196_sunbr@summer#1=18 char_197_poca@epoque#12=18
  char_197_poca@rilakkuma#1=18 char_198_blackd@as#1=15 char_198_blackd@winter#1=18 char_201_moeshd@summer#4=15 char_2012_typhon@summer#17=18 char_2013_cerber@summer#4=18
  char_2013_cerber@whirlwind#2=18 char_2014_nian@cfa#1=21 char_2014_nian@nian#4=18 char_2015_dusk@nian#12=21 char_2015_dusk@nian#7=21 char_202_demkni@ambienceSynesthesia#7=21
  char_202_demkni@boc#1=18 char_202_demkni@test#1=18 char_2023_ling@ncg#1=21 char_2023_ling@nian#12=24 char_2023_ling@nian#9=21 char_2024_chyue@cfa#1=24
  char_2024_chyue@nian#10=21 char_2025_shu@nian#11=21 char_2025_shu@nlc#1=21 char_2026_yu@nian#12=21 char_204_platnm@summer#3=15 char_206_gnosis@boc#4=18
  char_213_mostma@ambienceSynesthesia#6=18 char_213_mostma@epoque#5=18 char_214_kafka@snow#3=15 char_215_mantic@epoque#19=18 char_218_cuttle@epoque#12=15 char_219_meteo@summer#22=18
  char_219_meteo@sweep#1=18 char_220_grani@epoque#6=18 char_222_bpipe@epoque#28=18 char_222_bpipe@epoque#40=18 char_225_haak@nian#4=18 char_226_hmau@nian#4=15
  char_235_jesica@sweep#1=15 char_235_jesica@wild#2=15 char_236_rope@summer#2=15 char_237_gravel@winter#2=15 char_241_panda@marthe#1=15 char_241_panda@nian#7=15
  char_242_otter@ghost#1=18 char_243_waaifu@whirlwind#2=18 char_245_cello@sale#12=24 char_248_mgllan@kitchen#1=18 char_249_mlyss@ambienceSynesthesia#6=21 char_249_mlyss@boc#8=24
  char_250_phatom@ghost#1=18 char_252_bibeak@winter#2=18 char_254_vodfox@witch#2=18 char_254_vodfox@yun#8=18 char_260_durnar@epoque#42=18 char_261_sddrag@ambienceSynesthesia#2=15
  char_263_skadi@marthe#5=18 char_263_skadi@summer#3=18 char_264_f12yin@boc#3=18 char_264_f12yin@epoque#15=18 char_265_sophia@epoque#11=18 char_271_spikes@unveiling#1=18
  char_271_spikes@winter#2=18 char_272_strong@summer#6=15 char_274_astesi@epoque#5=15 char_274_astesi@shining#1=15 char_275_breeze@unveiling#4=18 char_279_excu@boc#1=18
  char_281_popka@sale#18=18 char_281_popka@witch#5=18 char_283_midn@boc#1=15 char_289_gyuki@epoque#40=18 char_290_vigna@as#1=15 char_290_vigna@summer#1=18
  char_291_aglina@boc#1=18 char_291_aglina@summer#5=18 char_293_thorns@boc#8=18 char_293_thorns@it#1=18 char_294_ayer@boc#3=15 char_297_hamoni@epoque#24=18
  char_297_hamoni@unveiling#1=18 char_300_phenxi@boc#9=18 char_300_phenxi@witch#4=18 char_304_zebra@wild#6=18 char_306_leizi@game#3=18 char_308_swire@nian#2=18
  char_311_mudrok@ambienceSynesthesia#2=18 char_311_mudrok@summer#6=18 char_322_lmlee@sanrio#1=18 char_322_lmlee@witch#3=21 char_326_glacus@ghost#1=15 char_328_cammou@summer#22=18
  char_332_archet@sale#14=21 char_332_archet@shining#1=18 char_333_sidero@summer#6=15 char_336_folivo@epoque#22=18 char_338_iris@witch#3=18 char_340_shwaz@snow#1=18
  char_340_shwaz@striker#1=18 char_343_tknogi@epoque#9=18 char_343_tknogi@snow#6=18 char_344_beewax@epoque#9=18 char_344_beewax@summer#11=18 char_345_folnic@wild#4=15
  char_346_aosta@game#2=18 char_350_surtr@ambienceSynesthesia#6=21 char_350_surtr@it#1=18 char_350_surtr@summer#9=21 char_358_lisa@epoque#22=18 char_358_lisa@lxh#1=18
  char_358_lisa@wild#3=18 char_362_saga@sale#9=18 char_365_aprl@wild#3=15 char_367_swllow@boc#1=15 char_369_bena@epoque#38=18 char_373_lionhd@snow#3=18
  char_373_lionhd@wild#3=18 char_377_gdglow@sanrio#1=18 char_377_gdglow@snow#5=18 char_377_gdglow@summer#12=21 char_379_sesa@game#5=18 char_383_snsant@witch#2=15
  char_388_mint@epoque#22=18 char_388_mint@epoque#30=18 char_391_rosmon@epoque#17=21 char_391_rosmon@sale#16=21 char_400_weedy@sightseer#1=18 char_400_weedy@snow#2=18
  char_4006_melnte@epoque#33=18 char_4009_irene@ambienceSynesthesia#3=18 char_4009_irene@game#3=18 char_401_elysm@snow#2=18 char_401_elysm@summer#9=18 char_4010_etlchi@winter#5=21
  char_4011_lessng@whirlwind#7=18 char_4013_kjera@epoque#18=18 char_4014_lunacu@yun#1=18 char_4016_kazema@witch#3=15 char_4017_puzzle@epoque#29=18 char_402_tuye@epoque#14=15
  char_4025_aprot2@whirlwind#5=18 char_4026_vulpis@epoque#55=18 char_4027_heyak@ambienceSynesthesia#4=18 char_4027_heyak@epoque#50=18 char_4032_provs@summer#17=18 char_4032_provs@wild#7=18
  char_4036_forcer@epoque#20=18 char_4039_horn@epoque#24=18 char_4040_rockr@lxh#1=18 char_4042_lumen@ambienceSynesthesia#3=18 char_4042_lumen@sanrio#2=18 char_4043_erato@snow#5=18
  char_4045_heidi@epoque#24=18 char_4046_ebnhlz@boc#6=18 char_4047_pianst@wild#8=18 char_4048_doroth@witch#4=18 char_405_absin@epoque#28=18 char_4052_surfer@nian#12=18
  char_4054_malist@summer#14=18 char_4055_bgsnow@wild#7=21 char_4055_bgsnow@yun#7=18 char_4058_pepe@sightseer#2=21 char_4062_totter@summer#17=18 char_4064_mlynar@epoque#28=24
  char_4064_mlynar@iteration#3=18 char_4065_judge@epoque#33=18 char_4065_judge@snow#6=18 char_4066_highmo@epoque#45=18 char_4066_highmo@nian#10=18 char_4071_peper@whirlwind#5=18
  char_4072_ironmn@ambienceSynesthesia#5=18 char_4072_ironmn@summer#11=18 char_4077_palico@mh#1=18 char_4078_bdhkgt@yun#2=18 char_4079_haini@epoque#45=18 char_4080_lin@littlePony#1=18
  char_4080_lin@nian#10=21 char_4080_lin@summer#19=21 char_4081_warmy@winter#4=18 char_4082_qiubai@epoque#31=18 char_4082_qiubai@ncg#1=18 char_4083_chimes@yun#5=18
  char_4087_ines@ambienceSynesthesia#5=21 char_4087_ines@boc#8=21 char_4088_hodrer@sightseer#1=18 char_4091_ulika@sanrio#1=18 char_4098_vvana@epoque#40=18 char_4102_threye@epoque#42=18
  char_4104_coldst@striker#3=18 char_4105_almond@epoque#38=18 char_4106_bryota@epoque#34=18 char_4109_baslin@witch#5=18 char_411_tomimi@summer#5=18 char_4114_harold@snow#7=18
  char_4116_blkkgt@witch#5=21 char_4117_ray@shining#2=18 char_4117_ray@summer#22=18 char_4119_wanqin@epoque#41=18 char_4121_zuole@nian#11=21 char_4121_zuole@sale#16=18
  char_4122_grabds@yun#3=18 char_4123_ela@rainbow6#2=18 char_4124_iana@rainbow6#2=18 char_4125_rdoc@rainbow6#2=18 char_4130_luton@yun#6=18 char_4132_ascln@iteration#4=21
  char_4133_logos@ambienceSynesthesia#6=21 char_4134_cetsyr@epoque#50=24 char_4137_udflow@epoque#46=18 char_4138_narant@breaker#1=18 char_4138_narant@littlePony#1=18 char_4139_papyrs@game#8=18
  char_4140_lasher@sightseer#3=18 char_4141_marcil@dungeon#1=18 char_4145_ulpia@epoque#48=18 char_4146_nymph@ambienceSynesthesia#6=18 char_4146_nymph@epoque#42=18 char_4147_mitm@breaker#1=18
  char_4148_philae@nian#12=18 char_415_flint@boc#3=15 char_4155_talr@yun#9=18 char_416_zumama@boc#3=18 char_4163_rosesa@game#7=18 char_4165_ctrail@yun#11=18
  char_4172_xingzh@epoque#51=18 char_4173_nowell@iteration#6=18 char_4177_brigid@epoque#53=18 char_4179_monstr@boc#11=21 char_4182_oblvns@avemujica#1=18 char_4183_mortis@avemujica#1=18
  char_4184_dolris@avemujica#1=18 char_4185_amoris@avemujica#1=18 char_4186_tmoris@avemujica#1=18 char_4187_graceb@boc#11=18 char_4191_tippi@epoque#57=18 char_4193_lemuen@ambienceSynesthesia#7=18
  char_4194_rmixer@boc#12=18 char_4195_radian@game#8=18 char_4196_reckpr@yun#12=18 char_4198_christ@epoque#56=18 char_4199_makiri@sale#19=18 char_420_flamtl@game#2=18
  char_4202_haruka@iteration#6=21 char_4204_mantra@sightseer#4=18 char_4207_branch@yun#10=18 char_421_crow@summer#9=15 char_4215_buddy@mh#2=18 char_4217_makoto@p3r#1=18
  char_4218_aigis@p3r#1=18 char_4219_yukari@p3r#1=18 char_422_aurora@boc#4=15 char_4220_kormr@p3r#1=18 char_423_blemsh@littlePony#1=18 char_423_blemsh@witch#2=18
  char_426_billro@snow#3=18 char_426_billro@summer#8=18 char_427_vigil@epoque#27=18 char_430_fartth@whirlwind#5=18 char_431_ashlok@epoque#28=18 char_436_whispr@witch#4=18
  char_437_mizuki@game#6=18 char_440_pinecn@epoque#31=18 char_449_glider@epoque#17=18 char_449_glider@nian#10=18 char_450_necras@ambienceSynesthesia#7=18 char_450_necras@summer#20=21
  char_451_robin@epoque#13=18 char_452_bstalk@unveiling#4=18 char_455_nothin@nian#7=18 char_456_ash@rainbow6#1=18 char_459_tachak@rainbow6#1=15 char_464_cement@epoque#31=18
  char_466_qanik@snow#6=18 char_472_pasngr@epoque#17=24 char_473_mberry@epoque#14=18 char_473_mberry@nian#9=18 char_474_glady@boc#5=18 char_474_glady@epoque#33=18
  char_475_akafyu@epoque#15=18 char_476_blkngt@summer#8=15 char_478_kirara@epoque#57=18 char_478_kirara@game#2=15 char_479_sleach@epoque#14=18 char_479_sleach@summer#11=18
  char_484_robrta@ambienceSynesthesia#3=18 char_485_pallas@epoque#12=18 char_486_takila@ambienceSynesthesia#2=18 char_486_takila@shining#2=18 char_487_bobb@kitchen#4=18 char_488_buildr@epoque#34=18
  char_489_serum@epoque#31=18 char_492_quercu@witch#4=18 char_494_vendla@game#10=18 char_496_wildmn@epoque#16=18 char_497_ctable@epoque#44=18 char_497_ctable@nian#9=18
  char_498_inside@kitchen#2=18
`;
const EVENT_SKIN_IDS = `
  char_002_amiya@winter#1 char_181_flower@daily#1 char_002_amiya@epoque#4 char_211_adnach@sale#5 char_210_stward@sale#6 char_437_mizuki@sale#7 char_124_kroos@sale#14 char_230_savage@sale#17 char_208_melan@epoque#1 char_109_fmout@epoque#2
  char_128_plosis@epoque#3 char_215_mantic@epoque#4 char_164_nightm@epoque#5 char_355_ethan@epoque#7 char_253_greyy@epoque#8 char_258_podego@epoque#9 char_126_shotst@epoque#10 char_151_myrtle@epoque#12 char_337_utage@epoque#15 char_492_quercu@epoque#17
  char_485_pallas@epoque#19 char_274_astesi@epoque#23 char_209_ardign@epoque#26 char_126_shotst@epoque#28 char_212_ansel@epoque#29 char_183_skgoat@epoque#30 char_499_kaitou@epoque#37 char_4063_quartz@epoque#39 char_190_clour@epoque#43 char_154_morgan@epoque#47
  char_445_wscoot@epoque#49 char_127_estell@epoque#50 char_253_greyy@epoque#515 char_4023_rfalcn@epoque#52 char_446_aroma@epoque#54 char_4015_spuria@epoque#58 char_235_jesica@nian#2 char_436_whispr@nian#4 char_225_haak@nian#5 char_469_indigo@nian#7
  char_476_blkngt@nian#8 char_385_finlpp@nian#11 char_347_jaksel@whirlwind#2 char_378_asbest@whirlwind#3 char_366_acdrop@whirlwind#4 char_131_flameb@whirlwind#6 char_4131_odda@whirlwind#8 char_212_ansel@summer#1 char_199_yak@summer#1 char_286_cast3@summer#1
  char_337_utage@summer#4 char_298_susuro@summer#6 char_171_bldsk@summer#7 char_484_robrta@summer#10 char_302_glaze@summer#11 char_4041_chnut@summer#12 char_348_ceylon@summer#13 char_341_sntlla@summer#15 char_282_catap@summer#17 char_4100_caper@summer#18
  char_366_acdrop@summer#21 char_498_inside@summer#22 char_4051_akkord@summer#23 char_129_bluep@marthe#3 char_356_broca@marthe#4 char_192_falco@marthe#6 char_376_therex@marthe#7 char_301_cutter@marthe#8 char_491_humus@marthe#10 char_381_bubble@marthe#11
  char_185_frncat@marthe#12 char_4171_wulfen@marthe#14 char_236_rope@witch#1 char_328_cammou@witch#2 char_108_silent@winter#2 char_110_deepcl@winter#3 char_298_susuro@winter#4 char_209_ardign@snow#1 char_452_bstalk@snow#4 char_4004_pudd@snow#5
  char_117_myrrh@wild#1 char_112_siege@wild#2 char_145_prove@wild#5 char_2012_typhon@wild#9 char_311_mudrok@wild#10 char_336_folivo@wild#11 char_1027_greyy2@wild#12 char_134_ifrit@kfc#1 char_173_slchan@wwf#1 char_122_beagle@boc#1
  char_284_spot@boc#3 char_285_medic2@boc#4 char_193_frostl@boc#4 char_278_orchid@boc#6 char_4000_jnight@boc#7 char_230_savage@boc#8 char_4136_phonor@boc#9 char_163_hpsts@boc#10 char_230_savage@kitchen#3 char_277_sqrrel@ghost#1
  char_120_hibisc@nian#1 char_123_fang@winter#1
  char_222_bpipe@race#1 char_349_chiave@race#2 char_4019_ncdeer@ncdeer#1 char_440_pinecn@shining#1 char_4017_puzzle@shining#3 char_159_peacok@game#1 char_240_wyvern@game#4 char_325_bison@yun#7 char_4107_vrdant@unveiling#3
`;
const SPECIAL_SKIN_IDS = `char_002_amiya@test#1 char_250_phatom@sale#4 char_103_angel@sale#8 char_121_lava@sale#9 char_010_chen@sale#10 char_4151_tinman@sale#11 char_003_kalts@sale#14 char_1011_lava2@whirlwind#9 char_322_lmlee@whirlwind#10 char_136_hsguma@summer#16 char_264_f12yin@marthe#13 char_103_angel@kfc#1 char_201_moeshd@kfc#1 char_1035_wisdel@game#9`;
const VOICE_ID_ROWS = `
  char_4067_lolxh#2|char_4067_lolxh#1 char_512_aprot#1|char_4025_aprot2 char_311_mudrok#2|char_311_mudrok#1
  char_245_cello@sale#12|char_245_cello_sale#12 char_1032_excu2@sale#12|char_1032_excu2_sale#12 char_1035_wisdel@sale#14|char_1035_wisdel_sale#14
  char_1038_whitw2@sale#15|char_1038_whitw2_sale#15 char_113_cqbw@epoque#7|char_113_cqbw_epoque#7 char_472_pasngr@epoque#17|char_472_pasngr_epoque#17
  char_4064_mlynar@epoque#28|char_4064_mlynar_epoque#28 char_1016_agoat2@epoque#34|char_1016_agoat2_epoque#34 char_4134_cetsyr@epoque#50|char_4134_cetsyr_epoque#50
  char_1016_agoat2@epoque#57|char_1016_agoat2_epoque#57 char_2023_ling@nian#12|char_2023_ling_nian#12 char_311_mudrok@summer#6|char_311_mudrok#1
  char_311_mudrok@wild#10|char_311_mudrok#1 char_003_kalts@boc#6|char_003_kalts_boc#6 char_249_mlyss@boc#8|char_249_mlyss_boc#8
  char_311_mudrok@ambienceSynesthesia#2|char_311_mudrok#1 char_1012_skadi2@iteration#2|char_1012_skadi2_iteration#2 char_1041_angel2@iteration#6|char_1041_angel2_iteration#6
  char_2024_chyue@cfa#1|char_2024_chyue_cfa#1
`;

const originalPrices = new Map(ORIGINAL_PRICE_ROWS.trim().split(/\s+/).map(row => {
  const [skinId, price] = row.split('=');
  return [skinId!, Number(price)];
}));
const eventSkins = new Set(EVENT_SKIN_IDS.trim().split(/\s+/));
const specialSkins = new Set(SPECIAL_SKIN_IDS.split(/\s+/));
const voiceIds = new Map(VOICE_ID_ROWS.trim().split(/\s+/).map(row => {
  const [skinId, voiceId] = row.split('|');
  return [skinId!, voiceId!];
}));

export function applySkinGameplayMetadata(operator: OperatorSource): void {
  for (const skin of operator.skins) {
    if (skin.voiceId === undefined) skin.voiceId = voiceIds.get(skin.id) ?? null;
    const price = originalPrices.get(skin.id);
    if (skin.id === `${operator.id}#1`) {
      skin.price = 0;
      skin.priceSource = 'basic';
    } else if (price !== undefined) {
      skin.price = price;
      skin.priceSource = 'original';
    } else if (eventSkins.has(skin.id)) {
      skin.price = 9;
      skin.priceSource = 'event';
    } else if (specialSkins.has(skin.id)) {
      skin.price = 24;
      skin.priceSource = 'special';
    } else {
      skin.price = null;
      skin.priceSource = 'unknown';
      skin.priceReason = 'No verified original-price fact is bundled for this stable skin ID.';
      continue;
    }
    skin.priceReason = null;
  }
}
