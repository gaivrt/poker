// Table layout in design pixels (1920x1080). Mirrors docs/03 §2.1.
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

export interface Point { x: number; y: number }

export interface SeatLayout {
  avatar: Point;        // avatar centre
  avatarSize: { w: number; h: number };
  cards: Point;         // centre of the first hole card
  cardGap: number;      // offset to the second card
  bet: Point;           // where this seat's bet sits on the felt
  dealer: Point;        // dealer button position
}

export const TABLE_CENTER: Point = { x: 960, y: 500 };
export const POT_POS: Point = { x: 960, y: 357 };
export const BOARD_Y = 477;
export const BOARD_X = [712, 836, 960, 1084, 1208];
export const BOARD_CARD = { w: 110, h: 154 };
export const HERO_CARD = { w: 140, h: 196 };
export const OPP_CARD = { w: 64, h: 90 };

const OPP = { w: 150, h: 190 };

// Seat 0 is the human; seats go clockwise (the next seat is on the screen's left).
export const SEATS: SeatLayout[] = [
  { avatar: { x: 645, y: 948 }, avatarSize: { w: 170, h: 215 }, cards: { x: 835, y: 938 }, cardGap: 150, bet: { x: 960, y: 690 }, dealer: { x: 528, y: 870 } },
  { avatar: { x: 250, y: 610 }, avatarSize: OPP, cards: { x: 372, y: 585 }, cardGap: 30, bet: { x: 480, y: 590 }, dealer: { x: 250, y: 488 } },
  { avatar: { x: 360, y: 245 }, avatarSize: OPP, cards: { x: 482, y: 235 }, cardGap: 30, bet: { x: 575, y: 365 }, dealer: { x: 455, y: 138 } },
  { avatar: { x: 960, y: 135 }, avatarSize: OPP, cards: { x: 1082, y: 128 }, cardGap: 30, bet: { x: 960, y: 302 }, dealer: { x: 838, y: 62 } },
  { avatar: { x: 1560, y: 245 }, avatarSize: OPP, cards: { x: 1408, y: 235 }, cardGap: 30, bet: { x: 1345, y: 365 }, dealer: { x: 1465, y: 138 } },
  { avatar: { x: 1670, y: 610 }, avatarSize: OPP, cards: { x: 1518, y: 585 }, cardGap: 30, bet: { x: 1440, y: 590 }, dealer: { x: 1670, y: 488 } },
];

export const FONT = '"PingFang SC","Hiragino Sans","Noto Sans CJK SC","Microsoft YaHei","WenQuanYi Zen Hei",sans-serif';

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
