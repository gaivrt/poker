// Placeholder cast. Indices match ai::personalityPresets() in ai/src/bot.cpp.
// Names, colours and lines are placeholders until the real characters are designed.
//
// `talk` is what a character says when it (or the human playing it) sends a line
// of table talk (docs/06-mind-games.md). `lines` are the system's own flavour lines,
// triggered only by public results (winning, being knocked out, going all-in).

import { Expression, Gesture, LineKind, Sticker } from './engine';

/** What a character says for each kind of table talk (two variants each). */
export type TalkLines = Record<LineKind, [string, string]>;

export interface Character {
  name: string;
  style: string;
  color: number;
  /** The court card this character is drawn as (docs/10): rank then suit, e.g. "Q♠". */
  court: string;
  talk: TalkLines;
  lines: {
    raise: string[];
    call: string[];
    allIn: string[];
    win: string[];
    out: string[];
  };
}

export const HERO: Character = {
  name: '你',
  style: '玩家',
  color: 0x8f6bd6,
  court: 'A♠',
  talk: {
    [LineKind.Taunt]: ['你敢跟吗？', '不服就跟。'],
    [LineKind.Weak]: ['唉，这手牌……', '今天手气真差。'],
    [LineKind.Confident]: ['这把我稳了。', '我的牌很好。'],
    [LineKind.Probe]: ['你是不是早就中了？', '你真的有牌吗？'],
    [LineKind.Hurry]: ['快点吧～', '想好了吗？'],
    [LineKind.Plead]: ['放过我吧……', '别加了别加了。'],
  },
  lines: { raise: [], call: [], allIn: ['全部押上！'], win: [], out: [] },
};

export const CAST: Character[] = [
  {
    name: '凛', style: '紧凶型', color: 0xd94f5c, court: 'Q♠',
    talk: {
      [LineKind.Taunt]: ['跟得起就跟。', '犹豫什么？'],
      [LineKind.Weak]: ['……这手一般。', '不太妙。'],
      [LineKind.Confident]: ['结果已经定了。', '这把是我的。'],
      [LineKind.Probe]: ['你在怕什么？', '你真的有牌？'],
      [LineKind.Hurry]: ['快点。', '时间不多了。'],
      [LineKind.Plead]: ['……适可而止吧。', '别太过分。'],
    },
    lines: {
      raise: ['就这么定了。', '这手我来。', '跟不跟，你自己看。'],
      call: ['我看看。', '陪你走一趟。'],
      allIn: ['全部押上——结束吧。'],
      win: ['意料之中。', '收下了。'],
      out: ['……下次不会了。'],
    },
  },
  {
    name: '团子', style: '跟注站', color: 0xf2b84b, court: 'Q♥',
    talk: {
      [LineKind.Taunt]: ['来呀来呀～', '你、你敢跟吗！'],
      [LineKind.Weak]: ['呜……牌好差……', '这把不太行……'],
      [LineKind.Confident]: ['嘿嘿，这把赢定了！', '我的牌超——强的！'],
      [LineKind.Probe]: ['你是不是拿到好牌了？', '诶，你有对子吗？'],
      [LineKind.Hurry]: ['快点快点～', '等得好无聊～'],
      [LineKind.Plead]: ['放过我嘛……', '手下留情呀……'],
    },
    lines: {
      raise: ['嘿嘿，加一点点～'],
      call: ['跟！跟！', '我才不弃牌呢～', '来都来了！'],
      allIn: ['全、全部都给你看！'],
      win: ['诶？我赢了？'],
      out: ['呜……筹码没了……'],
    },
  },
  {
    name: '焰', style: '疯狂型', color: 0xff7a2f, court: 'J♥',
    talk: {
      [LineKind.Taunt]: ['有种就跟！', '怕了吗？'],
      [LineKind.Weak]: ['切，烂牌。', '今天手气真差！'],
      [LineKind.Confident]: ['这把稳赢！', '我的牌在燃烧！'],
      [LineKind.Probe]: ['你在诈唬吧？', '敢说你有牌？'],
      [LineKind.Hurry]: ['磨蹭什么！', '快点决定！'],
      [LineKind.Plead]: ['别、别加了！', '给条活路！'],
    },
    lines: {
      raise: ['加注！再加注！', '太无聊了，来点刺激的！'],
      call: ['这点小钱？跟了。'],
      allIn: ['ALL IN！燃起来吧！'],
      win: ['哈哈哈！就是这样！'],
      out: ['可恶，下局再烧一次！'],
    },
  },
  {
    name: '静', style: '岩石型', color: 0x7fa7c9, court: 'Q♣',
    talk: {
      [LineKind.Taunt]: ['……请。', '……跟吧。'],
      [LineKind.Weak]: ['……唔。', '……不太好。'],
      [LineKind.Confident]: ['……足够了。', '……就这样。'],
      [LineKind.Probe]: ['……你中了？', '……真的吗？'],
      [LineKind.Hurry]: ['……请决定。', '……时间。'],
      [LineKind.Plead]: ['……饶了我。', '……够了。'],
    },
    lines: {
      raise: ['……加注。'],
      call: ['……跟注。'],
      allIn: ['……时机到了。'],
      win: ['稳妥。'],
      out: ['……失算了。'],
    },
  },
  {
    name: '葵', style: '平衡型', color: 0x5fbf8f, court: 'Q♦',
    talk: {
      [LineKind.Taunt]: ['要不要试试看？', '跟上来吧～'],
      [LineKind.Weak]: ['这手牌有点为难呢。', '嗯……不太好。'],
      [LineKind.Confident]: ['这次我很有把握。', '抱歉，这把是我的。'],
      [LineKind.Probe]: ['你的牌，很好吗？', '让我猜猜你拿着什么～'],
      [LineKind.Hurry]: ['慢慢来，不过别太慢哦。', '该你了～'],
      [LineKind.Plead]: ['请手下留情～', '放我一马吧？'],
    },
    lines: {
      raise: ['那就加注吧。', '嗯，这个尺度刚好。'],
      call: ['跟注，看看下一张。'],
      allIn: ['我全下，请慎重考虑哦。'],
      win: ['承让了～'],
      out: ['今天就到这里吧。'],
    },
  },
  {
    name: '狐', style: '诈唬型', color: 0xa77be0, court: 'J♦',
    talk: {
      [LineKind.Taunt]: ['呵呵，你敢吗？', '跟呀，我等你哦～'],
      [LineKind.Weak]: ['哎呀，牌好烂呢～', '这把真的不行……'],
      [LineKind.Confident]: ['稳了稳了～', '这把我赢定啦～'],
      [LineKind.Probe]: ['你的眼神出卖你了哦～', '让我看看你在想什么～'],
      [LineKind.Hurry]: ['别让姐姐等太久～', '快点嘛～'],
      [LineKind.Plead]: ['放过人家嘛～', '呜呜，别欺负我～'],
    },
    lines: {
      raise: ['你猜我拿着什么？', '呵呵，要加注了哦。'],
      call: ['有点意思。'],
      allIn: ['要不要赌一把？全下。'],
      win: ['被骗到了吧？……还是没有呢？'],
      out: ['哎呀，玩脱了。'],
    },
  },
];

export function characterFor(rosterIndex: number): Character {
  return rosterIndex < 0 ? HERO : CAST[rosterIndex % CAST.length];
}

export function pick<T>(items: T[]): T | undefined {
  return items.length ? items[Math.floor(Math.random() * items.length)] : undefined;
}

export const LINE_LABEL: Record<LineKind, string> = {
  [LineKind.Taunt]: '挑衅',
  [LineKind.Weak]: '示弱',
  [LineKind.Confident]: '自信',
  [LineKind.Probe]: '试探',
  [LineKind.Hurry]: '催促',
  [LineKind.Plead]: '求饶',
};

export const EXPRESSION_LABEL: Record<Expression, string> = {
  [Expression.Calm]: '平静',
  [Expression.Smug]: '得意',
  [Expression.Nervous]: '紧张',
  [Expression.Smile]: '微笑',
  [Expression.Angry]: '生气',
};

export const EXPRESSION_COLOR: Record<Expression, number> = {
  [Expression.Calm]: 0x8a86a6,
  [Expression.Smug]: 0xe0a630,
  [Expression.Nervous]: 0x4f8fd6,
  [Expression.Smile]: 0xe0709a,
  [Expression.Angry]: 0xd64545,
};

export const GESTURE_LABEL: Record<Gesture, string> = {
  [Gesture.RecheckCards]: '再看底牌',
  [Gesture.FiddleChips]: '摸筹码',
  [Gesture.Stare]: '盯着',
  [Gesture.Sigh]: '叹气',
};

/** What everyone sees a gesture as. */
export function gestureCaption(g: Gesture, targetName?: string): string {
  switch (g) {
    case Gesture.RecheckCards: return '又看了一眼底牌';
    case Gesture.FiddleChips: return '摸了摸筹码';
    case Gesture.Stare: return targetName ? `盯着${targetName}` : '盯着桌面';
    case Gesture.Sigh: return '叹了口气';
  }
}

export function talkLine(c: Character, kind: LineKind): string {
  const pair = c.talk[kind];
  return pair[Math.floor(Math.random() * 2)];
}

/** 表情包 captions (button labels and the text under each sticker). */
export const STICKER_LABEL: Record<Sticker, string> = {
  [Sticker.Smug]: '嘿嘿',
  [Sticker.Taunt]: '来啊！',
  [Sticker.Question]: '？？？',
  [Sticker.Shock]: '！？',
  [Sticker.Cry]: '呜呜…',
  [Sticker.Angry]: '哼！',
  [Sticker.GoodHand]: '好牌！',
  [Sticker.Thinking]: '嗯……',
};
