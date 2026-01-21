import React, { useState, useRef, useEffect, useMemo } from 'react';

interface SearchableSelectOption {
    value: string;
    label: string;
    group?: string;
}

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SearchableSelectOption[];
    placeholder?: string;
    emptyMessage?: string;
    className?: string;
    disabled?: boolean;
}

/**
 * A searchable dropdown component for long lists of options.
 * Supports grouping, keyboard navigation, and filtering.
 */
const SearchableSelect: React.FC<SearchableSelectProps> = ({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    emptyMessage = 'No options available',
    className = '',
    disabled = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Find current selection label
    const selectedOption = options.find(opt => opt.value === value);
    const displayLabel = selectedOption?.label || placeholder;

    // Filter options based on search
    const filteredOptions = useMemo(() => {
        if (!search.trim()) return options;
        const searchLower = search.toLowerCase();
        return options.filter(opt => 
            opt.label.toLowerCase().includes(searchLower) ||
            opt.group?.toLowerCase().includes(searchLower)
        );
    }, [options, search]);

    // Group filtered options
    const groupedOptions = useMemo(() => {
        const groups: Record<string, SearchableSelectOption[]> = {};
        const ungrouped: SearchableSelectOption[] = [];
        
        filteredOptions.forEach(opt => {
            if (opt.group) {
                if (!groups[opt.group]) groups[opt.group] = [];
                groups[opt.group].push(opt);
            } else {
                ungrouped.push(opt);
            }
        });
        
        return { groups, ungrouped };
    }, [filteredOptions]);

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && listRef.current) {
            const highlighted = listRef.current.querySelector('[data-highlighted="true"]');
            if (highlighted) {
                highlighted.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    // Reset highlight when filter changes
    useEffect(() => {
        setHighlightedIndex(0);
    }, [search]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => 
                    Math.min(prev + 1, filteredOptions.length - 1)
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredOptions[highlightedIndex]) {
                    onChange(filteredOptions[highlightedIndex].value);
                    setIsOpen(false);
                    setSearch('');
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setSearch('');
                break;
        }
    };

    const handleSelect = (optValue: string) => {
        onChange(optValue);
        setIsOpen(false);
        setSearch('');
    };

    if (disabled) {
        return (
            <div className={`searchable-select searchable-select--disabled ${className}`}>
                <span className="searchable-select__display">{displayLabel}</span>
            </div>
        );
    }

    return (
        <div 
            ref={containerRef} 
            className={`searchable-select ${isOpen ? 'searchable-select--open' : ''} ${className}`}
            onKeyDown={handleKeyDown}
        >
            {/* Trigger button */}
            <button
                type="button"
                className="searchable-select__trigger"
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className="searchable-select__display">{displayLabel}</span>
                <span className="searchable-select__arrow">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                </span>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="searchable-select__dropdown">
                    {/* Search input */}
                    {options.length > 5 && (
                        <div className="searchable-select__search">
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Type to search..."
                                className="searchable-select__search-input"
                                onClick={e => e.stopPropagation()}
                            />
                        </div>
                    )}

                    {/* Options list */}
                    <div ref={listRef} className="searchable-select__list" role="listbox">
                        {filteredOptions.length === 0 ? (
                            <div className="searchable-select__empty">
                                {search ? 'No matches found' : emptyMessage}
                            </div>
                        ) : (
                            <>
                                {/* Ungrouped options */}
                                {groupedOptions.ungrouped.map((opt, idx) => {
                                    const globalIndex = idx;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`searchable-select__option ${value === opt.value ? 'searchable-select__option--selected' : ''} ${highlightedIndex === globalIndex ? 'searchable-select__option--highlighted' : ''}`}
                                            onClick={() => handleSelect(opt.value)}
                                            data-highlighted={highlightedIndex === globalIndex}
                                            role="option"
                                            aria-selected={value === opt.value}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                                
                                {/* Grouped options */}
                                {Object.entries(groupedOptions.groups).map(([groupName, groupOpts]) => (
                                    <div key={groupName} className="searchable-select__group">
                                        <div className="searchable-select__group-label">{groupName}</div>
                                        {groupOpts.map((opt) => {
                                            const globalIndex = filteredOptions.indexOf(opt);
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    className={`searchable-select__option ${value === opt.value ? 'searchable-select__option--selected' : ''} ${highlightedIndex === globalIndex ? 'searchable-select__option--highlighted' : ''}`}
                                                    onClick={() => handleSelect(opt.value)}
                                                    data-highlighted={highlightedIndex === globalIndex}
                                                    role="option"
                                                    aria-selected={value === opt.value}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .searchable-select {
                    position: relative;
                    width: 100%;
                }
                
                .searchable-select__trigger {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 0.5rem;
                    padding: 0.5rem 0.75rem;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-default);
                    border-radius: var(--radius-lg);
                    color: var(--text-primary);
                    font-size: 0.875rem;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: left;
                }
                
                .searchable-select__trigger:hover {
                    border-color: var(--border-strong);
                    background: var(--bg-secondary);
                }
                
                .searchable-select--open .searchable-select__trigger {
                    border-color: var(--accent-purple);
                    box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15);
                    background: var(--bg-secondary);
                }
                
                .searchable-select__display {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .searchable-select__arrow {
                    flex-shrink: 0;
                    opacity: 0.5;
                    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .searchable-select--open .searchable-select__arrow {
                    transform: rotate(180deg);
                    opacity: 0.8;
                }
                
                .searchable-select__dropdown {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    margin-top: 0.375rem;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-default);
                    border-radius: var(--radius-lg);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(139, 92, 246, 0.1);
                    z-index: 50;
                    overflow: hidden;
                    animation: dropdown-enter 0.15s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                @keyframes dropdown-enter {
                    from {
                        opacity: 0;
                        transform: translateY(-4px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                
                .searchable-select__search {
                    padding: 0.5rem;
                    border-bottom: 1px solid var(--border-subtle);
                    background: var(--bg-tertiary);
                }
                
                .searchable-select__search-input {
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-size: 0.75rem;
                    outline: none;
                    transition: all 0.15s;
                }
                
                .searchable-select__search-input:focus {
                    border-color: var(--accent-purple);
                    box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.1);
                }
                
                .searchable-select__search-input::placeholder {
                    color: var(--text-muted);
                }
                
                .searchable-select__list {
                    max-height: 200px;
                    overflow-y: auto;
                    padding: 0.375rem;
                }
                
                .searchable-select__option {
                    display: block;
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    background: transparent;
                    border: none;
                    border-radius: var(--radius-md);
                    color: var(--text-primary);
                    font-size: 0.75rem;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.1s;
                }
                
                .searchable-select__option:hover,
                .searchable-select__option--highlighted {
                    background: rgba(139, 92, 246, 0.15);
                }
                
                .searchable-select__option--selected {
                    background: linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%);
                    color: var(--accent-cyan);
                    font-weight: 500;
                }
                
                .searchable-select__option--selected.searchable-select__option--highlighted {
                    background: linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(59, 130, 246, 0.3) 100%);
                }
                
                .searchable-select__group {
                    margin-top: 0.375rem;
                    padding-top: 0.375rem;
                    border-top: 1px solid var(--border-subtle);
                }
                
                .searchable-select__group:first-child {
                    margin-top: 0;
                    padding-top: 0;
                    border-top: none;
                }
                
                .searchable-select__group-label {
                    padding: 0.375rem 0.75rem;
                    font-size: 0.65rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    color: var(--text-muted);
                    letter-spacing: 0.08em;
                }
                
                .searchable-select__empty {
                    padding: 1.5rem 1rem;
                    text-align: center;
                    color: var(--text-muted);
                    font-size: 0.75rem;
                }
                
                .searchable-select--disabled {
                    opacity: 0.5;
                    pointer-events: none;
                }
                
                .searchable-select--disabled .searchable-select__trigger {
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};

export default SearchableSelect;
