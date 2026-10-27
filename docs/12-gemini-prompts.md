# 12 · Gemini 网页生图：给 Chrome Claude 的任务单

用法：把第 1 节整段发给 Chrome 里的 Claude，然后按轮次把第 2 节之后的提示词交给它。每条提示词都已经拼好，原样粘贴即可。
设定和背景说明见 `docs/11-art-brief.md`。图片生成好后发回给 Claude Code，用 `scripts/art-ingest.py` 抠图放进游戏。

## 1. 给 Chrome Claude 的说明（整段复制）

```
请在 gemini.google.com 用我已登录的账号帮我生成游戏美术图。规则：
1. 每个“对话”标题下的提示词，都在 Gemini 里新开一个对话来做；同一个对话标题下的提示词按顺序在同一个对话里发，不要新开。
2. 每条提示词原样粘贴发送，不要改写、不要翻译。
3. 每条提示词生成后，把这张图下载到电脑（点图片上的下载按钮）。如果 Gemini 一次给了多张，全部下载。
4. 每下载一张，记下“提示词编号 → 下载的文件名”，最后把这张对照表发给我。
5. 如果 Gemini 拒绝生成、只回文字、或者图明显不对（多个人、有文字、不是灰色背景、不是竖图），就在同一个对话里再发一次同样的提示词；连续失败两次就跳过，并在对照表里写明。
6. 不要点击 Gemini 回复里的外部链接，不要付费、不要开通任何订阅。
7. 每一轮做完就停下来告诉我，不要自己开始下一轮。
```

## 2. 第一轮：先试画风（做完先发给 Claude Code 看效果）

### 对话 A · 主页背景

**A1**（存为 lobby）

```
Anime background art, interior of an exclusive private card salon at night, art deco details, warm low lighting, deep velvet curtains, small chandeliers, tall windows with a blurred city at night behind, an open softly lit space in the centre where a character will stand, muted warm-grey palette with faint terracotta accents, cinematic depth of field, no people, no text, no logo. Wide image, 16:9 aspect ratio.
```

**A2**（再抽一张备选）

```
Make another version of the same scene with a different composition, same style and palette, 16:9.
```

### 对话 B · 葵

**B1**（葵 idle）

```
Anime gacha game character art, polished cel shading with soft gradient lighting, crisp clean lineart, elegant adult woman in her twenties, mature proportions, night-time private card salon theme, muted warm palette with one accent colour, single character only, plain flat mid-grey background (#808080), no text, no logo, no watermark, no frame. Vertical image, 3:4 aspect ratio. Character: Aoi, a graceful hostess of an exclusive card salon. Long straight dark-green hair, soft green eyes, gentle knowing smile. Emerald off-shoulder satin evening gown, pearl necklace and pearl drop earrings. Accent colour emerald #5fbf8f. Half body from head to waist, centred, turned slightly towards the viewer, relaxed neutral expression, hands resting naturally.
```

**B2**（再抽一张备选）

```
Make another version of the same character with the same design, slightly different pose, same plain grey background, 3:4.
```

第一轮做完把 A1、A2、B1、B2 的图发回来，确认画风后再继续。

## 3. 第二轮：葵的其余表情（继续在对话 B 里发）

先告诉 Gemini 用哪张当标准像：如果 B1 更好，先发 `Use the first character image in this conversation as the reference for everything that follows.`，如果 B2 更好，把 first 改成 second。

**B3**（葵 smug · 得意）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, smug confident smile, slightly raised chin, one hand near her face. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**B4**（葵 nervous · 紧张）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, nervous expression, eyes glancing aside, a small sweat drop, fingers fidgeting. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**B5**（葵 angry · 生气）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, annoyed angry expression, furrowed brows, arms crossed. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**B6**（葵 shock · 震惊）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, shocked wide-eyed expression, mouth open, leaning back. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**B7**（葵 cry · 输光）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, defeated teary expression, looking down, shoulders slumped. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**B8**（葵 win · 胜利）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, triumphant victory pose, one hand raised holding a fan of playing cards, a few poker chips flying around her, dramatic rim light. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

## 4. 第三轮：其余五个角色

每个角色一个新对话。先发 idle，满意了再按顺序发后面 6 条；不满意就在同一个对话里再发一次 idle，挑好的那张后再继续。

### 对话 C · 凛（rin）

**C1**（凛 idle）

```
Anime gacha game character art, polished cel shading with soft gradient lighting, crisp clean lineart, elegant adult woman in her twenties, mature proportions, night-time private card salon theme, muted warm palette with one accent colour, single character only, plain flat mid-grey background (#808080), no text, no logo, no watermark, no frame. Vertical image, 3:4 aspect ratio. Character: Rin, a cold and precise high-stakes player. Long straight black hair with dark crimson streaks, sharp red eyes. Fitted black waistcoat over a white shirt, thin crimson tie, black leather gloves. Accent colour crimson #d94f5c. Half body from head to waist, centred, turned slightly towards the viewer, relaxed neutral expression, hands resting naturally.
```

**C2**（凛 smug · 得意）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, smug confident smile, slightly raised chin, one hand near her face. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**C3**（凛 nervous · 紧张）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, nervous expression, eyes glancing aside, a small sweat drop, fingers fidgeting. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**C4**（凛 angry · 生气）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, annoyed angry expression, furrowed brows, arms crossed. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**C5**（凛 shock · 震惊）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, shocked wide-eyed expression, mouth open, leaning back. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**C6**（凛 cry · 输光）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, defeated teary expression, looking down, shoulders slumped. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**C7**（凛 win · 胜利）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, triumphant victory pose, one hand raised holding a fan of playing cards, a few poker chips flying around her, dramatic rim light. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

### 对话 D · 团子（dango）

**D1**（团子 idle）

```
Anime gacha game character art, polished cel shading with soft gradient lighting, crisp clean lineart, elegant adult woman in her twenties, mature proportions, night-time private card salon theme, muted warm palette with one accent colour, single character only, plain flat mid-grey background (#808080), no text, no logo, no watermark, no frame. Vertical image, 3:4 aspect ratio. Character: Dango, a cheerful, slightly clumsy young woman who never folds. Honey-blonde twin tails with round hair ornaments, bright amber eyes. Oversized cream knit cardigan over a mustard-yellow dress. Accent colour honey #f2b84b. Clearly an adult. Half body from head to waist, centred, turned slightly towards the viewer, relaxed neutral expression, hands resting naturally.
```

**D2**（团子 smug · 得意）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, smug confident smile, slightly raised chin, one hand near her face. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**D3**（团子 nervous · 紧张）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, nervous expression, eyes glancing aside, a small sweat drop, fingers fidgeting. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**D4**（团子 angry · 生气）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, annoyed angry expression, furrowed brows, arms crossed. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**D5**（团子 shock · 震惊）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, shocked wide-eyed expression, mouth open, leaning back. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**D6**（团子 cry · 输光）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, defeated teary expression, looking down, shoulders slumped. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**D7**（团子 win · 胜利）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, triumphant victory pose, one hand raised holding a fan of playing cards, a few poker chips flying around her, dramatic rim light. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

### 对话 E · 焰（homura）

**E1**（焰 idle）

```
Anime gacha game character art, polished cel shading with soft gradient lighting, crisp clean lineart, elegant adult woman in her twenties, mature proportions, night-time private card salon theme, muted warm palette with one accent colour, single character only, plain flat mid-grey background (#808080), no text, no logo, no watermark, no frame. Vertical image, 3:4 aspect ratio. Character: Homura, a reckless thrill-seeker. Short messy orange-red hair, amber eyes, wide confident grin. Cropped black leather jacket over a black top, gold hoop earrings. Accent colour flame orange #ff7a2f. Half body from head to waist, centred, turned slightly towards the viewer, relaxed neutral expression, hands resting naturally.
```

**E2**（焰 smug · 得意）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, smug confident smile, slightly raised chin, one hand near her face. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**E3**（焰 nervous · 紧张）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, nervous expression, eyes glancing aside, a small sweat drop, fingers fidgeting. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**E4**（焰 angry · 生气）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, annoyed angry expression, furrowed brows, arms crossed. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**E5**（焰 shock · 震惊）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, shocked wide-eyed expression, mouth open, leaning back. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**E6**（焰 cry · 输光）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, defeated teary expression, looking down, shoulders slumped. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**E7**（焰 win · 胜利）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, triumphant victory pose, one hand raised holding a fan of playing cards, a few poker chips flying around her, dramatic rim light. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

### 对话 F · 静（shizuka）

**F1**（静 idle）

```
Anime gacha game character art, polished cel shading with soft gradient lighting, crisp clean lineart, elegant adult woman in her twenties, mature proportions, night-time private card salon theme, muted warm palette with one accent colour, single character only, plain flat mid-grey background (#808080), no text, no logo, no watermark, no frame. Vertical image, 3:4 aspect ratio. Character: Shizuka, a calm, almost expressionless strategist. Silver-blue bob haircut, thin-framed glasses, grey-blue eyes. High-collar slate-blue modern qipao-style dress. Accent colour mist blue #7fa7c9. Half body from head to waist, centred, turned slightly towards the viewer, relaxed neutral expression, hands resting naturally.
```

**F2**（静 smug · 得意）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, smug confident smile, slightly raised chin, one hand near her face. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**F3**（静 nervous · 紧张）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, nervous expression, eyes glancing aside, a small sweat drop, fingers fidgeting. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**F4**（静 angry · 生气）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, annoyed angry expression, furrowed brows, arms crossed. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**F5**（静 shock · 震惊）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, shocked wide-eyed expression, mouth open, leaning back. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**F6**（静 cry · 输光）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, defeated teary expression, looking down, shoulders slumped. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**F7**（静 win · 胜利）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, triumphant victory pose, one hand raised holding a fan of playing cards, a few poker chips flying around her, dramatic rim light. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

### 对话 G · 狐（kitsune）

**G1**（狐 idle）

```
Anime gacha game character art, polished cel shading with soft gradient lighting, crisp clean lineart, elegant adult woman in her twenties, mature proportions, night-time private card salon theme, muted warm palette with one accent colour, single character only, plain flat mid-grey background (#808080), no text, no logo, no watermark, no frame. Vertical image, 3:4 aspect ratio. Character: Kitsune, a playful bluffer. Long lavender-grey hair styled into two fox-ear-like peaks, violet eyes, sly smile. Black and violet kimono-inspired cocktail dress, holding a folding fan. Accent colour violet #a77be0. Half body from head to waist, centred, turned slightly towards the viewer, relaxed neutral expression, hands resting naturally.
```

**G2**（狐 smug · 得意）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, smug confident smile, slightly raised chin, one hand near her face. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**G3**（狐 nervous · 紧张）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, nervous expression, eyes glancing aside, a small sweat drop, fingers fidgeting. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**G4**（狐 angry · 生气）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, annoyed angry expression, furrowed brows, arms crossed. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**G5**（狐 shock · 震惊）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, shocked wide-eyed expression, mouth open, leaning back. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**G6**（狐 cry · 输光）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, defeated teary expression, looking down, shoulders slumped. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

**G7**（狐 win · 胜利）

```
Use the character in the image you just made as the exact reference: same face, same hair, same outfit, same colours, same art style. Make a new image where only the pose and expression change: half body from head to waist, centred, triumphant victory pose, one hand raised holding a fan of playing cards, a few poker chips flying around her, dramatic rim light. Keep the plain flat mid-grey background (#808080), no text, vertical 3:4 aspect ratio.
```

## 5. 第四轮：牌桌背景

### 对话 H · 牌桌背景

**H1**（存为 table）

```
Anime background art, the same kind of exclusive night card salon seen from a seated player's eye level, the area where a card table would be is left empty and dark, warm pools of light from above, blurred bar and windows in the background, muted warm-grey palette, no table, no people, no text, no logo. Wide image, 16:9 aspect ratio.
```

**H2**（再抽一张备选）

```
Make another version of the same scene with a different composition, same style and palette, 16:9.
```

## 6. 备注

- 网页版 Gemini 生成的图右下角可能有一个小的 Gemini 标志。角色图抠图时背景会连标志一起去掉；背景图我会裁掉或修掉角落。
- 一个账号每天能生成的图片数量有限，满了就第二天继续，从中断的那条接着发。
- 不要让它“画得像某某作品/某某画师”，避免版权问题。
