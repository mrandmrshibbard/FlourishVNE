/**
 * Typewriter effect hook for dialogue text
 */

import { useState, useEffect } from 'react';

export const useTypewriter = (text: string, speed: number) => {
    const [displayText, setDisplayText] = useState('');
    const hasFinished = displayText.length === text.length;

    useEffect(() => {
        setDisplayText('');
        if (!text) return;

        const interval = setInterval(() => {
            setDisplayText(prev => {
                if (prev.length < text.length) {
                    return text.substring(0, prev.length + 1);
                } else {
                    clearInterval(interval);
                    return prev;
                }
            });
        }, 1000 / speed);

        return () => clearInterval(interval);
    }, [text, speed]);
    
    const skip = () => setDisplayText(text);

    return { displayText, skip, hasFinished };
};
