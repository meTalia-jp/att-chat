import { buildNewChatHandoffRequest } from './new-chat-handoff.ts';
import type { TurnHandoffCondition, TurnHandoffFixtureTurn } from './new-chat-handoff-turn-experiment.ts';

export const reasoningContinuityFixture: readonly TurnHandoffFixtureTurn[] = [
  { turnNumber:1, role:'User', text:'対向する光の相対速度は一見、光速×2倍のように思えるが、光速度以上の速度はないので、相対速度も光速でOK？？' },
  { turnNumber:2, role:'Assistant', text:'二つの意味を分ける必要があります。\n地上の観測者から見れば、二つの光の間隔は毎秒2cで縮みます。\nこれは接近速度であり、一つの光が2cで運動しているという意味ではありません。\n一方の光から見た他方の速度は、光の静止系を作れないため通常の相対速度として定義できません。' },
  { turnNumber:3, role:'User', text:'2cになるのは距離の縮み方であって、光そのものの速度ではないのですね。\n光については「波であり粒子である」とも言いますが、実際には波でも粒子でもないのでしょうか。' },
  { turnNumber:4, role:'Assistant', text:'光は古典的な波にも古典的な粒子にも完全には一致しません。\n干渉や回折では波のような性質が現れ、検出では一個ずつ局所的に現れます。\n「波でもあり粒子でもある」は両方の特徴が現れるという意味で、\n「波でも粒子でもない」はどちらの古典概念にも完全には収まらないという意味です。' },
  { turnNumber:5, role:'User', text:'日常には存在しないものなので、正確に表現できる言葉がないということでしょうか。' },
  { turnNumber:6, role:'Assistant', text:'日常語だけでは表現しにくい、という意味ではそうです。\n「粒子」「波」「スピン」なども日常語から借りた言葉ですが、量子論での意味は完全には一致しません。\n物理学では専門用語と数式で、状態や観測結果をより正確に記述します。' },
  { turnNumber:7, role:'User', text:'物理の世界の人は数式で会話しているのかも。' },
  { turnNumber:8, role:'Assistant', text:'かなりその面があります。\n数式は量の関係、変化、対称性、保存則などを厳密に表現できます。\nただし数式だけではなく、何を測っているか、どの近似を使うか、各項が何を意味するかは文章や図でも補います。' },
] as const;

export const reasoningContinuityCases = [
  {caseId:'A',targetTurn:2,marker:'毎秒2cで縮みます',question:'じゃあ最初に私が言っていた「相対速度も光速でOK」は、どこが違うの？'},
  {caseId:'B',targetTurn:4,marker:'波でも粒子でもない',question:'私が考えた「波でも粒子でもない」という言い方でもよいの？'},
  {caseId:'C',targetTurn:6,marker:'日常語だけでは表現しにくい',question:'これは「物理学でも正体が分かっていない」という意味ではないの？'},
  {caseId:'D',targetTurn:8,marker:'数式は',question:'じゃあ私が言った「物理の世界の人は数式で会話している」は、どのくらい合っているの？'},
] as const;

const conditions=[
  {condition:'Minimal',before:1,after:0},
  {condition:'Standard',before:3,after:0},
  {condition:'Wide',before:5,after:1},
] as const;

function occurrences(text:string,needle:string){let count=0,offset=0;while((offset=text.indexOf(needle,offset))>=0){count+=1;offset+=needle.length;}return count;}

export function buildReasoningContinuityPreview(caseId:typeof reasoningContinuityCases[number]['caseId'],condition:TurnHandoffCondition){
  const fixtureCase=reasoningContinuityCases.find(item=>item.caseId===caseId),definition=conditions.find(item=>item.condition===condition);
  if(!fixtureCase||!definition)throw new Error('Unknown reasoning continuity fixture');
  const targetIndex=reasoningContinuityFixture.findIndex(turn=>turn.turnNumber===fixtureCase.targetTurn),target=reasoningContinuityFixture[targetIndex];
  if(!target||occurrences(target.text,fixtureCase.marker)!==1)throw new Error('Marker must be unique inside Target Turn');
  const included=reasoningContinuityFixture.slice(Math.max(0,targetIndex-definition.before),Math.min(reasoningContinuityFixture.length,targetIndex+definition.after+1));
  const context=included.map(turn=>`[T${turn.turnNumber} / ${turn.role}${turn.turnNumber===fixtureCase.targetTurn?' / Target':''}]\n${turn.text}`).join('\n\n');
  const firstUserMessage=`## 前の会話からの参考文脈\n\n${context}\n\n## 質問対象\n\n${fixtureCase.marker}\n\n## 質問\n\n${fixtureCase.question}`;
  const request=buildNewChatHandoffRequest(firstUserMessage),includedNumbers=included.map(turn=>turn.turnNumber);
  return {experiment:'new-chat-handoff-user-reasoning-v0.5',case_id:caseId,condition,
    source_conversation:'User reasoning continuity fixture',target_turn:`T${fixtureCase.targetTurn}`,
    included_turn_numbers:includedNumbers.map(value=>`T${value}`),included_turn_count:included.length,input_chars:firstUserMessage.length,
    marker_source_text:fixtureCase.marker,question:fixtureCase.question,first_user_message:firstUserMessage,request,
    automatic:{system_user_only:request.messages.length===2&&request.messages[0].role==='system'&&request.messages[1].role==='user',
      old_history_not_sent_as_messages:request.messages.length===2,turn_order_preserved:includedNumbers.every((value,index,array)=>index===0||array[index-1]<value),
      target_turn_included_exactly_once:occurrences(firstUserMessage,`[T${fixtureCase.targetTurn} / ${target.role} / Target]`)===1&&occurrences(context,target.text)===1,
      marker_unique_in_target:occurrences(target.text,fixtureCase.marker)===1,marker_included:firstUserMessage.includes(fixtureCase.marker),
      question_included:firstUserMessage.includes(fixtureCase.question),fixed_settings:request.model==='google/gemma-4-12b-qat'&&request.temperature===0&&request.max_tokens===2048,
      no_automatic_retry:true,no_production_db_write:true},human_review:'pending' as const};
}

export function allReasoningContinuityPreviews(){return reasoningContinuityCases.flatMap(fixtureCase=>conditions.map(item=>buildReasoningContinuityPreview(fixtureCase.caseId,item.condition)));}
