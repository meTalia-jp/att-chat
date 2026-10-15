// DOMRect coordinates are viewport-relative, so viewportTop is zero.
export function turnJumpScrollTop(top: number, bottom: number, scrollY: number, viewportHeight: number, scrollHeight: number) {
  return Math.max(0,Math.min(scrollHeight-viewportHeight,scrollY+(top+bottom)/2-viewportHeight*0.60));
}

export function currentTurnAtAnchor(turns: readonly { id: string; top: number; bottom: number }[], viewportHeight: number) {
  const anchor=viewportHeight*0.60;
  return turns.reduce<{id:string;distance:number}|null>((best,t)=>{
    const distance=Math.abs((t.top+t.bottom)/2-anchor);
    return !best || distance<best.distance ? {id:t.id,distance} : best;
  },null)?.id ?? null;
}
