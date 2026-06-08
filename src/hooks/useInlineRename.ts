import React, { useState, useEffect } from 'react';

/**
 * Hook for inline rename editing with keyboard and blur handling.
 * Manages rename value state, Enter to commit, Escape to cancel, blur to commit.
 *
 * @param currentName  The current (original) name of the item being renamed.
 * @param onCommit     Called with the new name on Enter/blur, or the original name on Escape.
 * @returns `inputProps` to spread onto an `<input>`, plus `value` / `setValue` for custom needs.
 */
export function useInlineRename(
    currentName: string,
    onCommit: (name: string) => void,
) {
    const [value, setValue] = useState(currentName);

    // Sync when the underlying name changes (e.g. different item selected for rename)
    useEffect(() => { setValue(currentName); }, [currentName]);

    const inputProps = {
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
        onBlur: () => onCommit(value),
        onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') { onCommit(value); }
            else if (e.key === 'Escape') { setValue(currentName); onCommit(currentName); }
        },
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        autoFocus: true as const,
    };

    return { value, setValue, inputProps };
}
