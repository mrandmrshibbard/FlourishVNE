import { describe, it, expect } from 'vitest';
import { parseMarkdownLite, parseInline } from '../markdownLite';

describe('parseMarkdownLite', () => {
    it('parses heading levels 1-3', () => {
        expect(parseMarkdownLite('# One')).toEqual([{ type: 'heading', level: 1, inline: [{ type: 'text', text: 'One' }] }]);
        expect(parseMarkdownLite('## Two')[0]).toMatchObject({ type: 'heading', level: 2 });
        expect(parseMarkdownLite('### Three')[0]).toMatchObject({ type: 'heading', level: 3 });
        // #### is NOT a heading — stays a paragraph
        expect(parseMarkdownLite('#### Four')[0].type).toBe('paragraph');
    });

    it('splits paragraphs on blank lines and keeps intra-paragraph line breaks', () => {
        const blocks = parseMarkdownLite('line one\nline two\n\nsecond para');
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({ type: 'paragraph' });
        expect((blocks[0] as any).lines).toHaveLength(2);
        expect((blocks[1] as any).lines).toHaveLength(1);
    });

    it('groups consecutive bullets into one list (- and * both work)', () => {
        const blocks = parseMarkdownLite('- a\n* b\n- c');
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({ type: 'list', ordered: false });
        expect((blocks[0] as any).items).toHaveLength(3);
    });

    it('parses numbered lists separately from bullets', () => {
        const blocks = parseMarkdownLite('1. first\n2. second\n\n- bullet');
        expect(blocks[0]).toMatchObject({ type: 'list', ordered: true });
        expect((blocks[0] as any).items).toHaveLength(2);
        expect(blocks[1]).toMatchObject({ type: 'list', ordered: false });
    });

    it('parses bold, italic, and italic inside bold', () => {
        expect(parseInline('a **b** c')).toEqual([
            { type: 'text', text: 'a ' },
            { type: 'bold', children: [{ type: 'text', text: 'b' }] },
            { type: 'text', text: ' c' },
        ]);
        expect(parseInline('*i*')).toEqual([{ type: 'italic', children: [{ type: 'text', text: 'i' }] }]);
        const bi = parseInline('**bold *and italic***');
        expect(bi[0].type).toBe('bold');
        expect((bi[0] as any).children.some((c: any) => c.type === 'italic')).toBe(true);
    });

    it('leaves unpaired markers literal', () => {
        expect(parseInline('lone * star')).toEqual([{ type: 'text', text: 'lone * star' }]);
        expect(parseInline('open **only')).toEqual([{ type: 'text', text: 'open **only' }]);
    });

    it('handles empty input', () => {
        expect(parseMarkdownLite('')).toEqual([]);
        expect(parseMarkdownLite('\n\n')).toEqual([]);
    });
});
