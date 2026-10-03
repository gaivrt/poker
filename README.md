# 二次元德州扑克（暂定名）

类似雀魂的二次元竞技德州扑克：角色陪你打牌，段位让每一局都有分量，只卖外观、对局绝对公平。

当前阶段：**M1：网页单机原型**。C++ 规则引擎编译成 WebAssembly，在浏览器里和 5 名 AI 对战。

## 设计文档

| 文档 | 内容 |
|---|---|
| [01 市场调研](docs/01-market-research.md) | 对标雀魂和直接竞品 Poker Chase；地区判断；合规红线；差异化定位 |
| [02 产品范围与技术选型](docs/02-product-and-tech.md) | MVP 里程碑；架构；网页优先（C++ → WebAssembly + PixiJS）的选型理由 |
| [03 布局与演出](docs/03-visual-layout-and-presentation.md) | 为什么选 2D；1920×1080 布局和坐标；演出分级和铁律 |
| [04 规则引擎规格](docs/04-rules-engine-spec.md) | 下注、边池等全部规则；赛制预设；模拟数据 |
| [05 AI 设计](docs/05-ai-design.md) | 决策流程；难度和性格；现状评估和下一步 |
| [06 心理战系统](docs/06-mind-games.md) | 台词、表情包、小动作、下注大小和速度、亮牌；读人笔记；AI 的破绽、读人和上头 |
| [07 美术方向提案](docs/07-art-direction.md) | 暖光赌场厚涂风格；色板；2D 分层而非 3D；第一人称牌桌；本局主役；主页；AI 出图规范（待确认） |
| [08 演出设计](docs/08-presentation.md) | 舞台分层、镜头和特效语汇、声音；17 个关键时刻的分镜和时长；分级节奏；素材热插拔规范；分阶段计划 |

## 网页版（试玩原型）

需要 Node.js 20+。

```bash
cd web
npm install
npm run dev        # 开发服务器，浏览器打开显示的地址
npm run build      # 生成静态文件到 web/dist，可以部署到任何静态托管
```

- 键盘：`F` 弃牌 · `C` 过牌或跟注 · `R` 下注或加注
- 网址参数：`?seed=123` 固定牌序（复现问题用）；`?speed=0` 动画全部瞬间完成（自动化测试用）
- 改了 C++ 之后需要重新生成 `web/src/wasm/poker.js`：先安装并激活 [Emscripten](https://emscripten.org/docs/getting_started/downloads.html)，再运行 `./scripts/build-wasm.sh`

## C++ 构建

需要 CMake ≥ 3.20 和支持 C++20 的编译器（GCC 11+、Clang 14+、MSVC 2022），没有第三方依赖。

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
./build/poker_tests                 # 单元测试（含 1.3 亿手 7 张牌全量验证，约 6 秒）
POKER_SKIP_SLOW=1 ./build/poker_tests   # 跳过全量验证
```

## 命令行试玩

```bash
./build/poker_cli                          # 快速赛（18 手），普通 AI
./build/poker_cli standard hard            # 标准赛（30 手），困难 AI
./build/poker_cli classic easy 12345       # 经典淘汰赛，简单 AI，指定种子
./build/poker_cli quick normal 42 --auto   # 让 AI 替你打，看引擎跑一局
```

操作：`f` 弃牌 · `c` 过牌或跟注 · `b 100` 下注到 100 · `r 240` 加注到 240 · `a` 全下

## 模拟器

```bash
./build/poker_sim 400 2026   # 每种赛制 400 局：对局时长、性格强弱、难度差距
```

## 目录

```
core/     规则引擎 poker_core（零依赖，客户端、服务器、AI 共用）
ai/       单机 AI poker_ai
app/      单机对局会话 poker_session（网页客户端的接口）
web/      网页客户端（TypeScript + PixiJS + Vite）
scripts/  build-wasm.sh
tools/    cli（命令行试玩）、sim（模拟器）
tests/    单元测试
docs/     设计文档
```
