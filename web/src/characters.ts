// Placeholder cast. Indices match ai::personalityPresets() in ai/src/bot.cpp.
// Names, colours and lines are placeholders until the real characters are designed.
//
// Presentation rule (docs/03 §3.1): lines are picked ONLY from public actions.
// Value bets and bluffs share the same pool, so a line never hints at the cards.

export interface Character {
  name: string;
  style: string;
  color: number;
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
  lines: { raise: [], call: [], allIn: ['全部押上！'], win: [], out: [] },
};

export const CAST: Character[] = [
  {
    name: '凛', style: '紧凶型', color: 0xd94f5c,
    lines: {
      raise: ['就这么定了。', '这手我来。', '跟不跟，你自己看。'],
      call: ['我看看。', '陪你走一趟。'],
      allIn: ['全部押上——结束吧。'],
      win: ['意料之中。', '收下了。'],
      out: ['……下次不会了。'],
    },
  },
  {
    name: '团子', style: '跟注站', color: 0xf2b84b,
    lines: {
      raise: ['嘿嘿，加一点点～'],
      call: ['跟！跟！', '我才不弃牌呢～', '来都来了！'],
      allIn: ['全、全部都给你看！'],
      win: ['诶？我赢了？'],
      out: ['呜……筹码没了……'],
    },
  },
  {
    name: '焰', style: '疯狂型', color: 0xff7a2f,
    lines: {
      raise: ['加注！再加注！', '太无聊了，来点刺激的！'],
      call: ['这点小钱？跟了。'],
      allIn: ['ALL IN！燃起来吧！'],
      win: ['哈哈哈！就是这样！'],
      out: ['可恶，下局再烧一次！'],
    },
  },
  {
    name: '静', style: '岩石型', color: 0x7fa7c9,
    lines: {
      raise: ['……加注。'],
      call: ['……跟注。'],
      allIn: ['……时机到了。'],
      win: ['稳妥。'],
      out: ['……失算了。'],
    },
  },
  {
    name: '葵', style: '平衡型', color: 0x5fbf8f,
    lines: {
      raise: ['那就加注吧。', '嗯，这个尺度刚好。'],
      call: ['跟注，看看下一张。'],
      allIn: ['我全下，请慎重考虑哦。'],
      win: ['承让了～'],
      out: ['今天就到这里吧。'],
    },
  },
  {
    name: '狐', style: '诈唬型', color: 0xa77be0,
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
