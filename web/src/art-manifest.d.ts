declare module 'virtual:art-manifest' {
  /** Paths relative to public/art/, e.g. "characters/rin/idle.png". */
  const files: string[];
  export default files;
  /** Builds that can't serve files (the single-page artifact) embed them: path -> data URI. */
  export const inline: Record<string, string>;
}
