import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { DocumentPane } from './components/DocumentPane'
import { Header, type ActiveTool, type PaneLayout } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { RedPenDialog } from './components/RedPenDialog'
import { HighlightDialog } from './components/HighlightDialog'
import { ReviewLockDialog } from './components/ReviewLockDialog'
import { MarkdownStructureDialog } from './components/MarkdownStructureDialog'
import { PolishingConfirmDialog } from './components/PolishingConfirmDialog'
import { MarkdownExportDialog } from './components/MarkdownExportDialog'
import { AnnotationDeleteDialog } from './components/AnnotationDeleteDialog'
import { PasteMarkdownDialog } from './components/PasteMarkdownDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { AiReviewExportDialog } from './components/AiReviewExportDialog'
import { RoundCompletionDialog } from './components/RoundCompletionDialog'
import { ReviewerDialog } from './components/ReviewerDialog'
import type { AiReviewMode } from './types/aiReview'
import type { DocumentSelection, HighlightAnnotation, HighlightColor, RedPenAnnotation, ReviewTag } from './types/annotation'
import type { ExportOriginalAnchor } from './types/portableReview'
import { areAllReviewersCompleted, type Reviewer, type ReviewRound } from './types/review'
import { reanchorPendingAnnotations } from './utils/reanchor'
import { detectMarkdownStructureChanges, type MarkdownStructureChange } from './utils/markdownStructure'
import { buildReviewExportData, createAnnotationId, validateReviewExportData } from './utils/portableReview'
import { renderReviewHtml } from './utils/renderReviewHtml'
import { extractReviewJsonFromHtml } from './utils/reviewHtmlImport'
import { readDeveloperModeSetting, readLocaleSetting, readThemeSetting, writeDeveloperModeSetting, writeLocaleSetting, writeThemeSetting, type AppLocale, type AppTheme } from './config/settings'
import { INITIAL_REVIEW_TOOL, initialToolForPhase } from './config/reviewTools'
import { convertReviewExportDataToAiReview } from './utils/aiReview'
import { updateRedPenContent, updateHighlightContent } from './utils/annotationContent'
import { setLocale, useTranslation } from './i18n'
import { canConfirmRoundSave, completedReviewRound, createNextRoundWorkspace, reviewRoundArchiveFileName, saveRoundReviewHtml, type SaveFilePicker } from './utils/roundWorkflow'
import { UNSET_REVIEWER_NAME, updateCurrentReviewerName } from './utils/reviewer'

type MobilePane = 'original' | 'draft'
type StructureAfterAction = 'stay' | 'preview' | 'export' | 'complete-round' | 'apply-proposal'
const EMPTY_RED_PEN_ANNOTATIONS: RedPenAnnotation[] = []
const EMPTY_HIGHLIGHT_ANNOTATIONS: HighlightAnnotation[] = []
const initialRound = (): ReviewRound => ({ id: 'round_001', number: 1, phase: 'reviewing', lockedAt: null })
const initialLocale = readLocaleSetting()
setLocale(initialLocale)
const initialReviewers = (): Reviewer[] => [{ id: 'reviewer_001', name: UNSET_REVIEWER_NAME, status: 'working' }]
const toInternalOriginalAnchor = (anchor: ExportOriginalAnchor) => ({
  targetText: anchor.targetText,
  sourceText: anchor.sourceText,
  contextBefore: anchor.contextBefore,
  contextAfter: anchor.contextAfter,
  sourceStart: anchor.sourceStart,
  sourceEnd: anchor.sourceEnd,
  paragraphId: anchor.block?.id,
  blockType: anchor.block?.type,
  blockText: anchor.block?.text,
})

const updateResolvedDraftAnchors = (before: string, after: string, items: RedPenAnnotation[]): RedPenAnnotation[] => {
  if (before === after) return items
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1
  const oldChangeEnd = before.length - suffix
  const delta = after.length - before.length
  return items.map(annotation => {
    const anchor = annotation.draftAnchor
    if (!anchor) return annotation
    let start = anchor.start
    let end = anchor.end
    if (oldChangeEnd <= start) { start += delta; end += delta }
    else if (prefix < end) { start = Math.min(start, prefix); end = Math.max(start, end + delta) }
    return { ...annotation, anchorStatus: 'resolved' as const, draftAnchor: { start, end, text: after.slice(start, end), method: 'offset', confidence: 1 } }
  })
}

function App() {
  const { t } = useTranslation()
  const [originalMarkdown, setOriginalMarkdown] = useState('')
  const [draftMarkdown, setDraftMarkdown] = useState('')
  const [fileName, setFileName] = useState('')
  const [swapped, setSwapped] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'notes' | 'map'>('notes')
  const [mobilePane, setMobilePane] = useState<MobilePane>('original')
  const [paneLayout, setPaneLayout] = useState<PaneLayout>('reviewOnly')
  const [activeTool, setActiveTool] = useState<ActiveTool>(INITIAL_REVIEW_TOOL)
  const [annotations, setAnnotations] = useState<RedPenAnnotation[]>([])
  const [highlightAnnotations, setHighlightAnnotations] = useState<HighlightAnnotation[]>([])
  const [documentSelection, setDocumentSelection] = useState<DocumentSelection | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [annotationEditTarget, setAnnotationEditTarget] = useState<{ kind: 'red_pen' | 'highlight'; id: string } | null>(null)
  const [highlightDialogOpen, setHighlightDialogOpen] = useState(false)
  const [notice, setNoticeText] = useState('')
  const [successNotice, setSuccessNotice] = useState<{ text: string } | null>(null)
  const setNotice = (text: string) => {
    setSuccessNotice(null)
    setNoticeText(text)
  }
  const showSuccessNotice = (text: string) => {
    setNoticeText('')
    setSuccessNotice({ text })
  }
  useEffect(() => {
    if (!successNotice) return
    const timer = window.setTimeout(() => setSuccessNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [successNotice])
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [draftEditing, setDraftEditing] = useState(false)
  const [reviewRound, setReviewRound] = useState<ReviewRound>(initialRound)
  const [reviewers, setReviewers] = useState<Reviewer[]>(initialReviewers)
  const [lockDialogOpen, setLockDialogOpen] = useState(false)
  const [editingDraftMarkdown, setEditingDraftMarkdown] = useState('')
  const [structureChanges, setStructureChanges] = useState<MarkdownStructureChange[]>([])
  const [structureDialogOpen, setStructureDialogOpen] = useState(false)
  const [polishingDialogOpen, setPolishingDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [structureAfterAction, setStructureAfterAction] = useState<StructureAfterAction>('stay')
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null)
  const [editSelection, setEditSelection] = useState<{ start: number; end: number; requestId: number } | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'red_pen' | 'highlight'; id: string } | null>(null)
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [developerMode, setDeveloperMode] = useState(readDeveloperModeSetting)
  const [theme, setTheme] = useState<AppTheme>(readThemeSetting)
  const [locale, setAppLocale] = useState<AppLocale>(initialLocale)
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  const [aiReviewExportDialogOpen, setAiReviewExportDialogOpen] = useState(false)
  const [completedReviewLoadedFromHtml, setCompletedReviewLoadedFromHtml] = useState(false)
  const [roundCompletionDialogOpen, setRoundCompletionDialogOpen] = useState(false)
  const [roundCompletionSaving, setRoundCompletionSaving] = useState(false)
  const [roundCompletionError, setRoundCompletionError] = useState('')
  const [reviewerDialogOpen, setReviewerDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workDataInputRef = useRef<HTMLInputElement>(null)
  const reanchorTimerRef = useRef<number | null>(null)
  const polishingTimerRef = useRef<number | null>(null)
  const lastWarnedEditingRef = useRef('')
  const allReviewersCompleted = areAllReviewersCompleted(reviewers)
  const currentReviewer = reviewers[0]
  const canAddAnnotations = reviewRound.phase === 'reviewing' && currentReviewer?.status === 'working'

  const changeDeveloperMode = (enabled: boolean) => {
    setDeveloperMode(enabled)
    writeDeveloperModeSetting(enabled)
  }

  const changeTheme = (nextTheme: AppTheme) => {
    setTheme(nextTheme)
    writeThemeSetting(nextTheme)
  }

  const saveReviewerName = (name: string) => {
    const nextReviewers = updateCurrentReviewerName(reviewers, name)
    const nextReviewer = nextReviewers[0]
    setReviewers(nextReviewers)
    if (nextReviewer) {
      setAnnotations(items => items.map(item => item.reviewer?.id === nextReviewer.id ? { ...item, reviewer: { id: nextReviewer.id, name: nextReviewer.name } } : item))
      setHighlightAnnotations(items => items.map(item => item.reviewer?.id === nextReviewer.id ? { ...item, reviewer: { id: nextReviewer.id, name: nextReviewer.name } } : item))
    }
    setReviewerDialogOpen(false)
  }

  const changeLocale = (nextLocale: AppLocale) => {
    setAppLocale(nextLocale)
    setLocale(nextLocale)
    writeLocaleSetting(nextLocale)
    document.documentElement.lang = nextLocale
  }

  const exportAiReview = (mode: AiReviewMode) => {
    if (!developerMode || !originalMarkdown) return
    let objectUrl = ''
    const rawBaseName = fileName.replace(/\.md$/i, '') || 'metami-proof'
    const safeBaseName = rawBaseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '') || 'metami-proof'
    const aiReviewFileName = `${safeBaseName}_ai_review.json`
    try {
      const reviewData = buildReviewExportData({
        sourceFileName: fileName,
        originalMarkdown,
        draftMarkdown,
        reviewRound,
        reviewers,
        corrections: annotations,
        highlights: highlightAnnotations,
      })
      const data = convertReviewExportDataToAiReview(reviewData, mode)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
      objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = aiReviewFileName
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setAiReviewExportDialogOpen(false)
      showSuccessNotice(t('notice.aiSaved', { fileName: aiReviewFileName }))
    } catch {
      setNotice(t('notice.aiSaveFailed'))
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    }
  }

  const clearDocumentSelection = () => {
    setAnnotationEditTarget(null)
    setDocumentSelection(null)
    setDialogOpen(false)
    setHighlightDialogOpen(false)
    setNotice('')
    window.getSelection()?.removeAllRanges()
  }

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && documentSelection) clearDocumentSelection()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [documentSelection])

  const startReview = (markdown: string, sourceFileName: string) => {
    setOriginalMarkdown(markdown)
    setDraftMarkdown(markdown)
    setFileName(sourceFileName)
    setAnnotations([])
    setHighlightAnnotations([])
    setDocumentSelection(null)
    setDialogOpen(false)
    setHighlightDialogOpen(false)
    setNotice('')
    setActiveAnnotationId(null)
    setDraftEditing(false)
    setReviewRound(initialRound())
    setCompletedReviewLoadedFromHtml(false)
    setPaneLayout('reviewOnly')
    setActiveTool(INITIAL_REVIEW_TOOL)
    setMobilePane('original')
    setReviewers(initialReviewers())
    setLockDialogOpen(false)
    setEditingDraftMarkdown(markdown)
    setStructureChanges([])
    setStructureDialogOpen(false)
    setPolishingDialogOpen(false)
    setExportDialogOpen(false)
    setExporting(false)
    setExportError('')
    setStructureAfterAction('stay')
    setPendingProposalId(null)
    setEditSelection(null)
    setEditingAnnotationId(null)
    setDeleteTarget(null)
    setPasteDialogOpen(false)
    lastWarnedEditingRef.current = ''
  }

  const loadMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    startReview(await file.text(), file.name)
    event.target.value = ''
  }

  const loadWorkData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const fileText = await file.text()
      let parsed: unknown
      const isReviewHtml = /\.html?$/i.test(file.name) || file.type === 'text/html'
      if (isReviewHtml) {
        const extracted = extractReviewJsonFromHtml(fileText)
        if (!extracted.ok) {
          setNotice(extracted.error)
          return
        }
        parsed = extracted.value
      } else {
        parsed = JSON.parse(fileText)
      }
      const validated = validateReviewExportData(parsed)
      if (!validated.ok) {
        setNotice(t('notice.workLoadValidation', { error: validated.error }))
        return
      }

      const data = validated.data
      const phase = data.round.phase === 'locked' ? 'revising' : data.round.phase
      const restoredRound: ReviewRound = {
        id: data.round.id,
        number: data.round.number,
        phase,
        lockedAt: data.round.lockedAt ?? null,
      }
      setOriginalMarkdown(data.document.originalMarkdown)
      setDraftMarkdown(data.document.draftMarkdown)
      setFileName(data.document.sourceFileName ?? 'imported_markdown.md')
      const reviewerById = new Map(data.reviewers.map(reviewer => [reviewer.id, reviewer]))
      setAnnotations(data.annotations.filter(annotation => annotation.type === 'red_pen').map(annotation => {
        const originalAnchor = toInternalOriginalAnchor(annotation.originalAnchor)
        return ({
        ...originalAnchor,
        id: annotation.id,
        type: 'red_pen' as const,
        reviewText: annotation.reviewText,
        replacementText: annotation.replacementText,
        status: annotation.status,
        anchorStatus: annotation.draftAnchor ? 'resolved' as const : 'unresolved' as const,
        originalAnchor,
        draftAnchor: annotation.draftAnchor,
        proposalApplied: false,
        resultText: annotation.resultText,
        reviewer: reviewerById.get(annotation.reviewerId),
        createdAt: annotation.createdAt,
        tag: annotation.tag,
      })}))
      setHighlightAnnotations(data.annotations.filter(annotation => annotation.type === 'highlight').map(annotation => {
        const originalAnchor = toInternalOriginalAnchor(annotation.originalAnchor)
        return ({
        ...originalAnchor,
        id: annotation.id,
        type: 'highlight' as const,
        color: annotation.color,
        comment: annotation.comment ?? null,
        reviewer: reviewerById.get(annotation.reviewerId)!,
        createdAt: annotation.createdAt,
        originalAnchor,
        tag: annotation.tag,
      })}))
      setReviewers(data.reviewers)
      setReviewRound(restoredRound)
      setCompletedReviewLoadedFromHtml(isReviewHtml && restoredRound.phase === 'completed')
      setEditingDraftMarkdown(data.document.draftMarkdown)
      setPaneLayout(phase === 'reviewing' ? 'reviewOnly' : phase === 'revising' ? 'sideBySide' : 'revisionOnly')
      setSidebarOpen(phase === 'reviewing' || phase === 'revising')
      setDraftEditing(phase === 'polishing')
      setActiveTool(initialToolForPhase(phase))
      setSwapped(false)
      setMobilePane(phase === 'reviewing' ? 'original' : 'draft')
      setActiveAnnotationId(null)
      setDocumentSelection(null)
      setDialogOpen(false)
      setHighlightDialogOpen(false)
      setLockDialogOpen(false)
      setStructureChanges([])
      setStructureDialogOpen(false)
      setPolishingDialogOpen(false)
      setExportDialogOpen(false)
      setExporting(false)
      setExportError('')
      setStructureAfterAction('stay')
      setPendingProposalId(null)
      setEditSelection(null)
      setEditingAnnotationId(null)
      setDeleteTarget(null)
      lastWarnedEditingRef.current = ''
      showSuccessNotice(t('notice.workLoaded', { round: data.round.number, phase }))
    } catch {
      setNotice(t('notice.workLoadFailed'))
    } finally {
      event.target.value = ''
    }
  }

  const portableFileName = (() => {
    const baseName = fileName.replace(/\.md$/i, '') || 'metami-proof'
    const roundNumber = String(reviewRound.number).padStart(3, '0')
    return `${baseName}_round${roundNumber}_metami-proof.json`
  })()

  const exportWorkData = () => {
    if (!originalMarkdown) return
    if (draftEditing && editingDraftMarkdown !== draftMarkdown) {
      setNotice(t('notice.unsavedEditWork'))
      return
    }
    let objectUrl = ''
    try {
      const data = buildReviewExportData({
        sourceFileName: fileName,
        originalMarkdown,
        draftMarkdown,
        reviewRound,
        reviewers,
        corrections: annotations,
        highlights: highlightAnnotations,
      })
      const validated = validateReviewExportData(data)
      if (!validated.ok) throw new Error(validated.error)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
      objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = portableFileName
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      showSuccessNotice(t('notice.workSaved', { fileName: portableFileName }))
    } catch {
      setNotice(t('notice.workSaveFailed'))
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    }
  }

  const reviewHtmlFileName = reviewRoundArchiveFileName(fileName, reviewRound.number)

  const exportReviewHtml = () => {
    if (!originalMarkdown) return
    if (draftEditing && editingDraftMarkdown !== draftMarkdown) {
      setNotice(t('notice.unsavedEditHtml'))
      return
    }
    let objectUrl = ''
    try {
      const data = buildReviewExportData({
        sourceFileName: fileName,
        originalMarkdown,
        draftMarkdown,
        reviewRound,
        reviewers,
        corrections: annotations,
        highlights: highlightAnnotations,
      })
      const validated = validateReviewExportData(data)
      if (!validated.ok) throw new Error(validated.error)
      const blob = new Blob([renderReviewHtml(data, theme, locale)], { type: 'text/html;charset=utf-8' })
      objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = reviewHtmlFileName
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      showSuccessNotice(t('notice.htmlSaved', { fileName: reviewHtmlFileName }))
    } catch {
      setNotice(t('notice.htmlSaveFailed'))
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    }
  }

  const initializeNextRound = (transition: 'saved' | 'download-started' | 'reopened' = 'saved', sourceRound: ReviewRound = reviewRound) => {
    const completedRoundNumber = reviewRound.number
    const nextWorkspace = createNextRoundWorkspace(sourceRound, draftMarkdown, reviewers)
    setOriginalMarkdown(nextWorkspace.originalMarkdown)
    setDraftMarkdown(nextWorkspace.draftMarkdown)
    setAnnotations(nextWorkspace.annotations)
    setHighlightAnnotations(nextWorkspace.highlights)
    setReviewers(nextWorkspace.reviewers)
    setReviewRound(nextWorkspace.round)
    setCompletedReviewLoadedFromHtml(false)
    setDocumentSelection(null)
    setDialogOpen(false)
    setHighlightDialogOpen(false)
    setAnnotationEditTarget(null)
    setActiveAnnotationId(null)
    setDraftEditing(false)
    setEditingDraftMarkdown(nextWorkspace.draftMarkdown)
    setPaneLayout('reviewOnly')
    setSidebarOpen(true)
    setActiveTool(INITIAL_REVIEW_TOOL)
    setMobilePane('original')
    setSwapped(false)
    setLockDialogOpen(false)
    setStructureChanges([])
    setStructureDialogOpen(false)
    setPolishingDialogOpen(false)
    setExportDialogOpen(false)
    setExporting(false)
    setExportError('')
    setStructureAfterAction('stay')
    setPendingProposalId(null)
    setEditSelection(null)
    setEditingAnnotationId(null)
    setDeleteTarget(null)
    setRoundCompletionDialogOpen(false)
    setRoundCompletionError('')
    lastWarnedEditingRef.current = ''
    window.getSelection()?.removeAllRanges()
    const noticeKey = transition === 'saved' ? 'roundStart.saved' : transition === 'download-started' ? 'roundStart.downloadStarted' : 'roundStart.reopened'
    setNotice(t(noticeKey, { current: completedRoundNumber, next: nextWorkspace.round.number }))
  }

  const completeRoundWithArchive = async (action: 'finish' | 'next') => {
    if (reviewRound.phase !== 'polishing' || roundCompletionSaving) return
    const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker?.bind(window)
    setRoundCompletionSaving(true)
    setRoundCompletionError('')
    try {
      const completedRound = completedReviewRound(reviewRound)
      const data = buildReviewExportData({ sourceFileName: fileName, originalMarkdown, draftMarkdown, reviewRound: completedRound, reviewers, corrections: annotations, highlights: highlightAnnotations })
      const validated = validateReviewExportData(data)
      if (!validated.ok) throw new Error(validated.error)
      const result = await saveRoundReviewHtml(picker, new Blob([renderReviewHtml(data, theme, locale)], { type: 'text/html;charset=utf-8' }), reviewHtmlFileName)
      if (result === 'cancelled') { setRoundCompletionDialogOpen(false); return }
      setRoundCompletionDialogOpen(false)
      if (action === 'next') initializeNextRound(result, completedRound)
      else {
        setReviewRound(completedRound)
        setCompletedReviewLoadedFromHtml(false)
        setDraftEditing(false)
        setPaneLayout('revisionOnly')
        setSidebarOpen(false)
        setActiveAnnotationId(null)
        setEditingDraftMarkdown(draftMarkdown)
        setNotice(t(result === 'saved' ? 'roundComplete.finished' : 'roundComplete.downloadStarted', { current: reviewRound.number }))
      }
    } catch {
      setRoundCompletionError(t('roundStart.saveFailed'))
    } finally {
      setRoundCompletionSaving(false)
    }
  }

  const captureDocumentSelection = () => {
    if (annotationEditTarget) return
    if (!canAddAnnotations) {
      setNotice(t('notice.reviewLocked'))
      return
    }
    const browserSelection = window.getSelection()
    if (!browserSelection || browserSelection.isCollapsed || !browserSelection.rangeCount) return
    const range = browserSelection.getRangeAt(0)
    const originalPane = document.querySelector('.document-pane.original .markdown-body')
    if (!originalPane?.contains(range.commonAncestorContainer)) return

    const targetText = browserSelection.toString()
    if (!targetText.trim()) return
    const containerType = (node: Node) => node.nodeType === Node.TEXT_NODE ? '#text' : node.nodeName.toLowerCase()
    const startParent = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer as HTMLElement
    const endParent = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer as HTMLElement
    const startBlock = startParent?.closest<HTMLElement>('[data-source-block="true"]')
    const endBlock = endParent?.closest<HTMLElement>('[data-source-block="true"]')
    const debugInfo: Record<string, unknown> = {
      selectedText: targetText,
      startContainerType: containerType(range.startContainer),
      endContainerType: containerType(range.endContainer),
      startBlockId: startBlock?.dataset.paragraphId,
      endBlockId: endBlock?.dataset.paragraphId,
      multipleNodes: range.startContainer !== range.endContainer,
    }
    const rejectSelection = (reason: string) => {
      setDocumentSelection(null)
      setNotice(reason)
      debugInfo.rejectionReason = reason
      if (import.meta.env.DEV) console.debug('[METAMI Proof selection]', debugInfo)
    }

    if (range.startContainer.nodeType !== Node.TEXT_NODE || range.endContainer.nodeType !== Node.TEXT_NODE) {
      rejectSelection(t('notice.unsupportedSelection'))
      return
    }
    if (!startBlock || !endBlock || startBlock.dataset.paragraphId !== endBlock.dataset.paragraphId) {
      rejectSelection(t('notice.multiBlockSelection'))
      return
    }
    if (startBlock.closest('pre') || endBlock.closest('pre')) {
      rejectSelection(t('notice.codeBlockSelection'))
      return
    }

    const resolveBoundary = (container: Node, offset: number, edge: 'start' | 'end', block: HTMLElement) => {
      const parent = container.parentElement
      const sourceElement = parent?.closest<HTMLElement>('[data-source-start][data-source-end]')
      if (!sourceElement || !block.contains(sourceElement)) return null
      const elementStart = Number(sourceElement.dataset.sourceStart)
      const elementEnd = Number(sourceElement.dataset.sourceEnd)
      if (!Number.isSafeInteger(elementStart) || !Number.isSafeInteger(elementEnd)) return null
      const textLength = container.textContent?.length ?? 0
      if (offset < 0 || offset > textLength) return null
      let sourceOffset = elementStart + offset

      if ((edge === 'start' && offset === 0) || (edge === 'end' && offset === textLength)) {
        let inline = parent?.closest<HTMLElement>('[data-inline-source-start][data-inline-source-end]')
        while (inline && block.contains(inline)) {
          const inlineStart = Number(inline.dataset.inlineSourceStart)
          const inlineEnd = Number(inline.dataset.inlineSourceEnd)
          if (edge === 'start' && Number.isSafeInteger(inlineStart)) sourceOffset = Math.min(sourceOffset, inlineStart)
          if (edge === 'end' && Number.isSafeInteger(inlineEnd)) sourceOffset = Math.max(sourceOffset, inlineEnd)
          inline = inline.parentElement?.closest<HTMLElement>('[data-inline-source-start][data-inline-source-end]') ?? null
        }
      }
      return sourceOffset
    }

    const sourceStart = resolveBoundary(range.startContainer, range.startOffset, 'start', startBlock)
    const sourceEnd = resolveBoundary(range.endContainer, range.endOffset, 'end', endBlock)
    debugInfo.sourceStart = sourceStart
    debugInfo.sourceEnd = sourceEnd
    const blockStart = Number(startBlock.dataset.sourceStart)
    const blockEnd = Number(startBlock.dataset.sourceEnd)
    if (sourceStart === null || sourceEnd === null || !Number.isSafeInteger(blockStart) || !Number.isSafeInteger(blockEnd) || sourceStart < blockStart || sourceEnd > blockEnd || sourceStart >= sourceEnd) {
      rejectSelection(t('notice.sourcePositionFailed'))
      return
    }

    const rangeText = range.cloneContents().textContent ?? ''
    if (rangeText !== targetText) {
      rejectSelection(t('notice.visualSelectionFailed'))
      return
    }
    const sourceText = originalMarkdown.slice(sourceStart, sourceEnd)
    if (!sourceText || sourceText.trim().length === 0) {
      rejectSelection(t('notice.sourceRangeFailed'))
      return
    }
    if (activeTool === 'redPen' && annotations.some(annotation => sourceStart < annotation.sourceEnd && sourceEnd > annotation.sourceStart)) {
      rejectSelection(t('notice.overlap'))
      return
    }

    const contextLength = 60
    const lineAt = (offset: number) => originalMarkdown.slice(0, offset).split('\n').length
    setDocumentSelection({
      targetText,
      sourceText,
      contextBefore: originalMarkdown.slice(Math.max(0, sourceStart - contextLength), sourceStart),
      contextAfter: originalMarkdown.slice(sourceEnd, Math.min(originalMarkdown.length, sourceEnd + contextLength)),
      sourceStart,
      sourceEnd,
      startLine: lineAt(sourceStart),
      endLine: lineAt(Math.max(sourceStart, sourceEnd - 1)),
      nodePath: startBlock.tagName.toLowerCase(),
      paragraphId: startBlock.dataset.paragraphId,
      blockText: originalMarkdown.slice(blockStart, blockEnd),
      blockType: startBlock.dataset.paragraphId?.split('_')[0] ?? startBlock.tagName.toLowerCase(),
      range: {
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        startContainerType: containerType(range.startContainer),
        endContainerType: containerType(range.endContainer),
        multipleNodes: range.startContainer !== range.endContainer,
      },
    })
    debugInfo.rejectionReason = null
    if (import.meta.env.DEV) console.debug('[METAMI Proof selection]', debugInfo)
    if (activeTool === 'redPen') {
      setNotice(t('notice.redSelected'))
      setDialogOpen(true)
    } else if (activeTool === 'highlighter') {
      setNotice(t('notice.highlightSelected'))
      setHighlightDialogOpen(true)
    } else {
      setNotice(t('notice.bluePending'))
    }
  }

  const addAnnotation = (reviewText: string | undefined, replacementText: string | undefined, tag: ReviewTag | null) => {
    if (annotationEditTarget) {
      if (!canAddAnnotations || annotationEditTarget.kind !== 'red_pen' || (!reviewText?.trim() && replacementText === undefined)) return
      setAnnotations(current => current.map(item => item.id === annotationEditTarget.id && item.status === 'pending'
        ? updateRedPenContent(item, reviewText, replacementText, tag) : item))
      clearDocumentSelection()
      return
    }
    if (!documentSelection || !canAddAnnotations) return
    const originalAnchor = {
      targetText: documentSelection.targetText,
      sourceText: documentSelection.sourceText,
      contextBefore: documentSelection.contextBefore,
      contextAfter: documentSelection.contextAfter,
      sourceStart: documentSelection.sourceStart,
      sourceEnd: documentSelection.sourceEnd,
      startLine: documentSelection.startLine,
      endLine: documentSelection.endLine,
      nodePath: documentSelection.nodePath,
      paragraphId: documentSelection.paragraphId,
      blockText: documentSelection.blockText,
      blockType: documentSelection.blockType,
    }
    const annotation: RedPenAnnotation = {
      id: createAnnotationId('anno'),
      type: 'red_pen',
      targetText: documentSelection.targetText,
      sourceText: documentSelection.sourceText,
      reviewText,
      replacementText,
      contextBefore: documentSelection.contextBefore,
      contextAfter: documentSelection.contextAfter,
      sourceStart: documentSelection.sourceStart,
      sourceEnd: documentSelection.sourceEnd,
      startLine: documentSelection.startLine,
      endLine: documentSelection.endLine,
      nodePath: documentSelection.nodePath,
      paragraphId: documentSelection.paragraphId,
      blockText: documentSelection.blockText,
      blockType: documentSelection.blockType,
      status: 'pending',
      anchorStatus: 'resolved',
      originalAnchor,
      draftAnchor: { start: documentSelection.sourceStart, end: documentSelection.sourceEnd, text: documentSelection.sourceText, method: 'offset', confidence: 1 },
      reviewer: { id: currentReviewer.id, name: currentReviewer.name },
      createdAt: new Date().toISOString(),
      tag,
    }
    setAnnotations(current => [...current, annotation])
    setActiveAnnotationId(annotation.id)
    setDialogOpen(false)
    setDocumentSelection(null)
    showSuccessNotice(replacementText !== undefined ? t('notice.redRegisteredProposal', { text: annotation.targetText }) : t('notice.redRegisteredReview', { text: annotation.targetText }))
    window.getSelection()?.removeAllRanges()
  }

  const addHighlightAnnotation = (comment: string, tag: ReviewTag | null, color: HighlightColor) => {
    if (annotationEditTarget) {
      if (!canAddAnnotations || annotationEditTarget.kind !== 'highlight') return
      setHighlightAnnotations(current => current.map(item => item.id === annotationEditTarget.id
        ? updateHighlightContent(item, comment, color, tag) : item))
      clearDocumentSelection()
      return
    }
    if (!documentSelection || !canAddAnnotations || activeTool !== 'highlighter') return
    const originalAnchor = {
      targetText: documentSelection.targetText,
      sourceText: documentSelection.sourceText,
      contextBefore: documentSelection.contextBefore,
      contextAfter: documentSelection.contextAfter,
      sourceStart: documentSelection.sourceStart,
      sourceEnd: documentSelection.sourceEnd,
      startLine: documentSelection.startLine,
      endLine: documentSelection.endLine,
      nodePath: documentSelection.nodePath,
      paragraphId: documentSelection.paragraphId,
      blockText: documentSelection.blockText,
      blockType: documentSelection.blockType,
    }
    const highlight: HighlightAnnotation = {
      ...originalAnchor,
      id: createAnnotationId('highlight'),
      type: 'highlight',
      color,
      comment: comment || null,
      reviewer: { id: currentReviewer.id, name: currentReviewer.name },
      createdAt: new Date().toISOString(),
      originalAnchor,
      tag,
    }
    setHighlightAnnotations(current => [...current, highlight])
    setActiveAnnotationId(highlight.id)
    setHighlightDialogOpen(false)
    setDocumentSelection(null)
    const colorLabel = color === 'green' ? t('highlight.green') : t('highlight.yellow')
    showSuccessNotice(comment ? t('notice.highlightRegisteredComment', { color: colorLabel }) : t('notice.highlightRegistered', { color: colorLabel }))
    window.getSelection()?.removeAllRanges()
  }

  const switchSelectionTool = (nextTool: 'redPen' | 'highlighter') => {
    if (!canAddAnnotations || annotationEditTarget) return
    setActiveTool(nextTool)
    setDialogOpen(nextTool === 'redPen' && Boolean(documentSelection))
    setHighlightDialogOpen(nextTool === 'highlighter' && Boolean(documentSelection))
    if (documentSelection) setNotice(nextTool === 'redPen' ? t('notice.switchedRed') : t('notice.switchedHighlight'))
    window.getSelection()?.removeAllRanges()
  }

  const changeActiveTool = (tool: ActiveTool) => {
    if (tool === activeTool) return
    if ((tool === 'redPen' || tool === 'highlighter') && documentSelection && (dialogOpen || highlightDialogOpen)) {
      switchSelectionTool(tool)
      return
    }
    setActiveTool(tool)
  }

  const requestAnnotationDelete = (annotationId: string) => {
    if (reviewRound.phase !== 'reviewing') return
    setAnnotationEditTarget(null)
    if (annotations.some(annotation => annotation.id === annotationId)) {
      setDeleteTarget({ kind: 'red_pen', id: annotationId })
    } else if (highlightAnnotations.some(annotation => annotation.id === annotationId)) {
      setDeleteTarget({ kind: 'highlight', id: annotationId })
    }
    setDocumentSelection(null)
    setDialogOpen(false)
    setHighlightDialogOpen(false)
    window.getSelection()?.removeAllRanges()
  }

  const confirmAnnotationDelete = () => {
    if (!deleteTarget || reviewRound.phase !== 'reviewing') return
    if (deleteTarget.kind === 'red_pen') {
      setAnnotations(current => current.filter(annotation => annotation.id !== deleteTarget.id))
    } else {
      setHighlightAnnotations(current => current.filter(annotation => annotation.id !== deleteTarget.id))
    }
    if (activeAnnotationId === deleteTarget.id) setActiveAnnotationId(null)
    setNotice('')
    setDeleteTarget(null)
  }

  const beginDraftEditing = () => {
    if (reviewRound.phase !== 'revising' && reviewRound.phase !== 'polishing') return
    setEditingDraftMarkdown(draftMarkdown)
    setStructureChanges([])
    setStructureAfterAction('stay')
    lastWarnedEditingRef.current = ''
    setEditingAnnotationId(null)
    setEditSelection(null)
    setDraftEditing(true)
  }

  const cancelDraftEditing = () => {
    setEditingDraftMarkdown(draftMarkdown)
    setStructureChanges([])
    setStructureDialogOpen(false)
    setEditingAnnotationId(null)
    setEditSelection(null)
    setDraftEditing(false)
  }

  const commitDraftEditing = () => {
    if (editingDraftMarkdown !== draftMarkdown) setAnnotations(current => updateResolvedDraftAnchors(draftMarkdown, editingDraftMarkdown, current))
    setDraftMarkdown(editingDraftMarkdown)
    setStructureDialogOpen(false)
    setStructureChanges([])
    lastWarnedEditingRef.current = ''
    setEditingAnnotationId(null)
    setEditSelection(null)
    if (structureAfterAction === 'apply-proposal' && pendingProposalId) {
      setAnnotations(current => current.map(annotation => {
        if (annotation.id !== pendingProposalId || !annotation.draftAnchor) return annotation
        const start = annotation.draftAnchor.start
        return {
          ...annotation,
          proposalApplied: true,
          anchorStatus: 'resolved',
          draftAnchor: { start, end: start + (annotation.replacementText?.length ?? 0), text: annotation.replacementText ?? '', method: 'offset', confidence: 1 },
        }
      }))
      setPendingProposalId(null)
      showSuccessNotice(t('notice.proposalApplied'))
      setStructureAfterAction('stay')
    } else if (reviewRound.phase === 'polishing') {
      if (structureAfterAction === 'preview') setDraftEditing(false)
      if (structureAfterAction === 'export') setExportDialogOpen(true)
      if (structureAfterAction === 'complete-round') setRoundCompletionDialogOpen(true)
      setStructureAfterAction('stay')
    } else setDraftEditing(false)
  }

  const returnToStructureEditing = () => {
    setEditingDraftMarkdown(draftMarkdown)
    setStructureChanges([])
    setStructureDialogOpen(false)
    setStructureAfterAction('stay')
    setPendingProposalId(null)
    setEditingAnnotationId(null)
    setEditSelection(null)
    lastWarnedEditingRef.current = ''
  }

  const requestDraftCommit = () => {
    const changes = detectMarkdownStructureChanges(draftMarkdown, editingDraftMarkdown)
    if (!changes.length) {
      commitDraftEditing()
      return
    }
    setStructureChanges(changes)
    setStructureAfterAction('preview')
    setStructureDialogOpen(true)
  }

  const updatePolishingDraft = (markdown: string) => {
    setEditingDraftMarkdown(markdown)
  }

  const requestPolishingPreview = () => {
    if (reviewRound.phase !== 'polishing') return
    const changes = detectMarkdownStructureChanges(draftMarkdown, editingDraftMarkdown)
    if (changes.length) {
      lastWarnedEditingRef.current = editingDraftMarkdown
      setStructureChanges(changes)
      setStructureAfterAction('preview')
      setStructureDialogOpen(true)
      return
    }
    setAnnotations(current => updateResolvedDraftAnchors(draftMarkdown, editingDraftMarkdown, current))
    setDraftMarkdown(editingDraftMarkdown)
    setDraftEditing(false)
  }

  const requestRoundCompletion = () => {
    if (reviewRound.phase !== 'polishing') return
    const changes = detectMarkdownStructureChanges(draftMarkdown, editingDraftMarkdown)
    if (draftEditing && changes.length) {
      lastWarnedEditingRef.current = editingDraftMarkdown
      setStructureChanges(changes)
      setStructureAfterAction('complete-round')
      setStructureDialogOpen(true)
      return
    }
    if (draftEditing && editingDraftMarkdown !== draftMarkdown) {
      setAnnotations(current => updateResolvedDraftAnchors(draftMarkdown, editingDraftMarkdown, current))
      setDraftMarkdown(editingDraftMarkdown)
    }
    setRoundCompletionError('')
    setRoundCompletionDialogOpen(true)
  }

  useEffect(() => {
    if (reviewRound.phase !== 'polishing' || !draftEditing || structureDialogOpen) return
    if (editingDraftMarkdown === draftMarkdown || editingDraftMarkdown === lastWarnedEditingRef.current) return
    if (polishingTimerRef.current !== null) window.clearTimeout(polishingTimerRef.current)
    polishingTimerRef.current = window.setTimeout(() => {
      const changes = detectMarkdownStructureChanges(draftMarkdown, editingDraftMarkdown)
      if (!changes.length) {
        setAnnotations(current => updateResolvedDraftAnchors(draftMarkdown, editingDraftMarkdown, current))
        setDraftMarkdown(editingDraftMarkdown)
      }
      else {
        lastWarnedEditingRef.current = editingDraftMarkdown
        setStructureChanges(changes)
        setStructureAfterAction('stay')
        setStructureDialogOpen(true)
      }
      polishingTimerRef.current = null
    }, 400)
    return () => {
      if (polishingTimerRef.current !== null) window.clearTimeout(polishingTimerRef.current)
    }
  }, [draftEditing, draftMarkdown, editingDraftMarkdown, reviewRound.phase, structureDialogOpen])

  useEffect(() => {
    if (reviewRound.phase !== 'revising') return
    if (reanchorTimerRef.current !== null) window.clearTimeout(reanchorTimerRef.current)
    reanchorTimerRef.current = window.setTimeout(() => {
      setAnnotations(current => reanchorPendingAnnotations(draftMarkdown, current))
      reanchorTimerRef.current = null
    }, 300)
    return () => {
      if (reanchorTimerRef.current !== null) window.clearTimeout(reanchorTimerRef.current)
    }
  }, [draftMarkdown, reviewRound.phase])

  const pulseAnnotation = (annotationId: string, location: 'draft' | 'original') => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`.document-pane.${location} [data-annotation-id="${annotationId}"]`)
      if (!element) return
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      element.classList.remove('jump-highlight')
      void element.offsetWidth
      element.classList.add('jump-highlight')
      window.setTimeout(() => element.classList.remove('jump-highlight'), 1500)
    }))
  }

  const selectAnnotation = (annotationId: string) => {
    const annotation = annotations.find(item => item.id === annotationId)
    const highlight = highlightAnnotations.find(item => item.id === annotationId)
    if (!annotation && !highlight) return
    setActiveAnnotationId(annotationId)
    if (highlight) {
      pulseAnnotation(annotationId, 'original')
      return
    }
    if (!annotation) return
    if (annotation.draftAnchor && !draftEditing) {
      pulseAnnotation(annotationId, 'draft')
    } else {
      pulseAnnotation(annotationId, 'original')
    }
  }

  const handleBodyAnnotationClick = (annotationId: string): boolean => {
    selectAnnotation(annotationId)
    if (!canAddAnnotations) return false
    const red = annotations.find(item => item.id === annotationId)
    const highlight = highlightAnnotations.find(item => item.id === annotationId)
    if (red && red.status !== 'pending') return false
    if (!red && !highlight) return false
    setDocumentSelection(null)
    setNotice('')
    window.getSelection()?.removeAllRanges()
    if (red) {
      setAnnotationEditTarget({ kind: 'red_pen', id: red.id })
      setDialogOpen(true)
      setHighlightDialogOpen(false)
    } else if (highlight) {
      setAnnotationEditTarget({ kind: 'highlight', id: highlight.id })
      setHighlightDialogOpen(true)
      setDialogOpen(false)
    }
    return true
  }

  const completeAnnotation = (annotationId: string, changed: boolean) => {
    if (reviewRound.phase !== 'revising') return
    const target = annotations.find(annotation => annotation.id === annotationId)
    if (!target?.draftAnchor) {
      setNotice(t('notice.unresolvedComplete'))
      return
    }
    setAnnotations(current => current.map(annotation => annotation.id === annotationId ? {
      ...annotation,
      status: changed ? 'completed_changed' : 'completed_unchanged',
      resultText: draftMarkdown.slice(annotation.draftAnchor!.start, annotation.draftAnchor!.end),
    } : annotation))
    showSuccessNotice(changed ? t('notice.completedChanged') : t('notice.completedUnchanged'))
  }

  const applyAnnotationProposal = (annotationId: string) => {
    if (reviewRound.phase !== 'revising') return
    const annotation = annotations.find(item => item.id === annotationId)
    if (!annotation || annotation.status !== 'pending' || annotation.proposalApplied || annotation.replacementText === undefined) return
    if (!annotation.draftAnchor) {
      setNotice(t('notice.unresolvedProposal'))
      return
    }
    const { start, end } = annotation.draftAnchor
    const nextMarkdown = `${draftMarkdown.slice(0, start)}${annotation.replacementText}${draftMarkdown.slice(end)}`
    const changes = detectMarkdownStructureChanges(draftMarkdown, nextMarkdown)
    setEditingDraftMarkdown(nextMarkdown)
    setPendingProposalId(annotationId)
    setActiveAnnotationId(annotationId)
    setDraftEditing(true)
    setEditingAnnotationId(annotationId)
    setEditSelection({ start, end: start + annotation.replacementText.length, requestId: Date.now() })
    if (changes.length) {
      setStructureChanges(changes)
      setStructureAfterAction('apply-proposal')
      setStructureDialogOpen(true)
      return
    }
    setDraftMarkdown(nextMarkdown)
    setAnnotations(current => updateResolvedDraftAnchors(draftMarkdown, nextMarkdown, current).map(item => item.id === annotationId ? {
      ...item,
      proposalApplied: true,
      anchorStatus: 'resolved',
      draftAnchor: { start, end: start + (item.replacementText?.length ?? 0), text: item.replacementText ?? '', method: 'offset', confidence: 1 },
    } : item))
    setPendingProposalId(null)
    showSuccessNotice(t('notice.proposalApplied'))
  }

  const editAnnotation = (annotationId: string) => {
    if (reviewRound.phase !== 'revising') return
    const annotation = annotations.find(item => item.id === annotationId)
    if (!annotation) return
    setActiveAnnotationId(annotationId)
    setEditingDraftMarkdown(draftMarkdown)
    setDraftEditing(true)
    setEditingAnnotationId(annotationId)
    const anchor = annotation.draftAnchor
    if (anchor) {
      setEditSelection({ start: anchor.start, end: anchor.end, requestId: Date.now() })
      setNotice(t('notice.editSelected'))
    } else {
      setEditSelection({ start: 0, end: 0, requestId: Date.now() })
      setNotice(t('notice.editUnresolved'))
    }
  }

  const reopenAnnotation = (annotationId: string) => {
    if (reviewRound.phase !== 'revising') return
    setAnnotations(current => current.map(annotation => annotation.id === annotationId ? {
      ...annotation,
      status: 'pending',
      proposalApplied: false,
      resultText: undefined,
    } : annotation))
    setActiveAnnotationId(annotationId)
    showSuccessNotice(t('notice.reopened'))
  }

  const pendingAnnotations = annotations.filter(annotation => annotation.status === 'pending')

  const completeCurrentReview = () => {
    if (reviewRound.phase !== 'reviewing') return
    const nextReviewers = reviewers.map((reviewer, index) => index === 0 ? { ...reviewer, status: 'completed' as const } : reviewer)
    setReviewers(nextReviewers)
    setDocumentSelection(null)
    setDialogOpen(false)
    if (areAllReviewersCompleted(nextReviewers)) setLockDialogOpen(true)
  }

  const confirmReviewLock = () => {
    if (!allReviewersCompleted || reviewRound.phase !== 'reviewing') return
    setLockDialogOpen(false)
    setReviewRound(current => ({ ...current, phase: 'locked', lockedAt: new Date().toISOString() }))
    setPaneLayout('sideBySide')
    setActiveTool('redPen')
    window.setTimeout(() => setReviewRound(current => current.phase === 'locked' ? { ...current, phase: 'revising' } : current), 0)
    setNotice(t('notice.reviewLockedToRevision'))
  }

  const enterPolishing = () => {
    if (reviewRound.phase !== 'revising' || pendingAnnotations.length > 0) return
    setPolishingDialogOpen(false)
    setReviewRound(current => ({ ...current, phase: 'polishing' }))
    setPaneLayout('revisionOnly')
    setSidebarOpen(false)
    setActiveAnnotationId(null)
    setEditingDraftMarkdown(draftMarkdown)
    setDraftEditing(true)
    setNotice(t('notice.polishingStarted'))
  }

  const completedFileName = (() => {
    const baseName = fileName.replace(/\.md$/i, '') || 'metami-proof'
    const roundNumber = String(reviewRound.number).padStart(3, '0')
    return `${baseName}_round${roundNumber}.md`
  })()

  const requestPolishingCompletion = () => {
    if (reviewRound.phase !== 'polishing') return
    const changes = detectMarkdownStructureChanges(draftMarkdown, editingDraftMarkdown)
    if (draftEditing && changes.length) {
      lastWarnedEditingRef.current = editingDraftMarkdown
      setStructureChanges(changes)
      setStructureAfterAction('export')
      setStructureDialogOpen(true)
      return
    }
    if (draftEditing && editingDraftMarkdown !== draftMarkdown) setDraftMarkdown(editingDraftMarkdown)
    setExportError('')
    setExportDialogOpen(true)
  }

  const exportCompletedMarkdown = () => {
    if (reviewRound.phase !== 'polishing' || exporting) return
    setExporting(true)
    setExportError('')
    let objectUrl = ''
    try {
      const blob = new Blob([draftMarkdown], { type: 'text/markdown;charset=utf-8' })
      objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = completedFileName
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setExportDialogOpen(false)
      showSuccessNotice(t('notice.markdownSaved', { fileName: completedFileName }))
    } catch {
      setExportError(t('notice.markdownExportFailed'))
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      setExporting(false)
    }
  }
  const movePending = (direction: -1 | 1) => {
    if (!pendingAnnotations.length) return
    const currentIndex = pendingAnnotations.findIndex(annotation => annotation.id === activeAnnotationId)
    const nextIndex = currentIndex < 0
      ? (direction === 1 ? 0 : pendingAnnotations.length - 1)
      : (currentIndex + direction + pendingAnnotations.length) % pendingAnnotations.length
    selectAnnotation(pendingAnnotations[nextIndex].id)
  }

  const isPolishing = reviewRound.phase === 'polishing'
  const annotationDialogSelection = annotationEditTarget
    ? (annotationEditTarget.kind === 'red_pen' ? annotations : highlightAnnotations).find(item => item.id === annotationEditTarget.id)?.originalAnchor
    : documentSelection
  const editingRedAnnotation = annotationEditTarget?.kind === 'red_pen'
    ? annotations.find(item => item.id === annotationEditTarget.id)
    : undefined
  const editingHighlightAnnotation = annotationEditTarget?.kind === 'highlight'
    ? highlightAnnotations.find(item => item.id === annotationEditTarget.id)
    : undefined
  const eraserActive = activeTool === 'eraser' && reviewRound.phase === 'reviewing'
  const hideDraftAnnotations = isPolishing || reviewRound.phase === 'completed'
  const panes = {
    original: <DocumentPane kind="original" markdown={originalMarkdown} fileName={fileName} annotations={annotations} highlights={highlightAnnotations} activeAnnotationId={activeAnnotationId} onOriginalSelection={canAddAnnotations ? captureDocumentSelection : undefined} onAnnotationClick={handleBodyAnnotationClick} eraserActive={eraserActive} onAnnotationDeleteRequest={requestAnnotationDelete} />,
    draft: <DocumentPane kind="draft" markdown={draftMarkdown} fileName={fileName} annotations={hideDraftAnnotations ? EMPTY_RED_PEN_ANNOTATIONS : annotations} highlights={EMPTY_HIGHLIGHT_ANNOTATIONS} activeAnnotationId={activeAnnotationId} draftEditing={draftEditing} draftCanEdit={reviewRound.phase === 'revising' || reviewRound.phase === 'polishing'} editingMarkdown={editingDraftMarkdown} directEditing={isPolishing} editSelection={editSelection} onAnnotationClick={handleBodyAnnotationClick} onDraftEditingChange={setDraftEditing} onBeginDraftEditing={beginDraftEditing} onEditingDraftChange={isPolishing ? updatePolishingDraft : setEditingDraftMarkdown} onCancelDraftEditing={cancelDraftEditing} onApplyDraftEditing={requestDraftCommit} onRequestPreview={requestPolishingPreview} />,
  }
  const paneOrder: MobilePane[] = swapped ? ['draft', 'original'] : ['original', 'draft']
  const visiblePanes: MobilePane[] = paneLayout === 'reviewOnly' ? ['original'] : paneLayout === 'revisionOnly' ? ['draft'] : paneOrder
  const showSidebar = sidebarOpen

  return (
    <div className={`app-shell theme-${theme}`}>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".md,text/markdown,text/plain" onChange={loadMarkdown} />
      <input ref={workDataInputRef} className="visually-hidden" type="file" accept=".json,.html,application/json,text/html" onChange={loadWorkData} />
      <div className="sticky-header-stack">
        <Header successMessage={successNotice?.text} onOpenFile={() => fileInputRef.current?.click()} onPasteMarkdown={() => setPasteDialogOpen(true)} onOpenWorkData={() => workDataInputRef.current?.click()} onExportWorkData={exportWorkData} canExportWorkData={Boolean(originalMarkdown)} onExportMarkdown={requestPolishingCompletion} canExportMarkdown={reviewRound.phase === 'polishing' && !structureDialogOpen} onExportReviewHtml={exportReviewHtml} canExportReviewHtml={Boolean(originalMarkdown)} onSwap={() => paneLayout === 'sideBySide' && setSwapped(value => !value)} onToggleSidebar={() => setSidebarOpen(value => !value)} activeTool={activeTool} onToolChange={changeActiveTool} paneLayout={paneLayout} onPaneLayoutChange={setPaneLayout} sidebarOpen={showSidebar} canSelectTools={canAddAnnotations} annotationCount={annotations.length} pendingCount={pendingAnnotations.length} onPreviousPending={() => movePending(-1)} onNextPending={() => movePending(1)} phase={reviewRound.phase} onCompleteReview={completeCurrentReview} canStartPolishing={reviewRound.phase === 'revising' && pendingAnnotations.length === 0} onStartPolishing={(() => setPolishingDialogOpen(true))} onCompleteRound={requestRoundCompletion} currentRoundNumber={reviewRound.number} canReviewAgain={completedReviewLoadedFromHtml} onReviewAgain={() => { if (reviewRound.phase === 'completed' && completedReviewLoadedFromHtml) initializeNextRound('reopened', reviewRound) }} onOpenSettings={() => setSettingsDialogOpen(true)} reviewerName={currentReviewer?.name ?? ''} onEditReviewer={() => setReviewerDialogOpen(true)} />
        {notice && <div className={`selection-notice ${documentSelection ? 'ready' : ''} ${notice === t('reviewHtml.formatError') ? 'floating-format-error' : ''}`} role={notice === t('reviewHtml.formatError') ? 'alert' : 'status'}><span>{notice}</span><button className="notice-close" type="button" onClick={clearDocumentSelection} aria-label={t('notice.noticeCloseAria')}>×</button></div>}
      </div>
      {paneLayout === 'sideBySide' && <div className="mobile-tabs" role="tablist" aria-label={t('mobileTabs.aria')}>
        <button type="button" role="tab" aria-selected={mobilePane === 'original'} onClick={() => setMobilePane('original')}>{t('document.originalAria')}</button>
        <button type="button" role="tab" aria-selected={mobilePane === 'draft'} onClick={() => setMobilePane('draft')}>{t('document.draftAria')}</button>
      </div>}
      <main className={`workspace ${showSidebar ? '' : 'sidebar-closed'} layout-${paneLayout}`}>
        <div className={`document-grid ${paneLayout !== 'sideBySide' ? 'single-pane-grid' : ''}`}>
          {visiblePanes.map(kind => <div className={`pane-slot mobile-${kind} ${paneLayout !== 'sideBySide' || mobilePane === kind ? 'mobile-active' : ''}`} key={kind}>{panes[kind]}</div>)}
        </div>
        {showSidebar && <Sidebar annotations={annotations} highlights={highlightAnnotations} activeAnnotationId={activeAnnotationId} onClose={() => setSidebarOpen(false)} onSelectAnnotation={selectAnnotation} onComplete={completeAnnotation} onApplyProposal={applyAnnotationProposal} onEdit={editAnnotation} onReopen={reopenAnnotation} onDeleteRequest={requestAnnotationDelete} phase={reviewRound.phase} activeTab={sidebarTab} onTabChange={setSidebarTab} currentReviewerName={currentReviewer?.name ?? ''} />}
      </main>
      {dialogOpen && annotationDialogSelection && <RedPenDialog mode={annotationEditTarget ? 'edit' : 'create'} selection={annotationDialogSelection} reviewText={editingRedAnnotation?.reviewText ?? ''} replacementText={editingRedAnnotation?.replacementText ?? ''} contentMode={editingRedAnnotation?.reviewText !== undefined ? 'comment' : editingRedAnnotation?.replacementText !== undefined ? 'proposal' : 'comment'} proposalMode={editingRedAnnotation?.replacementText === undefined ? 'none' : editingRedAnnotation.replacementText === '' ? 'delete' : 'text'} tag={editingRedAnnotation?.tag ?? null} onSwitchTool={() => switchSelectionTool('highlighter')} onCancel={clearDocumentSelection} onSubmit={addAnnotation} />}
      {highlightDialogOpen && annotationDialogSelection && <HighlightDialog mode={annotationEditTarget ? 'edit' : 'create'} selection={annotationDialogSelection} comment={editingHighlightAnnotation?.comment ?? ''} color={editingHighlightAnnotation?.color ?? 'yellow'} tag={editingHighlightAnnotation?.tag ?? null} onSwitchTool={() => switchSelectionTool('redPen')} onCancel={clearDocumentSelection} onSubmit={addHighlightAnnotation} />}
      {pasteDialogOpen && <PasteMarkdownDialog onCancel={() => setPasteDialogOpen(false)} onStart={markdown => startReview(markdown, 'pasted_markdown.md')} />}
      {settingsDialogOpen && <SettingsDialog developerMode={developerMode} theme={theme} locale={locale} canExportAiReview={Boolean(originalMarkdown)} onDeveloperModeChange={changeDeveloperMode} onThemeChange={changeTheme} onLocaleChange={changeLocale} onOpenAiReviewExport={() => { setSettingsDialogOpen(false); setAiReviewExportDialogOpen(true) }} onClose={() => setSettingsDialogOpen(false)} />}
      {reviewerDialogOpen && <ReviewerDialog name={currentReviewer?.name ?? ''} onCancel={() => setReviewerDialogOpen(false)} onSave={saveReviewerName} />}
      {aiReviewExportDialogOpen && <AiReviewExportDialog onCancel={() => setAiReviewExportDialogOpen(false)} onCreate={exportAiReview} />}
      {lockDialogOpen && <ReviewLockDialog onCancel={() => setLockDialogOpen(false)} onConfirm={confirmReviewLock} />}
      {structureDialogOpen && <MarkdownStructureDialog changes={structureChanges} onBack={returnToStructureEditing} onApply={commitDraftEditing} applyLabel={isPolishing ? t('structure.applyChange') : t('structure.apply')} />}
      {polishingDialogOpen && <PolishingConfirmDialog onCancel={() => setPolishingDialogOpen(false)} onConfirm={enterPolishing} />}
      {exportDialogOpen && <MarkdownExportDialog fileName={completedFileName} roundNumber={reviewRound.number} exporting={exporting} error={exportError} onBack={() => { setExportDialogOpen(false); setExportError('') }} onExport={exportCompletedMarkdown} />}
      {roundCompletionDialogOpen && reviewRound.phase === 'polishing' && <RoundCompletionDialog currentRound={reviewRound.number} nextRound={reviewRound.number + 1} fileName={reviewHtmlFileName} saving={roundCompletionSaving} error={roundCompletionError} saveCanBeConfirmed={canConfirmRoundSave((window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker)} onCancel={() => { if (!roundCompletionSaving) { setRoundCompletionDialogOpen(false); setRoundCompletionError('') } }} onFinish={() => completeRoundWithArchive('finish')} onStartNext={() => completeRoundWithArchive('next')} />}
      {deleteTarget && (() => {
        const annotation = deleteTarget.kind === 'red_pen'
          ? annotations.find(item => item.id === deleteTarget.id)
          : highlightAnnotations.find(item => item.id === deleteTarget.id)
        if (!annotation) return null
        const target = deleteTarget.kind === 'red_pen'
          ? { kind: 'red_pen' as const, annotation: annotation as RedPenAnnotation }
          : { kind: 'highlight' as const, annotation: annotation as HighlightAnnotation }
        return <AnnotationDeleteDialog target={target} onCancel={() => setDeleteTarget(null)} onConfirm={confirmAnnotationDelete} />
      })()}
    </div>
  )
}

export default App
