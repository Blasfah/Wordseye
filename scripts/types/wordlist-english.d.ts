declare module 'wordlist-english' {
  /** Keys look like "english/50" or "english/american/35"; SCOWL sizes are incremental. */
  const lists: Record<string, string[] | undefined>;
  export default lists;
}
