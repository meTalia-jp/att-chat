export type ChunkingConfig = {
  minChars: number;
  targetChars: number;
  maxChars: number;
};

export type SentenceUnit = {
  turnId: string;
  blockIndex: number;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
};

export type RetrievalSegment = {
  segmentId: string;
  turnId: string;
  blockIndex: number;
  segmentIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
  charCount: number;
  sentenceCount: number;
  boundaryReason: 'target' | 'block-end' | 'short-hard-boundary' | 'oversized-fallback';
};

const quotePairs = new Map([
  ['「', '」'], ['『', '』'], ['（', '）'], ['【', '】'], ['〈', '〉'], ['《', '》'], ['“', '”'], ['‘', '’']
]);

function trimmedRange(content: string, start: number, end: number) {
  while (start < end && /\s/u.test(content[start])) start += 1;
  while (end > start && /\s/u.test(content[end - 1])) end -= 1;
  return { start, end };
}

export function splitSentenceUnits(turnId: string, content: string): SentenceUnit[] {
  const blocks: Array<{ start: number; end: number }> = [];
  const blockPattern = /\S(?:[\s\S]*?\S)?(?=\n\s*\n|$)/gu;
  for (const match of content.matchAll(blockPattern)) {
    const start = match.index;
    blocks.push({ start, end: start + match[0].length });
  }

  const units: SentenceUnit[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    let sentenceStart = block.start;
    let sentenceIndex = 0;
    const quoteStack: string[] = [];
    for (let cursor = block.start; cursor < block.end; cursor += 1) {
      const expectedCloser = quotePairs.get(content[cursor]);
      if (expectedCloser) { quoteStack.push(expectedCloser); continue; }
      if (quoteStack.at(-1) === content[cursor]) { quoteStack.pop(); continue; }
      if (!'。！？'.includes(content[cursor])) continue;
      if (quoteStack.length) continue;
      let sentenceEnd = cursor + 1;
      while (sentenceEnd < block.end && '。！？'.includes(content[sentenceEnd])) sentenceEnd += 1;
      const range = trimmedRange(content, sentenceStart, sentenceEnd);
      if (range.end > range.start) {
        units.push({ turnId, blockIndex, sentenceIndex, startOffset: range.start, endOffset: range.end, text: content.slice(range.start, range.end) });
        sentenceIndex += 1;
      }
      sentenceStart = sentenceEnd;
      cursor = sentenceEnd - 1;
    }
    const rest = trimmedRange(content, sentenceStart, block.end);
    if (rest.end > rest.start) units.push({ turnId, blockIndex, sentenceIndex, startOffset: rest.start, endOffset: rest.end, text: content.slice(rest.start, rest.end) });
  }
  return units;
}

function fallbackSplit(unit: SentenceUnit, config: ChunkingConfig): SentenceUnit[] {
  if (unit.text.length <= config.maxChars) return [unit];
  const pieces: SentenceUnit[] = [];
  let localStart = 0;
  while (unit.text.length - localStart > config.maxChars) {
    const desiredEnd = Math.min(localStart + config.targetChars, unit.text.length);
    const minEnd = localStart + config.minChars;
    let splitAt = -1;
    for (let index = desiredEnd; index >= minEnd; index -= 1) {
      if ('、，；;\n'.includes(unit.text[index - 1])) { splitAt = index; break; }
    }
    if (splitAt < 0) splitAt = localStart + config.maxChars;
    pieces.push({ ...unit, startOffset: unit.startOffset + localStart, endOffset: unit.startOffset + splitAt, text: unit.text.slice(localStart, splitAt) });
    localStart = splitAt;
  }
  if (localStart < unit.text.length) pieces.push({ ...unit, startOffset: unit.startOffset + localStart, text: unit.text.slice(localStart) });
  return pieces;
}

export function buildRetrievalSegments(turnId: string, content: string, config: ChunkingConfig): { sentences: SentenceUnit[]; segments: RetrievalSegment[] } {
  if (!(config.minChars > 0 && config.minChars <= config.targetChars && config.targetChars <= config.maxChars)) throw new Error('Invalid chunking config');
  const sentences = splitSentenceUnits(turnId, content);
  const expanded = sentences.flatMap(unit => fallbackSplit(unit, config));
  const segments: RetrievalSegment[] = [];
  let segmentIndex = 0;

  for (const blockIndex of [...new Set(expanded.map(unit => unit.blockIndex))]) {
    const blockUnits = expanded.filter(unit => unit.blockIndex === blockIndex);
    let current: SentenceUnit[] = [];
    const emit = (reason: RetrievalSegment['boundaryReason']) => {
      if (!current.length) return;
      const first = current[0], last = current[current.length - 1];
      const text = content.slice(first.startOffset, last.endOffset);
      segments.push({ segmentId: `${turnId}-S${segmentIndex + 1}`, turnId, blockIndex, segmentIndex, startOffset: first.startOffset, endOffset: last.endOffset, text, charCount: text.length, sentenceCount: current.length, boundaryReason: reason });
      segmentIndex += 1;
      current = [];
    };

    for (const unit of blockUnits) {
      if (unit.text.length > config.maxChars) {
        emit('target');
        current = [unit];
        emit('oversized-fallback');
        continue;
      }
      if (current.length) {
        const combinedLength = unit.endOffset - current[0].startOffset;
        const currentLength = current[current.length - 1].endOffset - current[0].startOffset;
        if (combinedLength > config.maxChars || (currentLength >= config.minChars && combinedLength > config.targetChars)) emit('target');
      }
      current.push(unit);
    }

    if (current.length) {
      const currentLength = current[current.length - 1].endOffset - current[0].startOffset;
      const previous = segments.at(-1);
      if (currentLength < config.minChars && previous?.blockIndex === blockIndex && previous.charCount + 1 + currentLength <= config.maxChars) {
        const first = current[0], last = current[current.length - 1];
        previous.endOffset = last.endOffset;
        previous.text = content.slice(previous.startOffset, last.endOffset);
        previous.charCount = previous.text.length;
        previous.sentenceCount += current.length;
        previous.boundaryReason = 'block-end';
        current = [];
      } else emit(currentLength < config.minChars ? 'short-hard-boundary' : 'block-end');
    }
  }
  return { sentences, segments };
}
