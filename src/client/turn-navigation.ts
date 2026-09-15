export function locateTurn(root:ParentNode,turnId:string):HTMLElement|undefined {
  return Array.from(root.querySelectorAll<HTMLElement>('article[data-turn]')).find(element=>element.dataset.turn===turnId);
}
export function jumpToTurn(root:ParentNode,turnId:string) {
  const element=locateTurn(root,turnId);
  if(!element)throw new Error('検索結果のTurnを現在の会話に見つけられません');
  root.querySelectorAll('.related-turn-active').forEach(node=>node.classList.remove('related-turn-active'));
  element.classList.add('related-turn-active');element.tabIndex=-1;
  element.scrollIntoView({block:'center',behavior:'auto'});element.focus({preventScroll:true});
  return ()=>element.classList.remove('related-turn-active');
}
