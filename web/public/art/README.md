# 美术与音频素材（热插拔）

把文件按下面的路径放进来，游戏会自动使用；缺少的文件由程序绘制的占位形象代替。
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
  deal.mp3 flip.mp3 chip.mp3 slide.mp3 thud.mp3 whoosh.mp3 heartbeat.mp3 impact.mp3 chime.mp3 riser.mp3 tick.mp3 cheer.mp3
```
