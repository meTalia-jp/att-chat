// Adapted selectively from RpenProof MarkdownViewer.tsx; see docs/phase0-provenance.md.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Highlight } from './types';
type N = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: N[]; position?: { start: { offset?: number }; end: { offset?: number } } };
const blocks = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const offsets = (n?: N) => {
  const s = n?.position?.start.offset, e = n?.position?.end.offset;
  return typeof s === 'number' && typeof e === 'number' ? { s, e } : null;
};
const element = (tagName: string, properties: Record<string, unknown>, children: N[]): N => ({ type: 'element', tagName, properties, children });

function positionPlugin(content: string, highlights: Highlight[]) {
  return () => (tree: N) => {
    const walk = (node: N, blocked = false) => {
      blocked ||= ['pre', 'table'].includes(node.tagName ?? '');
      const pos = offsets(node);
      if (node.type === 'element' && blocks.has(node.tagName ?? '') && pos) {
        node.properties = { ...node.properties, 'data-block': `${node.tagName}-${pos.s}` };
      }
      node.children = node.children?.flatMap(child => {
        if (child.type !== 'text') { walk(child, blocked); return [child]; }
        if (blocked || !child.value) return [child];
        const own = offsets(child);
        let range = own && content.slice(own.s, own.e) === child.value ? own : null;
        // RpenProof unique-match fallback is narrowed to inline code only.
        if (!range && node.tagName === 'code' && pos) {
          const source = content.slice(pos.s, pos.e), index = source.indexOf(child.value);
          if (index >= 0 && index === source.lastIndexOf(child.value)) range = { s: pos.s + index, e: pos.s + index + child.value.length };
        }
        if (!range) return [element('span', { 'data-unmapped': 'true' }, [child])];
        const { s, e } = range;
        const matching = highlights.filter(h => h.status === 'resolved' && h.start_offset < e && h.end_offset > s);
        const cuts = [...new Set([s, e, ...matching.flatMap(h => [Math.max(s, h.start_offset), Math.min(e, h.end_offset)])])].sort((a, b) => a - b);
        return cuts.slice(0, -1).map((start, i) => {
          const end = cuts[i + 1], h = matching.find(h => h.start_offset <= start && h.end_offset >= end);
          return element(h ? 'mark' : 'span', { 'data-s': start, 'data-e': end, ...(h ? { 'data-highlight': h.highlight_id, className: [`mark-${h.color}`], tabIndex: -1 } : {}) }, [{ type: 'text', value: content.slice(start, end) }]);
        });
      });
    };
    walk(tree);
  };
}

export function Markdown({ content, highlights }: { content: string; highlights: Highlight[] }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[positionPlugin(content, highlights)]} components={{ a: ({ children }) => <a role="link" aria-disabled="true">{children}</a>, img: () => <span>［画像はPoC対象外］</span> }}>{content}</ReactMarkdown>;
}
