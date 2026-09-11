import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { HighlightAnnotation, RedPenAnnotation } from '../types/annotation'
import { translate, type Locale } from '../i18n'
import { getAttentionBadges, type AttentionBadge } from '../utils/attentionBadges'

type MarkdownViewerProps = {
  markdown: string
  annotations: RedPenAnnotation[]
  highlights: HighlightAnnotation[]
  activeAnnotationId?: string | null
  mode: 'original' | 'draft'
  locale?: Locale
}

type SourcePoint = { line?: number; column?: number; offset?: number }
type SourcePosition = { start?: SourcePoint; end?: SourcePoint }
type HastNode = {
  type?: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  position?: SourcePosition
}

type TextRecord = {
  node: HastNode
  sourceStart: number
  sourceEnd: number
}

const blockTags = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const inlineTags = new Set(['strong', 'em', 'a', 'code'])

function sourceOffsets(position: SourcePosition | undefined) {
  const start = position?.start?.offset
  const end = position?.end?.offset
  return typeof start === 'number' && typeof end === 'number' ? { start, end } : null
}

function resolveTextOffsets(node: HastNode, parent: HastNode | undefined, markdown: string) {
  const value = node.value ?? ''
  const own = sourceOffsets(node.position)
  if (own && markdown.slice(own.start, own.end) === value) return own

  const parentOffsets = sourceOffsets(parent?.position)
  if (!parentOffsets || !value) return null
  const parentSource = markdown.slice(parentOffsets.start, parentOffsets.end)
  const localStart = parentSource.indexOf(value)
  if (localStart < 0 || localStart !== parentSource.lastIndexOf(value)) return null
  return { start: parentOffsets.start + localStart, end: parentOffsets.start + localStart + value.length }
}

function textNode(value: string): HastNode {
  return { type: 'text', value }
}

function elementNode(tagName: string, properties: Record<string, unknown>, children: HastNode[]): HastNode {
  return { type: 'element', tagName, properties, children }
}

function sourceSpan(value: string, sourceStart: number, sourceEnd: number, extra: Record<string, unknown> = {}) {
  return elementNode('span', { 'data-source-start': sourceStart, 'data-source-end': sourceEnd, ...extra }, [textNode(value)])
}

function createSourcePositionPlugin(markdown: string, annotations: RedPenAnnotation[], highlights: HighlightAnnotation[], activeAnnotationId: string | null | undefined, mode: 'original' | 'draft', locale?: Locale) {
  return () => (tree: HastNode) => {
    const t = (key: Parameters<typeof translate>[0], params?: Parameters<typeof translate>[1]) => translate(key, params, locale)
    const records: TextRecord[] = []
    const recordByNode = new Map<HastNode, TextRecord>()

    const collect = (node: HastNode, parent?: HastNode) => {
      if (node.type === 'element' && node.tagName) {
        const offsets = sourceOffsets(node.position)
        node.properties ??= {}
        if (blockTags.has(node.tagName) && offsets) {
          const kind = node.tagName === 'p' ? 'paragraph' : node.tagName.startsWith('h') ? 'heading' : node.tagName
          node.properties['data-source-block'] = 'true'
          node.properties['data-paragraph-id'] = `${kind}_${String(offsets.start).padStart(6, '0')}`
          node.properties['data-source-start'] = offsets.start
          node.properties['data-source-end'] = offsets.end
          node.properties['data-start-line'] = node.position?.start?.line
          node.properties['data-end-line'] = node.position?.end?.line
        }
        if (inlineTags.has(node.tagName) && offsets) {
          node.properties['data-inline-source-start'] = offsets.start
          node.properties['data-inline-source-end'] = offsets.end
          node.properties['data-inline-kind'] = node.tagName === 'a' ? 'link' : node.tagName === 'code' ? 'inline-code' : node.tagName
        }
      }

      if (node.type === 'text') {
        const offsets = resolveTextOffsets(node, parent, markdown)
        if (offsets) {
          const record = { node, sourceStart: offsets.start, sourceEnd: offsets.end }
          records.push(record)
          recordByNode.set(node, record)
        }
      }
      node.children?.forEach(child => collect(child, node))
    }
    collect(tree)

    const activeRanges = [
      ...annotations
        .filter(annotation => mode === 'original' || (
          annotation.draftAnchor
          && markdown.slice(annotation.draftAnchor.start, annotation.draftAnchor.end) === annotation.draftAnchor.text
        ))
        .map(annotation => ({
          kind: 'annotation' as const,
          id: annotation.id,
          anchor: mode === 'original' ? {
            ...annotation,
            sourceStart: annotation.originalAnchor.sourceStart,
            sourceEnd: annotation.originalAnchor.sourceEnd,
          } : {
            ...annotation,
            sourceStart: annotation.draftAnchor!.start,
            sourceEnd: annotation.draftAnchor!.end,
          },
        })),
      ...(mode === 'original' ? highlights.map(highlight => ({
        kind: 'highlight' as const,
        id: highlight.id,
        anchor: highlight,
      })) : []),
    ]
    const firstRecord = new Map<string, HastNode>()
    const lastRecord = new Map<string, HastNode>()
    const emittedAttentionBadges = new Set<string>()
    for (const range of activeRanges) {
      const overlapping = records.filter(record => record.sourceStart < range.anchor.sourceEnd && record.sourceEnd > range.anchor.sourceStart)
      if (overlapping.length) {
        firstRecord.set(range.id, overlapping[0].node)
        lastRecord.set(range.id, overlapping[overlapping.length - 1].node)
      }
    }

    const badgeText = (badge: AttentionBadge) => {
      if (badge.label === 'has_comment') return t('badge.hasComment')
      if (badge.label === 'proposal') return t('badge.proposal')
      if (badge.label === 'deletion_proposal') return t('badge.deleteProposal')
      const tagKeys = {
        question: 'tag.question', rewrite: 'tag.rewrite', delete: 'tag.delete',
        add: 'tag.add', fact_check: 'tag.fact_check', note: 'tag.note',
      } as const
      return t(tagKeys[badge.label])
    }
    const badgeTitle = (badge: AttentionBadge, annotation: RedPenAnnotation | HighlightAnnotation) => {
      if (annotation.type === 'highlight') return annotation.comment ?? badgeText(badge)
      if (badge.kind === 'proposal') return annotation.replacementText ?? badgeText(badge)
      if (badge.kind === 'deletion') return t('badge.deleteProposal')
      return annotation.reviewText ?? annotation.replacementText ?? badgeText(badge)
    }
    const attentionBadgeNodes = (range: { id: string; anchor: RedPenAnnotation | HighlightAnnotation }) =>
      getAttentionBadges(range.anchor).map(badge => elementNode('span', {
        className: ['attention-badge', `attention-badge-${badge.kind}`, ...(activeAnnotationId === range.id ? ['is-active'] : [])],
        'data-annotation-id': range.id,
        'data-review-id': range.id,
        'data-review-type': range.anchor.type === 'highlight' ? 'highlight' : 'correction',
        'data-comment': range.anchor.type === 'highlight' ? range.anchor.comment ?? '' : range.anchor.reviewText ?? '',
        'data-reviewer': range.anchor.reviewer?.name ?? '',
        'aria-label': badgeText(badge),
        title: badgeTitle(badge, range.anchor),
        role: 'button',
        tabIndex: 0,
      }, [textNode(`[${badgeText(badge)}]`)]))

    const transform = (node: HastNode) => {
      if (!node.children) return
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text') {
          transform(child)
          return [child]
        }
        const record = recordByNode.get(child)
        if (!record || !child.value) return [child]

        const overlaps = activeRanges
          .filter(range => record.sourceStart < range.anchor.sourceEnd && record.sourceEnd > range.anchor.sourceStart)
          .sort((a, b) => a.anchor.sourceStart - b.anchor.sourceStart)
        if (!overlaps.length) return [sourceSpan(child.value, record.sourceStart, record.sourceEnd)]

        const result: HastNode[] = []
        let cursor = record.sourceStart
        for (const range of overlaps) {
          const partStart = Math.max(record.sourceStart, range.anchor.sourceStart)
          const partEnd = Math.min(record.sourceEnd, range.anchor.sourceEnd)
          if (partStart < cursor) continue
          if (partStart > cursor) result.push(sourceSpan(child.value.slice(cursor - record.sourceStart, partStart - record.sourceStart), cursor, partStart))
          const visiblePart = child.value.slice(partStart - record.sourceStart, partEnd - record.sourceStart)

          if (range.kind === 'highlight') {
            result.push(elementNode('mark', {
              className: ['highlight-annotation', `highlight-${range.anchor.color}`, ...(activeAnnotationId === range.id ? ['is-active'] : [])],
              'data-annotation-id': range.id,
              'data-review-id': range.id,
              'data-review-type': 'highlight',
              'data-source-start': partStart,
              'data-source-end': partEnd,
              'aria-label': range.anchor.comment ? t('viewer.highlightComment', { comment: range.anchor.comment }) : t('viewer.highlight', { color: t(range.anchor.color === 'green' ? 'highlight.green' : 'highlight.yellow') }),
              title: range.anchor.comment ?? undefined,
              role: 'button',
              tabIndex: 0,
            }, [textNode(visiblePart)]))
            if (lastRecord.get(range.id) === child && getAttentionBadges(range.anchor).length) {
              result.push(...attentionBadgeNodes(range))
              emittedAttentionBadges.add(range.id)
            }
          } else if (mode === 'original') {
            const completed = range.anchor.status !== 'pending'
            const reviewProperties = { 'data-review-id': range.id, 'data-review-type': 'correction' }
            const children = [elementNode('span', { className: ['del'], ...reviewProperties }, [textNode(visiblePart)])]
            if (lastRecord.get(range.id) === child) {
              if (range.anchor.replacementText) children.push(elementNode('span', { className: ['ins'], 'data-label': t('viewer.insertMark'), 'aria-label': t('viewer.proposal', { text: range.anchor.replacementText }), ...reviewProperties }, [textNode(range.anchor.replacementText)]))
              children.push(...attentionBadgeNodes(range))
              if (completed) children.push(elementNode('span', { className: ['annotation-complete-mark'], 'aria-label': t('viewer.completedAria') }, [textNode('✓')]))
            }
            result.push(elementNode('span', {
              className: ['red-pen-annotation', ...(completed ? ['is-completed'] : []), ...(activeAnnotationId === range.id ? ['is-active'] : [])],
              'data-annotation-id': range.id,
              'data-review-id': range.id,
              'data-review-type': 'correction',
              'data-source-start': partStart,
              'data-source-end': partEnd,
            }, children))
          } else {
            const children = [textNode(visiblePart)]
            const markerText = range.anchor.status === 'completed_changed' ? t('viewer.completed') : range.anchor.status === 'completed_unchanged' ? t('viewer.completedUnchanged') : t('viewer.pending')
            if (lastRecord.get(range.id) === child) children.push(elementNode('span', { className: ['pending-marker', range.anchor.status] }, [textNode(markerText)]))
            result.push(elementNode('span', {
              className: ['pending-anchor', ...(range.anchor.status !== 'pending' ? ['is-completed'] : []), ...(activeAnnotationId === range.id ? ['is-active'] : [])],
              'data-annotation-id': range.id,
              'data-source-start': partStart,
              'data-source-end': partEnd,
            }, children))
          }
          cursor = partEnd
        }
        if (cursor < record.sourceEnd) result.push(sourceSpan(child.value.slice(cursor - record.sourceStart), cursor, record.sourceEnd))
        for (const highlight of highlights) {
          if (getAttentionBadges(highlight).length && lastRecord.get(highlight.id) === child && !emittedAttentionBadges.has(highlight.id)) {
            result.push(...attentionBadgeNodes({ id: highlight.id, anchor: highlight }))
            emittedAttentionBadges.add(highlight.id)
          }
        }
        return result
      })
    }
    transform(tree)
  }
}

function MarkdownViewerComponent({ markdown, annotations, highlights, activeAnnotationId, mode, locale }: MarkdownViewerProps) {
  if (!markdown) {
    return (
      <div className="empty-document">
        <span className="empty-symbol">{translate('viewer.emptySymbol', {}, locale)}</span>
        <p>{translate('viewer.empty', {}, locale)}</p>
      </div>
    )
  }

  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[createSourcePositionPlugin(markdown, annotations, highlights, activeAnnotationId, mode, locale)]}>{markdown}</ReactMarkdown>
}

export const MarkdownViewer = memo(MarkdownViewerComponent)
