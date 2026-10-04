// First-person table layout in design pixels (1920×1080). See docs/07 §4 and docs/08 §1.
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

export interface Point { x: number; y: number }

/** Small UI text: Inter, with Noto Sans SC for Chinese. */
export const FONT = '"Inter","Noto Sans SC","PingFang SC","Hiragino Sans","Microsoft YaHei",system-ui,sans-serif';
/** Names, titles and big words: Georgia with a Song face for Chinese (bold, 28px and up). */
export const FONT_DISPLAY = 'Georgia,"Noto Serif SC","Songti SC","STSong",SimSun,serif';
/** Brush calligraphy for hand names and big words (胜负揭晓, 四条, 本局主役...). */
export const FONT_BRUSH = '"Ma Shan Zheng","ZCOOL QingKe HuangYou","Noto Sans SC","PingFang SC",serif';
/** Numbers: Georgia's old-style figures read warm and calm. */
export const FONT_NUM = 'Georgia,"Noto Serif SC",Cambria,serif';

export interface SeatSpot {
  base: Point;     // bottom-centre of the character art (hidden below the table rim)
  height: number;  // displayed height of the art (depth: nearer seats are bigger)
  plate: Point;    // name plate on the table edge; chips leave from here
  plateTilt: number;
  cards: Point;    // where its two cards lie on the felt
  cardScale: number;
  bet: Point;      // its bet on the felt
  dealer: Point;   // dealer button when it has the button
}

// Seat 0 is you (the camera). Seats go clockwise: seat 1 is on your left.
export const SPOTS: SeatSpot[] = [
  { base: { x: 185, y: 1150 }, height: 470, plate: { x: 205, y: 1040 }, plateTilt: -0.02, cards: { x: 880, y: 1050 }, cardScale: 1, bet: { x: 700, y: 885 }, dealer: { x: 340, y: 1000 } },
  { base: { x: 205, y: 870 }, height: 660, plate: { x: 300, y: 650 }, plateTilt: 0.07, cards: { x: 410, y: 745 }, cardScale: 0.9, bet: { x: 520, y: 735 }, dealer: { x: 420, y: 620 } },
  { base: { x: 600, y: 730 }, height: 540, plate: { x: 600, y: 590 }, plateTilt: 0.03, cards: { x: 505, y: 655 }, cardScale: 0.78, bet: { x: 665, y: 672 }, dealer: { x: 715, y: 575 } },
  { base: { x: 960, y: 690 }, height: 500, plate: { x: 960, y: 562 }, plateTilt: -0.02, cards: { x: 830, y: 612 }, cardScale: 0.72, bet: { x: 1090, y: 618 }, dealer: { x: 1075, y: 548 } },
  { base: { x: 1320, y: 730 }, height: 540, plate: { x: 1320, y: 590 }, plateTilt: -0.03, cards: { x: 1415, y: 655 }, cardScale: 0.78, bet: { x: 1255, y: 672 }, dealer: { x: 1205, y: 575 } },
  { base: { x: 1715, y: 870 }, height: 660, plate: { x: 1620, y: 650 }, plateTilt: -0.07, cards: { x: 1510, y: 745 }, cardScale: 0.9, bet: { x: 1400, y: 735 }, dealer: { x: 1500, y: 620 } },
];

export const SHOE: Point = { x: 960, y: 520 };          // where the dealer deals from
export const POT_POS: Point = { x: 960, y: 690 };
export const BOARD_Y = 782;
export const BOARD_X = [740, 850, 960, 1070, 1180];
export const BOARD_CARD = { w: 96, h: 134 };
export const HERO_CARD = { w: 200, h: 280 };
export const OPP_CARD = { w: 60, h: 84 };

/** Where a character's head ends up for a given spot (art: head at 39% from the top). */
export function headOf(s: SeatSpot): Point {
  return { x: s.base.x, y: s.base.y - s.height * 0.61 };
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
