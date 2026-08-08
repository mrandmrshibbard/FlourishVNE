/**
 * Robust `data:` URL → raw bytes decoding, shared by the game builders and the asset store.
 *
 * The naive `atob(dataUrl.split(',')[1])` breaks on real-world data URLs that are perfectly
 * loadable by the browser: base64 payloads with line wraps or stray whitespace, %-encoded
 * padding, URL-safe base64 from external tools, and non-base64 text payloads like
 * `data:image/svg+xml;utf8,<svg …>`. Any one of those used to kill a whole game build with
 * "Failed to execute 'atob' on 'Window'". This decoder accepts everything the browser accepts.
 */

export interface DecodedDataUrl {
    bytes: Uint8Array;
    mime: string;
}

export function decodeDataUrl(dataUrl: string): DecodedDataUrl {
    const comma = dataUrl.indexOf(',');
    if (!dataUrl.startsWith('data:') || comma < 0) {
        throw new Error('Not a data: URL');
    }
    const meta = dataUrl.slice(0, comma);
    const data = dataUrl.slice(comma + 1);
    const mime = meta.match(/^data:([^;,]+)/)?.[1] || 'application/octet-stream';

    if (/;base64/i.test(meta)) {
        // atob rejects whitespace (line-wrapped payloads) and %-encoded chars ("%3D" padding).
        let b64 = data.replace(/\s/g, '');
        if (b64.includes('%')) {
            try { b64 = decodeURIComponent(b64); } catch { /* leave as-is; atob gets a shot */ }
        }
        // URL-safe base64 variants from external tools, plus missing padding.
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
        const rem = b64.length % 4;
        if (rem === 2) b64 += '==';
        else if (rem === 3) b64 += '=';
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return { bytes: out, mime };
    }

    // Text payload (e.g. URL-encoded SVG). Decode the percent-encoding, then emit real UTF-8
    // bytes — charCodeAt-into-Uint8Array would truncate any non-ASCII character.
    let text = data;
    try { text = decodeURIComponent(data); } catch { /* raw text payload */ }
    return { bytes: new TextEncoder().encode(text), mime };
}
