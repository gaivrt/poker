# 11 · 出图清单和提示词（手动出图）

> 出图方式：在 Gemini（Google 的出图界面）里手动生成，交给代码接入。
> 风格和角色设定见 [10](10-art-direction-v2.md)；素材目录见 [08 第 6 节](08-presentation.md)。

## 0. 已定的事

| 问题 | 决定 |
|---|---|
| 整体方向 | **画框安静，人物响亮**：界面、牌桌、背景低饱和、偏暗；颜色和性感全部交给立绘和角色主色的轮廓光 |
| 玩家形象 | 从 6 个角色里选一个（像雀魂），对手是另外 5 个；不另做第 7 个角色 |
| 第一个角色 | 凛（黑发抠图、红色轮廓光、尺度都是最严的考验） |

## 1. 出图通用规则

- **角色图一律纯中灰底（#808080）**，不要黑底、不要渐变、不要地面阴影。抠图由代码处理，黑发在黑底上抠不干净。
- **不要彩色轮廓光、不要发光**。轮廓光、调色、压暗、虚化都由代码统一加，图里只要柔和的暖色正面顶光。
- **每张都要明确成年**：提示词里有 `adult woman, about 27 years old, mature face and adult proportions`，不要删。
- **不要文字、水印、logo、钞票、货币符号**。
- **尺寸选界面里能选的最大一档**。比例：立绘 3:4，胜利全身 2:3，切入 21:9（没有就 16:9），背景 16:9。
- **表情一律在同一张底图上"改图"**，不要重新生成整张，否则长相会漂。
- 每张图记下：用的模型名、日期、最终提示词（直接改本文件，或者写在提交说明里）。

### 交付前自查

- [ ] 看起来是成年女性（脸、身材比例）
- [ ] 手指数对、手的形状正常
- [ ] 头发、手肘、饰品都完整在画面里，左右两边没有被裁掉
- [ ] 背景是纯色，没有渐变或阴影
- [ ] 没有文字、水印

### 怎么交给我

- **只想让我先看效果**：直接在对话里贴图。对话里的图会被压缩（凛 v1 只剩 896×1200），只够看效果，定稿要传原图。
- **要放进游戏**：在 GitHub 网页上打开分支 `claude/sleepy-ptolemy-phko5h`，进入 `art-src/<角色ID>/`（背景放 `art-src/backgrounds/`），点 Add file → Upload files 上传原图。我来抠图、对齐、缩放、生成表情脸片，再放进 `web/public/art/`。
- 文件名：`rin-base.png`、`rin-smug.png`、`table-far.png` 这样，同一张改了几版就加 `-v2`、`-v3`。

## 2. 第 0 步：风格锚（先只做这两张）

### 2.1 凛 · 半身底图 `rin-base`（3:4）

画风满意之后，这张就是所有角色的画风基准。可以多生成几轮，挑最好的一张。

```
High-quality Japanese anime game character art, the polished standing-portrait quality of a premium gacha game. Painterly anime coloring with soft gradients and clean, fine linework.

A single adult woman, about 27 years old, with a mature face and adult proportions. She is Rin, the cold and elegant hostess of an exclusive members-only card room at night.

Appearance: very long, straight, glossy black hair falling past her waist, with straight-cut bangs. Sharp crimson eyes, red lipstick, a faint knowing smile; her gaze is cool and appraising, as if she is putting a price on the viewer. A crimson satin evening gown with a high halter neckline and an open back, a slim fitted waist, glossy satin highlights. Long black satin opera gloves, a thin gold bracelet over one glove, small diamond stud earrings.

Pose: half body, from the hips up. Her body is turned three-quarters toward the right side of the image, her head turned back to look at the viewer. One gloved hand is raised to chest height, holding a single black poker chip between two fingers. The other arm hangs relaxed.

Framing: vertical 3:4 portrait. The top of her head is close to the top edge with a small margin. The bottom edge cuts across her hips. The figure is centered and nothing is cut off at the sides: all of her hair, both elbows and both hands are inside the frame.

Lighting: soft warm key light from the upper front, gentle soft shadows. No colored rim light, no glow, no bloom.

Background: a completely flat, solid, medium grey background (#808080). No gradient, no floor, no shadow, no props, no scenery.

No text, no watermark, no signature, no logo, no money.
```

不满意时常用的调整：
- 太幼：在第二段加 `tall, long legs, defined collarbones, sharp jawline, a confident grown-up expression`。
- 太保守、不够"杀"：加 `alluring, poised, a slow dangerous smile`；不要用直白的性暗示词，容易被拒。
- 太写实：加 `anime style, not photorealistic, not 3D`。

### 2.2 牌桌背景 `table-far`（16:9）

牌桌由代码画，这张只要桌子后面的房间。画面中上部会站着 5 个角色，所以那一带要暗、要平。

```
Anime background art for a game, wide 16:9. The interior of an exclusive private card room at night, seen from the eye level of a seated player looking across the room. No table in the picture: the lower half of the image fades into deep shadow.

One-point perspective with the vanishing point at the horizontal center, about 30% down from the top. Dark warm-grey walls with subtle art deco wood paneling, heavy dark velvet curtains at the far left and far right edges, a few dim brass wall sconces, one large crystal chandelier far in the distance and out of focus, soft warm bokeh.

Very low saturation, dark and quiet, muted warm greys and browns with only small warm highlights. Shallow depth of field, everything slightly soft. The middle band of the image, from about 20% to 60% down, stays plain and low in contrast, because characters will be placed in front of it.

Empty room: no people, no furniture in the foreground, no tables, no text, no signs, no money.
```

## 3. 第 1 批：凛的其余素材（风格锚定下来之后）

全部在 `rin-base` 上做。表情用"改图"：上传 `rin-base`，粘贴下面的改图说明。

### 3.1 表情（每个一张，3:4，和底图同尺寸）

改图说明的固定开头和结尾：

```
Edit this image. Change ONLY her facial expression to: <表情描述>.
Keep exactly the same character, face shape, hair, outfit, pose, hands, framing, lighting and the flat grey background. Do not move, crop, or redraw anything except the face.
```

| 文件 | 用在 | `<表情描述>` |
|---|---|---|
| `rin-smug` | 得意、加注 | `a cool, slightly condescending smirk with one corner of her mouth raised and half-lidded eyes` |
| `rin-nervous` | 紧张 | `a guarded, uneasy look: eyes glancing slightly to the side, lips pressed together, a faint bead of sweat at her temple` |
| `rin-angry` | 生气 | `a cold glare: narrowed eyes, brows drawn together, mouth set in a thin line` |
| `rin-shock` | 被逆转、被抓诈 | `genuine shock: eyes wide open, brows raised, lips slightly parted` |
| `rin-sulk` | 输掉摊牌（不甘，不是哭） | `bitter frustration: biting her lower lip, looking away, brows tense` |
| `rin-blink` | 眨眼 | `the same neutral expression as the original, but with her eyes gently closed` |

### 3.2 胜利全身 `rin-win`（2:3）

上传 `rin-base` 作为参考：

```
Using the attached image as the character reference, draw the same woman (same face, hair, crimson halter gown, black opera gloves, jewelry) in a new image.

Full body, standing tall in a triumphant pose: one gloved hand sweeping her long black hair back over her shoulder, the other hand held out to the side, palm up, as if presenting her victory. Chin slightly raised, a satisfied, superior smile, eyes half-lidded looking down at the viewer. The gown is floor-length with a high slit up one side.

Vertical 2:3. Whole figure inside the frame with a small margin, including her hair and the hem of the gown. Same art style and lighting as the reference: soft warm key light from the upper front, no colored rim light, no glow. Completely flat, solid medium grey background (#808080), no floor, no shadow.

No text, no watermark, no money.
```

### 3.3 切入特写 `rin-cutin`（21:9，没有就 16:9）

上传 `rin-base` 作为参考：

```
Using the attached image as the character reference, draw an extreme close-up of the same woman for a cinematic cut-in.

Wide horizontal 21:9 frame filled by her face from the eyebrows to the chin, turned slightly to the right, crimson eyes locked on the viewer with an intense, unreadable stare. A few strands of black hair fall across her face. Sharp detail on the eyes.

Same art style. Dramatic lighting: half of her face in soft shadow. Flat solid medium grey background (#808080) where visible. No text, no watermark.
```

## 4. 场景其余两张

### 4.1 前景框景 `table-near`（16:9，可选）

```
Anime background art for a game, wide 16:9, a foreground framing layer. Only the far left and far right edges of the image contain anything: dark silhouettes of heavy velvet curtains hanging down, and in the bottom corners the soft, out-of-focus dark silhouettes of the backs of a few spectators' shoulders and heads. Everything is very dark, low saturation, slightly blurred.

The whole central 70% of the image is a completely flat, solid, pure green (#00FF00) with nothing in it, so it can be removed.

No text, no watermark.
```

### 4.2 主页大厅 `lobby`（16:9）

```
Anime background art for a game, wide 16:9. A quiet corner of an exclusive card club lounge at night. On the right half, a soft pool of warm light falls on a dark carpet in front of tall velvet curtains and a large window with city lights blurred into bokeh; a character will stand there later, so keep that spot empty. The left 40% of the image is dark, plain and low in contrast (menu text goes there).

Dark warm greys and browns, very low saturation, small warm highlights only, shallow depth of field. No people, no text, no signs, no money.
```

### 4.3 牌桌 `table-top`（16:9，在底稿上加材质）

代码画的桌子没有质感，桌子也改成插画。桌子的形状必须和座位、公共牌、名牌的坐标对齐，所以**不从零生成，而是在底稿上改**：

1. 下载底稿 `art-src/guides/table-guide.png`：现在的背景加上游戏里代码画的桌子（去掉了字和线），位置和形状就是游戏里的样子。
2. 上传底稿，粘贴下面的说明。
3. 交回整张图（背景也在里面没关系），代码按桌子的外沿椭圆自动抠出来。**唯一的要求是桌子外沿的轮廓不要变**，变了会露出背景或者切掉桌沿。

v1 的教训：说"Repaint"，Gemini 会另画一张俯视的小桌子，还自己加上印刷线、牌框、筹码槽和杯托。所以要说"Edit"，强调我们就坐在桌边（近处的桌沿在画面外），并逐个点名不要的东西。

```
Edit the attached image. Do not change the composition at all: same camera, same perspective, same room, and the table keeps exactly its current shape, size and position. Only improve the MATERIALS and LIGHTING of the table so it looks like a luxurious, high-end poker table, painted in the same anime background art style as the room.

We are sitting at this table: its near side is below the bottom edge of the image and must not be visible. The table is very large and runs off the left, right and bottom edges of the image. The curved dark band is the far rail; keep its curve exactly where it is.

Materials: the rail is padded black leather with fine stitching and soft glossy highlights along its rounded top; a thin polished brass inlay runs between the rail and the playing surface; the playing surface is deep dark-green wool felt with a visible fine fabric texture.

Lighting: warm light from the chandelier makes a soft oval pool of light in the middle of the felt, falling off to dark toward the edges; the rail casts a soft shadow onto the edge of the felt. Painted, not photorealistic, not a 3D render, no varnished wood.

Keep the felt completely plain: no printed lines, no betting lines, no card boxes, no dealer tray, no chip rack, no cup holders, no cards, no chips, no text, no logos. Same 16:9 framing.
```

## 5. 其余 5 个角色（凛定稿后再做）

和凛的流程完全一样：先出 `base`，再改出 6 个表情，最后出 `win` 和 `cutin`。只把 2.1 提示词里的**名字、外貌、姿态**三处换掉：

| ID | 名字、身份 | 外貌（替换 Appearance 段） | 姿态里拿的东西 |
|---|---|---|---|
| `dango` | Dango，慵懒的常客 | wavy honey-blonde hair in two low, loose twin tails; sleepy amber eyes, a lazy smile; a gold satin slip dress with thin straps, a fluffy white fur stole slipping off one arm; a curvy, soft figure | a champagne glass |
| `homura` | Homura，疯狂的赌徒 | short, messy, spiky orange hair; fierce orange eyes, a wide grin showing a canine tooth; a black cropped leather jacket over an orange top, fishnet sleeves, a small flame tattoo on her collarbone, several ear cuffs | a stack of chips, about to throw them |
| `shizuka` | Shizuka，一言不发的岩石 | a sleek ice-blue bob cut; calm pale-blue eyes behind thin silver-rimmed glasses; a high-collared sleeveless qipao-style long dress in ice blue, a single pearl necklace; composed, ascetic, the least revealing and the most intriguing | nothing: hands folded, one finger resting on her lips |
| `aoi` | Aoi，牌室真正的主人 | long, flowing dark-green hair with soft waves; gentle emerald eyes, a graceful smile; an emerald velvet off-the-shoulder evening gown, jade drop earrings, a refined, regal air | a single playing card face down |
| `kitsune` | Kitsune，爱诈唬的狐狸 | long lavender hair with fox ears; sly violet eyes, the sweetest smile; a purple high-slit qipao, black stockings | a folding fan held half over her mouth |

## 6. 不需要出图的

牌桌形状、筹码、牌面点数、界面、粒子、动态大字由代码绘制。头像、表情包、结算卡、角色图鉴从上面的素材自动裁出，不需要单独出图。
