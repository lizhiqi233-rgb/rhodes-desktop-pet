# 桌宠素材来源与权利说明

本目录中的素材由 `scripts/prepare-assets.ts` 从下列公开资源地址下载，供本项目本地运行与验证。脚本保留 Spine atlas 所引用的原始 PNG 文件名，不转换模型或音频格式。更新本地缓存可运行 `bun run scripts/prepare-assets.ts`；此操作不上传或发布素材。

## 干员页面与 Spine 资源

| 干员 | PRTS 干员页面 | PRTS 语音记录 | Spine 元数据 |
| --- | --- | --- | --- |
| 阿米娅（Amiya，`char_002_amiya`） | <https://prts.wiki/w/%E9%98%BF%E7%B1%B3%E5%A8%85> | <https://prts.wiki/w/%E9%98%BF%E7%B1%B3%E5%A8%85/%E8%AF%AD%E9%9F%B3%E8%AE%B0%E5%BD%95> | <https://torappu.prts.wiki/assets/char_spine/char_002_amiya/meta.json> |
| 能天使（Exusiai，`char_103_angel`） | <https://prts.wiki/w/%E8%83%BD%E5%A4%A9%E4%BD%BF> | <https://prts.wiki/w/%E8%83%BD%E5%A4%A9%E4%BD%BF/%E8%AF%AD%E9%9F%B3%E8%AE%B0%E5%BD%95> | <https://torappu.prts.wiki/assets/char_spine/char_103_angel/meta.json> |

脚本依据元数据中的默认皮肤基建模型路径获取 `.skel`、`.atlas`，并从 atlas 中逐页取得 PNG。模型及贴图的实际 URL 以各角色 `manifest.json` 的 `sources` 字段为准。
本次基础建模资源中，atlas 声明的贴图尺寸与原始 PNG 的 IHDR 尺寸不同：阿米娅为 516×516 对 344×344，能天使为 468×468 对 312×312。脚本保留来源文件，不改 atlas 或贴图；验证 PNG 签名及其实际尺寸，并记录尺寸差异。

## 中文语音来源

PRTS 语音记录页列出中文语音文件编号；原始 WAV 资源来自 Torappu 的 `voice_cn` 路径。基础素材目录包含下列问候与戳一下录音，来源如下；运行时不再优先把这两条样本当作完整语音包。

| 干员 | 本地文件 | PRTS 语音项 | 原始 WAV 地址 |
| --- | --- | --- | --- |
| 阿米娅 | `voice-1.wav` | 问候（`CN_042.wav`） | <https://torappu.prts.wiki/assets/audio/voice_cn/char_002_amiya/cn_042.wav> |
| 阿米娅 | `voice-2.wav` | 戳一下（`CN_034.wav`） | <https://torappu.prts.wiki/assets/audio/voice_cn/char_002_amiya/cn_034.wav> |
| 能天使 | `voice-1.wav` | 问候（`CN_042.wav`） | <https://torappu.prts.wiki/assets/audio/voice_cn/char_103_angel/cn_042.wav> |
| 能天使 | `voice-2.wav` | 戳一下（`CN_034.wav`） | <https://torappu.prts.wiki/assets/audio/voice_cn/char_103_angel/cn_034.wav> |

运行时语言选择支持中文普通话、日语、英语、韩语。语言可用性、原作语音 ID 与台词 `voiceText` 读取 [游戏语音表](https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/charword_table.json)，准备任命助理、问候、交谈和触摸相关日常语音，不整包下载战斗语音；PRTS 原始目录依次为 `assets/audio/voice_cn`、`assets/audio/voice`、`assets/audio/voice_en`、`assets/audio/voice_kr`。任命助理使用 `CN_001`，不把随包问候 `CN_042` 当作任命语音。旧语音缓存补齐 ID 与台词时保留有效 WAV；没有真实台词时不显示标题冒充字幕。不存在的语言或文件会明确报错。下载验证 WAV 格式、单文件及整包大小，准备完成后才安装到缓存。

## 目录、立绘与家具

管理界面的干员、外观、职业与稀有度，读取 [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) 的简中数据表 `character_table.json`、`skin_table.json`。

家具元数据来自 [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource)：`gamedata/excel/building_data.json`、`gamedata/building/building_local_data.json` 与 `version`。先从官方提交订阅定位提交，再固定同一提交读取三份文件，记录仓库、提交、版本和成功同步时间；不混用刷新期间变化的分支数据。

导入家具分类、三维格尺寸、旋转、氛围、说明、来源、障碍格与 LOD 部件配置；无主题家具单独归类。`interactType` 和 LOD 不等于坐卧挂点，不能据此绕过现有交互校准。上游仓库标注 AGPL-3.0，并另声明静态游戏资源的版权归属；本项目未引入该仓库的工具源码，公开分发前仍须核对数据及素材的适用条款。

头像、家具图片和主题图片来自 `torappu.prts.wiki/assets/`；完整立绘通过 PRTS MediaWiki 文件信息接口定位至 `media.prts.wiki`。外观与基建模型的对应关系来自各干员的 Spine 元数据。目录中能浏览不等于能播放，实际准备时还会检查模型版本、文件格式和可用动作。

阿米娅升变形态的时装使用独立页面及编号，例如 [近卫形态原始条目](https://prts.wiki/index.php?title=%E9%98%BF%E7%B1%B3%E5%A8%85%28%E8%BF%91%E5%8D%AB%29&action=raw)；按条目中的时装名称与编号定位立绘，不把合并目录的排序当作文件序号。

家具实际模型来自 [lizhiqi233-rgb/Arknights-CN-Unpacker](https://github.com/lizhiqi233-rgb/Arknights-CN-Unpacker) 的 [Release 清单](https://github.com/lizhiqi233-rgb/Arknights-CN-Unpacker/releases/latest/download/manifest.json)。清单引用的旧 Release 仍可能提供当前资源，不能只读取最新附件。下载时核对 ZIP 的大小和 SHA-256，并校验 OBJ、PNG 等导出文件；按 `objects.json` 的序列化文件、精确 PathID、层级和外部 CAB 引用重建选中家具。

家具贴图不再充当整个家具模型；目录缩略图仍由 PRTS 提供。桌宠从网格与基础材质生成透明渲染层，读取原生 `Sit`／`Sleep` 挂点；卧姿使用挂点下方的模型承托面校准，无挂点时明确使用几何默认值。家具预览采用正面略俯视投影，按 PRTS 官方家具渲染和原生网格朝向核对，不使用等距斜角；该投影由观察推断，不是官方公开的相机参数。只使用静态姿态，不宣称还原 Unity 自定义 Shader、Animator 或粒子效果。解包仓库的 MIT 仅覆盖自动化代码，不授予游戏美术的再分发权。

目录元数据、图片、语音和模型保存在专用 `cache/`：默认在程序安装目录旁，开发运行使用项目根目录，设置页显示实际路径并可更改；更改时复制旧缓存缺少的文件、保留旧目录，重启后生效，安装目录不可写时回退用户数据目录。旧用户数据与旧项目缓存均采用保留原件的缺项导入，不写回源码素材目录。启动后后台补齐全部干员头像与立绘（包含皮肤）；模型、所选语言语音及家具资源另按加载需求准备。分类默认收起；家具资源包只在明确下载或对该分类选择“全量缓存”时预缓存，不因浏览而下载全库。缓存只服务本地使用；资源来源记录不代替授权，不能把缓存作为 MIT 素材发布。

## 派遣地图

底图与边界选区参考 [PRTS 泰拉地理页面](https://prts.wiki/w/%E6%B3%B0%E6%8B%89%E5%A4%A7%E5%85%B8:%E5%9C%B0%E7%90%86)，图片为 [Campaign world map.png](https://media.prts.wiki/b/b4/Campaign_world_map.png)，来源记录见 [PRTS 文件页](https://prts.wiki/w/%E6%96%87%E4%BB%B6:Campaign_world_map.png)。底图按需下载到本机缓存，不随源码或安装包分发；地区标记为概略选区，不宣称官方精确国界。地图及选区数据不按本仓库 MIT 重新许可，公开分发前须核对上游条件和游戏素材权利。

## 职业与资源图标

`src/renderer/assets/ui/` 的八职业图标来自 PRTS [透明职业图标文件列表](https://prts.wiki/api.php?action=query&format=json&list=allimages&aiprefix=%E5%9B%BE%E6%A0%87_%E8%81%8C%E4%B8%9A_%E9%80%8F%E6%98%8E_&ailimit=20)，资源图标来自[合成玉](https://prts.wiki/w/%E6%96%87%E4%BB%B6:%E9%81%93%E5%85%B7_%E5%90%88%E6%88%90%E7%8E%89.png)和[至纯源石](https://prts.wiki/w/%E6%96%87%E4%BB%B6:%E9%81%93%E5%85%B7_%E8%87%B3%E7%BA%AF%E6%BA%90%E7%9F%B3.png)文件页。

保留下载所得原始 PNG，不描摹、重绘或转码，供桌宠界面显示。素材权利与公开分发限制同下节，不按本项目 MIT 重新许可。

## 线索卡片

`src/renderer/assets/ui/clue-1.png` 至 `clue-7.png` 来自 PRTS [线索文件列表](https://prts.wiki/api.php?action=query&format=json&list=allimages&aiprefix=%E7%BA%BF%E7%B4%A2&ailimit=50)中的七张“线索N_大图.png”，保留原始PNG。卡片与会客室布局参考[罗德岛基建／会客室](https://prts.wiki/w/%E7%BD%97%E5%BE%B7%E5%B2%9B%E5%9F%BA%E5%BB%BA/%E4%BC%9A%E5%AE%A2%E5%AE%A4)；素材不按本项目MIT许可，公开分发前仍须核对游戏素材权利。


## 悬浮菜单样式参考

悬浮功能卡片的斜边与错位混排参考 [nonebot-plugin-arkguesser](https://github.com/lizhiqi233-rgb/nonebot-plugin-arkguesser) 的猜测图／答案图；未引入该项目的图像素材。

## 权利与许可状态

《明日方舟》由鹰角网络（Hypergryph）开发，相关角色、模型与贴图属于游戏的权利人；语音录音及表演也可能涉及制作方、录音制品及配音者等权利。本项目未逐项核验具体权属，也未取得复制、再分发或公开发布授权。官方二创规范见 <https://arknights.global/fankit/guidelines>。PRTS 页面展示的 CC BY-NC-SA 4.0 标记不代表其拥有或转授游戏素材权利，也不应视为这些游戏素材采用该许可。当前仅完成本机下载与格式核验，**第三方授权与开源发布许可尚未清理**；不得据此宣称素材采用 MIT 或其他开源许可。
