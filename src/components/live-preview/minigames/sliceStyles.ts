import React from 'react';

/**
 * CSS background-slicing shared by the sliding puzzle tiles AND assemble's auto-slice mode:
 * one image, cols×rows cells, no canvas work (taint-free, GPU-composited).
 *
 * Uses the standard background-position trick: with backgroundSize `${cols*100}% ${rows*100}%`,
 * a position of `(col/(cols-1))*100%` aligns exactly the col-th cell into the box.
 */
export function sliceCellStyle(url: string, cols: number, rows: number, col: number, row: number): React.CSSProperties {
    return {
        backgroundImage: `url("${url}")`,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${cols <= 1 ? 0 : (col / (cols - 1)) * 100}% ${rows <= 1 ? 0 : (row / (rows - 1)) * 100}%`,
        backgroundRepeat: 'no-repeat',
    };
}
