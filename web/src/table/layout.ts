// Table layout in design pixels (1920×1080). See docs/10 (牌面) and docs/08 §1.
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

export interface Point { x: number; y: number }

export const FONT = '"Noto Sans SC","PingFang SC","Hiragino Sans","Microsoft YaHei","WenQuanYi Zen Hei",sans-serif';
/** Headings and big words: the same sans at its heaviest weight (900). */
export const FONT_DISPLAY = FONT;
/** Big moment words (胜负揭晓, 四条, 本局主役...). Was a brush face; the card-face look keeps one sans. */
export const FONT_BRUSH = FONT;
/** Card ranks, numbers and English: a wide grotesk, like the index on a playing card. */
export const FONT_NUM = '"Archivo Black","Noto Sans SC","Arial Black",sans-serif';

export interface SeatSpot {
  base: Point;     // bottom-centre of the seat's court card (the hero has none: height 0)
  height: number;  // height of that card
  tilt: number;    // its rotation
  plate: Point;    // name and stack under the card; chips leave from here
  plateTilt: number;
  cards: Point;    // where its two cards lie on the table
  cardScale: number;
  bet: Point;      // its bet on the table
  dealer: Point;   // dealer button when it has the button
}

/** Every opponent is a standing court card around the table (docs/10 §5). */
export const SEAT_CARD = { w: 190, h: 266 };

// Seat 0 is you (the camera). Seats go clockwise: seat 1 is on your left.
export const SPOTS: SeatSpot[] = [
  { base: { x: 220, y: 900 }, height: 0, tilt: 0, plate: { x: 220, y: 990 }, plateTilt: 0, cards: { x: 865, y: 935 }, cardScale: 1, bet: { x: 700, y: 800 }, dealer: { x: 600, y: 860 } },
  { base: { x: 170, y: 678 }, height: 266, tilt: -0.07, plate: { x: 170, y: 712 }, plateTilt: 0, cards: { x: 340, y: 560 }, cardScale: 0.9, bet: { x: 390, y: 665 }, dealer: { x: 330, y: 470 } },
  { base: { x: 520, y: 383 }, height: 266, tilt: -0.05, plate: { x: 520, y: 416 }, plateTilt: 0, cards: { x: 690, y: 432 }, cardScale: 0.85, bet: { x: 640, y: 505 }, dealer: { x: 430, y: 480 } },
  { base: { x: 960, y: 343 }, height: 266, tilt: 0, plate: { x: 960, y: 376 }, plateTilt: 0, cards: { x: 830, y: 440 }, cardScale: 0.85, bet: { x: 1080, y: 465 }, dealer: { x: 1110, y: 400 } },
  { base: { x: 1400, y: 383 }, height: 266, tilt: 0.05, plate: { x: 1400, y: 416 }, plateTilt: 0, cards: { x: 1230, y: 432 }, cardScale: 0.85, bet: { x: 1270, y: 505 }, dealer: { x: 1490, y: 480 } },
  { base: { x: 1750, y: 678 }, height: 266, tilt: 0.07, plate: { x: 1750, y: 712 }, plateTilt: 0, cards: { x: 1580, y: 560 }, cardScale: 0.9, bet: { x: 1530, y: 665 }, dealer: { x: 1590, y: 470 } },
];

export const SHOE: Point = { x: 960, y: 470 };          // where the dealer deals from
export const POT_POS: Point = { x: 960, y: 520 };
export const BOARD_Y = 630;
export const BOARD_X = [752, 856, 960, 1064, 1168];
export const BOARD_CARD = { w: 92, h: 128 };
export const HERO_CARD = { w: 170, h: 238 };
export const OPP_CARD = { w: 60, h: 84 };

/** Where a character's face is: in the upper part of her card (the hero: at her name). */
export function headOf(s: SeatSpot): Point {
  return { x: s.base.x, y: s.base.y - s.height * 0.68 };
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
