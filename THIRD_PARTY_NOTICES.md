# 第三方许可与素材说明

本仓库原始源码采用根目录 LICENSE 所列的 MIT 许可；这不改变第三方依赖及游戏素材的许可。

当前产物用于本地开发验证，不代表已经取得 Spine 或游戏素材的分发授权。开源、免费、非商业声明不能代替授权。准备公开发布前必须核对依赖版本对应条款及素材权利，不得把本文件当作授权证明。

## 游戏素材

角色模型、原作语音、角色名称和相关美术属于《明日方舟》及各自权利人，不适用本仓库 MIT 许可。资源来源为 PRTS，具体来源见 assets/SOURCES.md 及本地角色 manifest.json。

`assets/characters/` 为本地准备的基础素材，已加入 `.gitignore`；基础准备脚本仍只处理两名明确列出的角色。管理界面另从公共游戏数据镜像读取目录，并按请求从 PRTS 准备图片、模型及所选语言的语音，缓存于专用 `cache/`。项目内运行使用根目录缓存，独立复制或安装后使用程序旁目录；该目录已忽略且不纳入打包文件。目录可浏览、资源可下载均不代表获得复制或再分发授权；不要将带缓存素材的测试包直接上传公共发行页。

家具目录及本地布局配置读取 [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource)，缓存记录具体提交及版本。该上游仓库标注 AGPL-3.0，README 另声明静态素材版权属于游戏权利人；本项目没有复制其工具源码，不将这些数据或美术重新声明为 MIT。公开发布前仍须核对适用条款，见 `assets/SOURCES.md`。

家具网格、材质、贴图与交互挂点按需读取 [lizhiqi233-rgb/Arknights-CN-Unpacker](https://github.com/lizhiqi233-rgb/Arknights-CN-Unpacker) 的 GitHub Releases，缓存于用户数据目录，不随源码发布。该仓库的 MIT 仅覆盖自动化代码；本程序没有把上游解包器作为运行时打包，资源仍属于游戏权利人，不能因解包代码开源而推定美术素材获得了开源许可。

派遣底图与边界选区参考 [PRTS 泰拉地理页面](https://prts.wiki/w/%E6%B3%B0%E6%8B%89%E5%A4%A7%E5%85%B8:%E5%9C%B0%E7%90%86) 的 `Campaign world map.png`。底图仅按需下载到本机缓存，不纳入安装包；地图及选区数据不适用本仓库 MIT 许可，公开分发前须核对上游条件及游戏素材权利。

## Spine 与 Pixi Spine

使用 @pixi-spine/base 4.0.6、@pixi-spine/runtime-3.8 4.0.6。上游声明为 SEE SPINE-LICENSE，不是可整体重许可为 MIT 的依赖。

以下保留 Pixi Spine 上游 SPINE-LICENSE 文本；同时应核对集成时适用的 Spine Editor License Agreement：<https://esotericsoftware.com/spine-editor-license>。

```text
Spine Runtimes License Agreement
Last updated January 1, 2020. Replaces all prior versions.

Copyright (c) 2013-2020, Esoteric Software LLC

Integration of the Spine Runtimes into software or otherwise creating
derivative works of the Spine Runtimes is permitted under the terms and
conditions of Section 2 of the Spine Editor License Agreement:
http://esotericsoftware.com/spine-editor-license

Otherwise, it is permitted to integrate the Spine Runtimes into software
or otherwise create derivative works of the Spine Runtimes (collectively,
"Products"), provided that each user of the Products must obtain their own
Spine Editor license and redistribution of the Products in any form must
include this license and copyright notice.

THE SPINE RUNTIMES ARE PROVIDED BY ESOTERIC SOFTWARE LLC "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL ESOTERIC SOFTWARE LLC BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES,
BUSINESS INTERRUPTION, OR LOSS OF USE, DATA, OR PROFITS) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THE SPINE RUNTIMES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

来源：<https://github.com/pixijs/spine/blob/master/SPINE-LICENSE>。

## PixiJS

```text
The MIT License

Copyright (c) 2013-2023 Mathew Groves, Chad Engler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Three.js 与 fflate

静态家具渲染使用 Three.js 0.186.1，ZIP 读取使用 fflate 0.8.3；两者使用 MIT。以下保留其版权及许可：

```text
The MIT License

Copyright © 2010-2026 three.js authors
Copyright (c) 2026 Arjun Barrett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```


## Electron

Electron 安装目录中的 LICENSE、LICENSES.chromium.html 等文件由发行工具保留。Electron 本体许可如下；Chromium 等组件的完整声明以随包文件为准。

```text
Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## nonebot-plugin-arkguesser

招募立绘取景的离线匹配代码及矩形缩放规则改编自 [nonebot-plugin-arkguesser](https://github.com/lizhiqi233-rgb/nonebot-plugin-arkguesser/tree/7f5cdca03648a489682a8046a53b320cbaf45d3d)，遵循其 MIT 许可。以下保留原版权及许可文本：

```text
MIT License

Copyright (c) 2026 lizhiqi233-rgb

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
