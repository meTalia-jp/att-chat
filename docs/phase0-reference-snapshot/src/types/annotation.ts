export type AnnotationStatus = 'pending' | 'completed_changed' | 'completed_unchanged'
export type AnchorStatus = 'resolved' | 'unresolved'
export type DraftAnchorMethod = 'offset' | 'context' | 'block'
export type HighlightColor = 'yellow' | 'green'
export type ReviewTag = 'question' | 'rewrite' | 'delete' | 'add' | 'fact_check' | 'note'

export type TextAnchor = {
  targetText: string
  sourceText: string
  contextBefore: string
  contextAfter: string
  sourceStart: number
  sourceEnd: number
  startLine?: number
  endLine?: number
  nodePath?: string
  paragraphId?: string
  blockText?: string
  blockType?: string
}

export type OriginalAnchor = TextAnchor

export type DraftAnchor = {
  start: number
  end: number
  text: string
  method: DraftAnchorMethod
  confidence?: number
}

export type RedPenAnnotation = TextAnchor & {
  id: string
  type: 'red_pen'
  reviewText?: string
  replacementText?: string
  status: AnnotationStatus
  anchorStatus: AnchorStatus
  originalAnchor: OriginalAnchor
  draftAnchor: DraftAnchor | null
  proposalApplied?: boolean
  resultText?: string
  reviewer?: { id: string; name: string }
  createdAt?: string
  tag?: ReviewTag | null
}

export type HighlightAnnotation = TextAnchor & {
  id: string
  type: 'highlight'
  color: HighlightColor
  comment: string | null
  reviewer: { id: string; name: string }
  createdAt: string
  originalAnchor: OriginalAnchor
  tag?: ReviewTag | null
}

export type DocumentSelection = TextAnchor & {
  range: {
    startOffset: number
    endOffset: number
    startContainerType: string
    endContainerType: string
    multipleNodes: boolean
  }
}
