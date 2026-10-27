# 11 · 美术需求与 AI 生图提示词

目标：用 AI 生成第一版正式美术，替换现在程序绘制的占位形象和背景。
文件放进 `web/public/art/` 后游戏自动使用（路径和尺寸见 `web/public/art/README.md`），不需要改代码。

## 1. 统一画风（每条提示词都带上）

所有角色必须像同一个游戏里的人，所以每条提示词都以同一段画风描述开头：

```
Anime gacha game character art, polished cel shading with soft gradient lighting,
crisp clean lineart, elegant adult woman in her twenties, mature proportions,
night-time private card salon theme, muted warm palette with one accent colour,
single character only, plain flat mid-grey background (#808080), no text, no logo,
no watermark, no frame.
```

画风约束（来自 `docs/10-art-direction-v2.md` 的暖灰方向）：

- 克制、成熟的奢华感，不要可爱休闲风，不要大面积金色堆砌，不要粉色。
- 每个角色只有一个主色，其余用黑、象牙白、暖灰。
- 所有角色都是成年人，体型、气质都要明确是成年人。
- 背景一律纯灰平涂，方便抠图（Gemini 不能直接输出透明背景）。
- 不出现真钱、钞票、现金符号；筹码、扑克牌可以。

## 2. 角色设定

角色 ID 是 `public/art/characters/` 下的文件夹名。主色就是游戏里已经在用的角色色。

| ID | 名字 | 打法 | 主色 | 外形关键词 |
|---|---|---|---|---|
| aoi | 葵 | 平衡型（主页看板娘） | 翡翠绿 #5fbf8f | 深绿长直发、温柔微笑、翡翠色露肩晚礼服、珍珠项链和耳坠、沙龙女主人 |
| rin | 凛 | 紧凶型 | 绯红 #d94f5c | 黑色长发带暗红挑染、红色眼睛、黑色修身马甲配白衬衫、细红领带、黑色皮手套、冷淡 |
| dango | 团子 | 跟注站 | 蜂蜜黄 #f2b84b | 蜜金色双马尾配圆形发饰、宽松奶油色针织开衫、芥末黄连衣裙、开朗有点迷糊（成年人） |
| homura | 焰 | 疯狂型 | 橙红 #ff7a2f | 橙红色短碎发、琥珀色眼睛、短款皮夹克配黑色内搭、金色圈形耳环、张扬的笑 |
| shizuka | 静 | 岩石型 | 雾蓝 #7fa7c9 | 银蓝色波波头、细框眼镜、高领灰蓝色改良旗袍、几乎没有表情 |
| kitsune | 狐 | 诈唬型 | 紫 #a77be0 | 薰衣草灰长发（发型像狐耳）、紫色眼睛、黑紫色和风小礼服、手持折扇遮住半张脸、狡黠 |

主角“你”（player）先不画，继续用剪影占位。

### 每个角色的基础提示词

在第 1 节的画风段落后面接上这一段：

- **aoi**：`Character: Aoi, a graceful hostess of an exclusive card salon. Long straight dark-green hair, soft green eyes, gentle knowing smile. Emerald off-shoulder satin evening gown, pearl necklace and pearl drop earrings. Accent colour emerald #5fbf8f.`
- **rin**：`Character: Rin, a cold and precise high-stakes player. Long straight black hair with dark crimson streaks, sharp red eyes. Fitted black waistcoat over a white shirt, thin crimson tie, black leather gloves. Accent colour crimson #d94f5c.`
- **dango**：`Character: Dango, a cheerful, slightly clumsy young woman who never folds. Honey-blonde twin tails with round hair ornaments, bright amber eyes. Oversized cream knit cardigan over a mustard-yellow dress. Accent colour honey #f2b84b. Clearly an adult.`
- **homura**：`Character: Homura, a reckless thrill-seeker. Short messy orange-red hair, amber eyes, wide confident grin. Cropped black leather jacket over a black top, gold hoop earrings. Accent colour flame orange #ff7a2f.`
- **shizuka**：`Character: Shizuka, a calm, almost expressionless strategist. Silver-blue bob haircut, thin-framed glasses, grey-blue eyes. High-collar slate-blue modern qipao-style dress. Accent colour mist blue #7fa7c9.`
- **kitsune**：`Character: Kitsune, a playful bluffer. Long lavender-grey hair styled into two fox-ear-like peaks, violet eyes, sly smile. Black and violet kimono-inspired cocktail dress, holding a folding fan. Accent colour violet #a77be0.`

## 3. 每个角色需要的图

半身像（头到腰），1200×1600（3:4），腰部贴图片底边，人物居中，稍微侧身面对镜头。

| 文件 | 姿势/表情 | 追加到提示词末尾 |
|---|---|---|
| idle.png | 平静 | `Half body from head to waist, relaxed neutral expression, hands resting naturally.` |
| smug.png | 得意 | `Half body, smug confident smile, slightly raised chin, one hand near her face.` |
| nervous.png | 紧张 | `Half body, nervous expression, eyes glancing aside, a small sweat drop, fingers fidgeting.` |
| angry.png | 生气 | `Half body, annoyed angry expression, furrowed brows, arms crossed.` |
| shock.png | 震惊 | `Half body, shocked wide-eyed expression, mouth open, leaning back.` |
| cry.png | 输光 | `Half body, defeated teary expression, looking down, shoulders slumped.` |
| win.png | 胜利（本局主役） | `Half body, triumphant victory pose, one hand raised holding a fan of playing cards, chips flying around her, dramatic rim light.` |

表情包（stickers/）以后再做。

### 怎么保证同一个角色每张图长得一样

1. 先只生成 `idle.png`，多抽几张，挑一张定稿，作为这个角色的“标准像”。
2. 其余姿势都用 Gemini 的图片编辑：把标准像作为输入图，提示词写“Same character, same outfit, same art style as the reference image. Change only the pose and expression: …”，再接第 3 节表格里的姿势描述。
3. 生成后用 `scripts/art-ingest.py char <ID> <姿势> <图片>` 处理：自动抠图（anime 抠图模型）、裁到人物、缩放进 1200×1600、腰部贴底边，直接写进 `public/art/characters/<ID>/`。背景用 `scripts/art-ingest.py bg lobby <图片>`。

## 4. 背景

不要人物，不要文字，16:9，3840×2160 或 1920×1080。

- **lobby.png（主页）**：
  `Anime background art, interior of an exclusive private card salon at night, art deco details, warm low lighting, deep velvet curtains, small chandeliers, tall windows with a blurred city at night behind, an open softly lit space in the centre where a character will stand, muted warm-grey palette with faint terracotta accents, cinematic depth of field, no people, no text, 16:9.`
- **table.png（牌桌）**：
  `Anime background art, the same exclusive night card salon seen from a seated player's eye level, the area where a card table would be is left empty and dark, warm pools of light from above, blurred bar and windows in the background, muted warm-grey palette, no table, no people, no text, 16:9.`

牌桌本身由程序绘制，所以背景里不能有桌子。

## 5. 顺序

1. 先做 **葵**（主页看板娘）的 idle 和主页背景，放进游戏截图看效果，确认画风。
2. 画风确认后再做其余 5 个角色的标准像。
3. 再用图片编辑补全所有表情。
4. 最后做段位徽章、模式卡插画、表情包。

## 6. 注意事项

- **Steam 要求披露 AI 内容。** 商店页提交时要填写游戏里使用了 AI 生成内容。
- **AI 图先当第一版。** 上线前可以按这份设定约稿画师重画或精修，设定文档可以直接给画师用。
- **不要用来路不明的参考图。** 尤其不要用带签名的别人作品去做图生图。
