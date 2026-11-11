// Runs `fn` on the next tick and returns a cleanup that cancels it. Used to
// kick off data fetches from useEffect: the fetch functions set loading state
// up front, and React wants effects to set state from a callback rather than
// synchronously in the effect body. Returning the cleanup also cancels a
// pending kick-off if the deps change (or the component unmounts) first.
export function defer(fn: () => void): () => void {
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}
