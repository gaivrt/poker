# 美术与音频素材（热插拔）

把文件按下面的路径放进来，游戏会自动使用；缺少的文件由程序绘制的占位形象代替。
图片可以是 `.webp`（优先）或 `.png`。角色只要有 idle，缺少的其他姿态先用 idle 代替，不会混进占位剪影。
原图抠图：`cd web && node tools/cutout.mjs <原图> public/art/characters/<角色ID>/idle.webp --bottom 0.75`（纯色底，`--bottom` 裁掉下面 25%）。
开发服务器运行时放入新文件会自动刷新。完整规范见 `docs/08-presentation.md` 第 6 节。

```
characters/<角色ID>/        角色ID：player（你）、rin（凛）、dango（团子）、homura（焰）、
                            shizuka（静）、aoi（葵）、kitsune（狐）
  idle.png smug.png nervous.png angry.png shock.png cry.png   半身，1200×1600，透明背景，腰部在图片底边
  win.png                                                     胜利姿势，1200×1600，透明背景
  stickers/smug.png taunt.png question.png shock.png cry.png angry.png goodhand.png thinking.png   512×512
backgrounds/
  table.png      牌桌场景背景（不含桌子），1920×1080 或 3840×2160
  lobby.png      主页背景
audio/
  音效：deal flip chip slide thud whoosh whoosh2 heartbeat impact chime riser tick cheer
        thunder bell glass ooh crack                    （.mp3、.ogg 或 .wav）
  音乐：bgm-lobby  主页循环        bgm-table   牌桌循环
        bgm-tension 全下时叠加的紧张层（和 bgm-table 同速度、同长度，循环）
        sting-win   结算前三名的短乐句   sting-lose  结算后三名的短乐句
```

没有音乐文件时，游戏会用程序合成一段慵懒的爵士循环（走路贝斯、电钢琴和弦、刷子鼓）作为占位。
