/**
 * Easing functions for tweening animations.
 * Each function takes a progress value t (0..1) and returns the eased value (0..1).
 */

export type EasingType =
    | 'linear'
    | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
    | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
    | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
    | 'easeInQuint' | 'easeOutQuint' | 'easeInOutQuint'
    | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
    | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo'
    | 'easeInCirc' | 'easeOutCirc' | 'easeInOutCirc'
    | 'easeInBack' | 'easeOutBack' | 'easeInOutBack'
    | 'easeInElastic' | 'easeOutElastic' | 'easeInOutElastic'
    | 'easeInBounce' | 'easeOutBounce' | 'easeInOutBounce';

const easingFunctions: Record<EasingType, (t: number) => number> = {
    linear: (t) => t,

    // Quadratic
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

    // Cubic
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => { const t1 = t - 1; return t1 * t1 * t1 + 1; },
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),

    // Quartic
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => { const t1 = t - 1; return 1 - t1 * t1 * t1 * t1; },
    easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t),

    // Quintic
    easeInQuint: (t) => t * t * t * t * t,
    easeOutQuint: (t) => { const t1 = t - 1; return 1 + t1 * t1 * t1 * t1 * t1; },
    easeInOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t),

    // Sinusoidal
    easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

    // Exponential
    easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
    easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeInOutExpo: (t) => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        return t < 0.5
            ? Math.pow(2, 20 * t - 10) / 2
            : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },

    // Circular
    easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
    easeOutCirc: (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
    easeInOutCirc: (t) =>
        t < 0.5
            ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
            : (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2,

    // Back (overshoot)
    easeInBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
    easeOutBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; const t1 = t - 1; return 1 + c3 * t1 * t1 * t1 + c1 * t1 * t1; },
    easeInOutBack: (t) => {
        const c1 = 1.70158;
        const c2 = c1 * 1.525;
        return t < 0.5
            ? ((2 * t) * (2 * t) * ((c2 + 1) * 2 * t - c2)) / 2
            : ((2 * t - 2) * (2 * t - 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    },

    // Elastic
    easeInElastic: (t) => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
    },
    easeOutElastic: (t) => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    },
    easeInOutElastic: (t) => {
        if (t === 0) return 0;
        if (t === 1) return 1;
        const c5 = (2 * Math.PI) / 4.5;
        return t < 0.5
            ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
            : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    },

    // Bounce
    easeOutBounce: (t) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },
    easeInBounce: (t) => 1 - easingFunctions.easeOutBounce(1 - t),
    easeInOutBounce: (t) =>
        t < 0.5
            ? (1 - easingFunctions.easeOutBounce(1 - 2 * t)) / 2
            : (1 + easingFunctions.easeOutBounce(2 * t - 1)) / 2,
};

/**
 * Apply an easing function to a progress value.
 */
export function applyEasing(t: number, easing: EasingType = 'linear'): number {
    const fn = easingFunctions[easing] || easingFunctions.linear;
    return fn(Math.max(0, Math.min(1, t)));
}

/**
 * Linearly interpolate between two numbers.
 */
export function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

/**
 * Interpolate a hex color string.
 */
export function lerpColor(from: string, to: string, t: number): string {
    const fromRgb = hexToRgb(from);
    const toRgb = hexToRgb(to);
    if (!fromRgb || !toRgb) return to;
    const r = Math.round(lerp(fromRgb.r, toRgb.r, t));
    const g = Math.round(lerp(fromRgb.g, toRgb.g, t));
    const b = Math.round(lerp(fromRgb.b, toRgb.b, t));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const match = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return null;
    return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

export default easingFunctions;
