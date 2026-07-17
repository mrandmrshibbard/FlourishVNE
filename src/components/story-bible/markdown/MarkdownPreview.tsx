import React from 'react';
import { parseMarkdownLite, MdInline } from '../../../utils/markdownLite';

/** Renders markdown-lite blocks as real React elements — never innerHTML. */
const renderInline = (nodes: MdInline[], keyBase: string): React.ReactNode =>
    nodes.map((n, i) => {
        const key = `${keyBase}-${i}`;
        if (n.type === 'bold') return <strong key={key}>{renderInline(n.children, key)}</strong>;
        if (n.type === 'italic') return <em key={key}>{renderInline(n.children, key)}</em>;
        return <React.Fragment key={key}>{n.text}</React.Fragment>;
    });

const H_CLASS: Record<number, string> = {
    1: 'text-xl font-bold text-white mt-3 mb-1',
    2: 'text-lg font-semibold text-white mt-3 mb-1',
    3: 'text-base font-semibold text-slate-100 mt-2 mb-0.5',
};

export const MarkdownPreview: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
    const blocks = parseMarkdownLite(text);
    return (
        <div className={className}>
            {blocks.map((b, bi) => {
                if (b.type === 'heading') {
                    const Tag = (`h${b.level}`) as 'h1' | 'h2' | 'h3';
                    return <Tag key={bi} className={H_CLASS[b.level]}>{renderInline(b.inline, `h${bi}`)}</Tag>;
                }
                if (b.type === 'list') {
                    const items = b.items.map((item, ii) => <li key={ii}>{renderInline(item, `l${bi}-${ii}`)}</li>);
                    return b.ordered
                        ? <ol key={bi} className="list-decimal pl-5 my-1 text-sm text-slate-200 leading-relaxed">{items}</ol>
                        : <ul key={bi} className="list-disc pl-5 my-1 text-sm text-slate-200 leading-relaxed">{items}</ul>;
                }
                return (
                    <p key={bi} className="text-sm text-slate-200 leading-relaxed my-1">
                        {b.lines.map((line, li) => (
                            <React.Fragment key={li}>
                                {li > 0 && <br />}
                                {renderInline(line, `p${bi}-${li}`)}
                            </React.Fragment>
                        ))}
                    </p>
                );
            })}
        </div>
    );
};

export default MarkdownPreview;
