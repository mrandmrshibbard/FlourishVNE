import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownPreview from './MarkdownPreview';

/**
 * The Story Bible's writing box: a textarea with a small formatting toolbar (the buttons
 * just insert markdown-lite syntax around the selection) and an Edit ⇄ Preview toggle.
 * Content is stored as plain markdown-lite text.
 */
const MarkdownEditor: React.FC<{
    value: string;
    onChange: (value: string) => void;
    minRows?: number;
    placeholder?: string;
}> = ({ value, onChange, minRows = 6, placeholder }) => {
    const { t } = useTranslation('storyBible');
    const [preview, setPreview] = useState(false);
    const taRef = useRef<HTMLTextAreaElement | null>(null);

    /** Replace [selStart, selEnd) with `next`, restoring a sensible selection afterwards. */
    const splice = (selStart: number, selEnd: number, next: string, cursorFrom: number, cursorTo: number) => {
        const ta = taRef.current;
        const updated = value.slice(0, selStart) + next + value.slice(selEnd);
        onChange(updated);
        requestAnimationFrame(() => {
            if (!ta) return;
            ta.focus();
            ta.setSelectionRange(cursorFrom, cursorTo);
        });
    };

    const wrapSelection = (marker: string) => {
        const ta = taRef.current;
        if (!ta) return;
        const s = ta.selectionStart, e = ta.selectionEnd;
        const inner = value.slice(s, e) || t('editor.placeholderWord', 'text');
        const next = `${marker}${inner}${marker}`;
        splice(s, e, next, s + marker.length, s + marker.length + inner.length);
    };

    /** Cycle the current line's heading: none → # → ## → ### → none. */
    const cycleHeading = () => {
        const ta = taRef.current;
        if (!ta) return;
        const s = ta.selectionStart;
        const lineStart = value.lastIndexOf('\n', s - 1) + 1;
        let lineEnd = value.indexOf('\n', s);
        if (lineEnd === -1) lineEnd = value.length;
        const line = value.slice(lineStart, lineEnd);
        const m = /^(#{1,3}) /.exec(line);
        const bare = m ? line.slice(m[1].length + 1) : line;
        const nextPrefix = !m ? '# ' : m[1].length < 3 ? '#'.repeat(m[1].length + 1) + ' ' : '';
        const next = nextPrefix + bare;
        splice(lineStart, lineEnd, next, lineStart + next.length, lineStart + next.length);
    };

    /** Prefix every selected line (or the current one) for lists. */
    const prefixLines = (ordered: boolean) => {
        const ta = taRef.current;
        if (!ta) return;
        const s = ta.selectionStart, e = ta.selectionEnd;
        const blockStart = value.lastIndexOf('\n', s - 1) + 1;
        let blockEnd = value.indexOf('\n', Math.max(e - 1, s));
        if (blockEnd === -1) blockEnd = value.length;
        const lines = value.slice(blockStart, blockEnd).split('\n');
        const next = lines.map((l, i) => l.trim() ? (ordered ? `${i + 1}. ${l.replace(/^(\d+\. |[-*] )/, '')}` : `- ${l.replace(/^(\d+\. |[-*] )/, '')}`) : l).join('\n');
        splice(blockStart, blockEnd, next, blockStart, blockStart + next.length);
    };

    const btn = 'px-2 py-0.5 rounded text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent-cyan)]/60 transition-colors';

    return (
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
            <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--border-subtle)]">
                {!preview && <>
                    <button type="button" className={btn} onClick={cycleHeading} title={t('editor.heading', 'Heading (click again for smaller)')}>H</button>
                    <button type="button" className={`${btn} font-bold`} onClick={() => wrapSelection('**')} title={t('editor.bold', 'Bold')}>B</button>
                    <button type="button" className={`${btn} italic`} onClick={() => wrapSelection('*')} title={t('editor.italic', 'Italic')}>I</button>
                    <button type="button" className={btn} onClick={() => prefixLines(false)} title={t('editor.bulletList', 'Bullet list')}>•</button>
                    <button type="button" className={btn} onClick={() => prefixLines(true)} title={t('editor.numberedList', 'Numbered list')}>1.</button>
                </>}
                <div className="flex-1" />
                <button
                    type="button"
                    className={`${btn} ${preview ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : ''}`}
                    onClick={() => setPreview(p => !p)}
                >
                    {preview ? t('editor.edit', '✏ Edit') : t('editor.preview', '👁 Preview')}
                </button>
            </div>
            {preview ? (
                <MarkdownPreview text={value} className="px-3 py-2 min-h-[80px]" />
            ) : (
                <textarea
                    ref={taRef}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    rows={minRows}
                    placeholder={placeholder ?? t('editor.placeholder', 'Write your notes here… Use the buttons above for headings, bold, and lists.')}
                    className="w-full bg-transparent text-sm text-slate-200 px-3 py-2 outline-none resize-y leading-relaxed placeholder:text-[var(--text-muted)]"
                />
            )}
        </div>
    );
};

export default MarkdownEditor;
