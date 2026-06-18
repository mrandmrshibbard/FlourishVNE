import React from 'react';

// FIX: Add an optional `title` prop to all icon components to support accessibility via the <title> SVG element.
export const PlayIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
    {title && <title>{title}</title>}
    <path d="M6.3 2.841A1.5 1.5 0 0 0 4 4.11V15.89a1.5 1.5 0 0 0 2.3 1.269l9.344-5.89a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
  </svg>
);

export const PlusIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
    {title && <title>{title}</title>}
    <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
  </svg>
);

export const TrashIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M8.5 2h3a.5.5 0 0 1 .5.5V4h3.25a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1 0-1.5H8V2.5a.5.5 0 0 1 .5-.5Z" />
        <path fillRule="evenodd" d="M5.28 6.5h9.44l-.66 9.85A2.25 2.25 0 0 1 11.82 18H8.18a2.25 2.25 0 0 1-2.24-1.65L5.28 6.5ZM7.75 8.5a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5a.75.75 0 0 1 .75-.75Zm5.25.75a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0v-5Z" clipRule="evenodd" />
    </svg>
);

export const ClockIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
    </svg>
);

// 🎬 Scenes - Film/Script icon
export const ScenesIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M1 4.75C1 3.784 1.784 3 2.75 3h14.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0117.25 17H2.75A1.75 1.75 0 011 15.25V4.75zm2.5 0a.25.25 0 01.25-.25h1a.25.25 0 01.25.25v1a.25.25 0 01-.25.25h-1a.25.25 0 01-.25-.25v-1zm4 0a.25.25 0 01.25-.25h1a.25.25 0 01.25.25v1a.25.25 0 01-.25.25h-1a.25.25 0 01-.25-.25v-1zm4.25-.25a.25.25 0 00-.25.25v1c0 .138.112.25.25.25h1a.25.25 0 00.25-.25v-1a.25.25 0 00-.25-.25h-1zm3.75.25a.25.25 0 01.25-.25h1a.25.25 0 01.25.25v1a.25.25 0 01-.25.25h-1a.25.25 0 01-.25-.25v-1zM3.5 14a.25.25 0 01.25-.25h1a.25.25 0 01.25.25v1a.25.25 0 01-.25.25h-1a.25.25 0 01-.25-.25v-1zm4.25-.25a.25.25 0 00-.25.25v1c0 .138.112.25.25.25h1a.25.25 0 00.25-.25v-1a.25.25 0 00-.25-.25h-1zm3.75.25a.25.25 0 01.25-.25h1a.25.25 0 01.25.25v1a.25.25 0 01-.25.25h-1a.25.25 0 01-.25-.25v-1zm4.25-.25a.25.25 0 00-.25.25v1c0 .138.112.25.25.25h1a.25.25 0 00.25-.25v-1a.25.25 0 00-.25-.25h-1zM4 8.75A.75.75 0 014.75 8h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 8.75zm.75 2.5a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z" clipRule="evenodd" />
    </svg>
);

// 👤 Characters - Person/User icon  
export const CharactersIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
    </svg>
);

// 🖼️ UI Screens - Layout/Window icon
export const UIScreensIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M3.5 2A1.5 1.5 0 002 3.5v13A1.5 1.5 0 003.5 18h13a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-13zM3.5 3.5h13v3h-13v-3zm0 4.5h4v9h-4V8zm5.5 9V8h7.5v9H9z" clipRule="evenodd" />
    </svg>
);

// 📁 Assets - Folder with image icon
export const AssetsIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M2 4.75C2 3.784 2.784 3 3.75 3h4.836c.464 0 .909.184 1.237.513l1.414 1.414a.25.25 0 00.177.073h4.836c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0116.25 17H3.75A1.75 1.75 0 012 15.25V4.75zm6.5 6.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm4.22.22a.75.75 0 011.06 0l1.5 1.5a.75.75 0 01-.018 1.042.75.75 0 01-1.042.018L13 12.56l-1.22 1.22a.75.75 0 01-1.042.018.75.75 0 01-.018-1.042l1.5-1.5a.75.75 0 01.5-.236z" clipRule="evenodd" />
    </svg>
);

// 📊 Variables - Data/Database icon
export const VariablesIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm4.75 6.75a.75.75 0 00-1.5 0v2.546l-.943-1.048a.75.75 0 00-1.114 1.004l2.25 2.5a.75.75 0 001.114 0l2.25-2.5a.75.75 0 10-1.114-1.004l-.943 1.048V8.75zm2.5 5.5a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z" clipRule="evenodd" />
    </svg>
);

// ⚙️ Settings - Gear icon
export const SettingsIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 011.262.125l.962.962a1 1 0 01.125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 01.804.98v1.361a1 1 0 01-.804.98l-1.473.295a6.95 6.95 0 01-.587 1.416l.834 1.25a1 1 0 01-.125 1.262l-.962.962a1 1 0 01-1.262.125l-1.25-.834a6.953 6.953 0 01-1.416.587l-.294 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.295-1.473a6.957 6.957 0 01-1.416-.587l-1.25.834a1 1 0 01-1.262-.125l-.962-.962a1 1 0 01-.125-1.262l.834-1.25a6.957 6.957 0 01-.587-1.416l-1.473-.294A1 1 0 011 10.68V9.32a1 1 0 01.804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 01.125-1.262l.962-.962A1 1 0 015.38 3.03l1.25.834a6.957 6.957 0 011.416-.587l.294-1.473zM13 10a3 3 0 11-6 0 3 3 0 016 0z" clipRule="evenodd" />
    </svg>
);

// ✨ Templates - Sparkle/Magic icon
export const TemplatesIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M10 1l.894 3.578a1.5 1.5 0 001.028 1.028L15.5 6.5l-3.578.894a1.5 1.5 0 00-1.028 1.028L10 12l-.894-3.578a1.5 1.5 0 00-1.028-1.028L4.5 6.5l3.578-.894a1.5 1.5 0 001.028-1.028L10 1z" />
        <path d="M15 11l.447 1.789a.75.75 0 00.514.514L17.75 14l-1.789.447a.75.75 0 00-.514.514L15 16.75l-.447-1.789a.75.75 0 00-.514-.514L12.25 14l1.789-.447a.75.75 0 00.514-.514L15 11z" />
        <path d="M5 14l.298 1.192a.5.5 0 00.343.343L6.833 15.833l-1.192.298a.5.5 0 00-.343.343L5 17.666l-.298-1.192a.5.5 0 00-.343-.343L3.167 15.833l1.192-.298a.5.5 0 00.343-.343L5 14z" />
    </svg>
);

// ✨ Sparkles - Magic/Wizard icon (alias for TemplatesIcon but with different semantics)
export const SparklesIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M10 1l.894 3.578a1.5 1.5 0 001.028 1.028L15.5 6.5l-3.578.894a1.5 1.5 0 00-1.028 1.028L10 12l-.894-3.578a1.5 1.5 0 00-1.028-1.028L4.5 6.5l3.578-.894a1.5 1.5 0 001.028-1.028L10 1z" />
        <path d="M15 11l.447 1.789a.75.75 0 00.514.514L17.75 14l-1.789.447a.75.75 0 00-.514.514L15 16.75l-.447-1.789a.75.75 0 00-.514-.514L12.25 14l1.789-.447a.75.75 0 00.514-.514L15 11z" />
        <path d="M5 14l.298 1.192a.5.5 0 00.343.343L6.833 15.833l-1.192.298a.5.5 0 00-.343.343L5 17.666l-.298-1.192a.5.5 0 00-.343-.343L3.167 15.833l1.192-.298a.5.5 0 00.343-.343L5 14z" />
    </svg>
);

// 📦 Inventory / item registry
export const ArchiveBoxIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M3 7h18v3H3z" />
        <path d="M5 10v9a1 1 0 001 1h12a1 1 0 001-1v-9" />
        <path d="M9.5 13.5h5" />
    </svg>
);

// ⌨️ Keyboard Shortcuts - Keyboard icon (prominent)
export const KeyboardIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H2.75a.75.75 0 01-.75-.75V4.75zm2.25 2a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zm3.25.75a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zm4.25-.75a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zm3.25.75a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zM4.25 9.75A.75.75 0 015 9h.5a.75.75 0 010 1.5H5a.75.75 0 01-.75-.75zm3.25-.75a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zm3.25.75a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zm3.25-.75a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zM6 12.75a.75.75 0 01.75-.75h6.5a.75.75 0 010 1.5h-6.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
    </svg>
);

// ❓ Help - Question mark circle icon
export const HelpIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
);

// 🏠 Home/Hub icon
export const HomeIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
    </svg>
);

// 💾 Save/Export icon  
export const SaveIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M3.5 2A1.5 1.5 0 0 0 2 3.5v13A1.5 1.5 0 0 0 3.5 18h13a1.5 1.5 0 0 0 1.5-1.5v-10.38a1.5 1.5 0 0 0-.44-1.06l-2.12-2.12A1.5 1.5 0 0 0 14.38 2H3.5ZM5 3.5h2v3a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-2.88l2 2V16.5H5V3.5Zm3.5 0h3V6h-3V3.5ZM10 10a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" clipRule="evenodd" />
    </svg>
);

export const GripVerticalIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
    {title && <title>{title}</title>}
    <path fillRule="evenodd" d="M7 3.75a.75.75 0 0 1 .75.75v11a.75.75 0 0 1-1.5 0v-11A.75.75 0 0 1 7 3.75ZM12.25 4.5a.75.75 0 0 0-1.5 0v11a.75.75 0 0 0 1.5 0v-11a.75.75 0 0 0-.75-.75Z" clipRule="evenodd" />
  </svg>
);

export const XMarkIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
    {title && <title>{title}</title>}
    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
  </svg>
);

export const PhotoIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-.48-.48a.75.75 0 0 0-1.06 0l-5.18 5.181ZM15 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd" />
    </svg>
);

export const SpeakerWaveIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M9.25 4.75a.75.75 0 0 0-1.5 0v10.5a.75.75 0 0 0 1.5 0V4.75Z" /><path d="M6.25 6.25a.75.75 0 0 0-1.5 0v7.5a.75.75 0 0 0 1.5 0v-7.5Z" /><path d="M12.25 5.5a.75.75 0 0 0-1.5 0v9a.75.75 0 0 0 1.5 0v-9Z" /><path d="M15.25 6.25a.75.75 0 0 0-1.5 0v7.5a.75.75 0 0 0 1.5 0v-7.5Z" /><path d="M3.25 7a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Z" />
    </svg>
);

export const MusicalNoteIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M7.787 2.203a.75.75 0 0 0-.774 1.056l1.206 2.813A.75.75 0 0 0 9 6.517V14.5a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 9 19.5a2.5 2.5 0 0 0 2.5-2.5V6.517a.75.75 0 0 0-.013-.144l1.206-2.813a.75.75 0 0 0-.774-1.056L10 3.206 7.787 2.203Z" />
    </svg>
);

export const UploadIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M9.25 4.75a.75.75 0 0 1 .75.75v8.34l1.4-1.4a.75.75 0 0 1 1.06 1.06l-2.72 2.72a.75.75 0 0 1-1.06 0l-2.72-2.72a.75.75 0 1 1 1.06-1.06l1.4 1.4V5.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" /><path d="M3.5 8.75a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 0 .75.75h9.5a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 0 1 1.5 0v4.5A2.25 2.25 0 0 1 14.5 17h-9.5A2.25 2.25 0 0 1 2.75 14.5v-4.5a.75.75 0 0 1 .75-.75Z" />
    </svg>
);

export const PencilIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
    </svg>
);

export const FilmIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h13.5A2.25 2.25 0 0019 13.75v-7.5A2.25 2.25 0 0016.75 4H3.25ZM2 9.5h1.25V11H2V9.5ZM2.75 12h.5v1.5h-.5V12Zm1.5 0h.5v1.5h-.5V12ZM5 12h.5v1.5H5V12Zm1.5 0h.5v1.5h-.5V12Zm1.5 0h.5v1.5h-.5V12Zm1.5 0h.5v1.5h-.5V12Zm1.5 0h.5v1.5h-.5V12ZM12 12h.5v1.5h-.5V12Zm1.5 0h.5v1.5h-.5V12Zm1.5 0h.5v1.5h-.5V12Zm1.5 0h.5v1.5h-.5V12ZM2 6.5h1.25V8H2V6.5ZM2.75 5h.5v1.5h-.5V5Zm1.5 0h.5v1.5h-.5V5ZM5 5h.5v1.5H5V5Zm1.5 0h.5v1.5h-.5V5Zm1.5 0h.5v1.5h-.5V5Zm1.5 0h.5v1.5h-.5V5Zm1.5 0h.5v1.5h-.5V5ZM12 5h.5v1.5h-.5V5Zm1.5 0h.5v1.5h-.5V5Zm1.5 0h.5v1.5h-.5V5Zm1.5 0h.5v1.5h-.5V5ZM16.75 9.5H18V11h-1.25V9.5Zm.5 2.5h-.5v1.5h.5V12ZM16.75 5h.5v1.5h-.5V5Z" />
    </svg>
);

export const SparkleIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M10 1a.75.75 0 0 1 .71.51l1.9 5.88 5.88 1.9a.75.75 0 0 1 0 1.42l-5.88 1.9-1.9 5.88a.75.75 0 0 1-1.42 0l-1.9-5.88-5.88-1.9a.75.75 0 0 1 0-1.42l5.88-1.9 1.9-5.88A.75.75 0 0 1 10 1Z" />
    </svg>
);


export const ArrowLeftOnRectangleIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M12.75 3.5a.75.75 0 00-1.5 0v1.5h-1.5a.75.75 0 000 1.5h1.5v4.5h-1.5a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5v-4.5h1.5a.75.75 0 000-1.5h-1.5v-1.5z" clipRule="evenodd" />
        <path fillRule="evenodd" d="M3 6a3 3 0 013-3h1.5a.75.75 0 010 1.5H6A1.5 1.5 0 004.5 6v8A1.5 1.5 0 006 15.5h1.5a.75.75 0 010 1.5H6A3 3 0 013 14V6z" clipRule="evenodd" />
    </svg>
);

export const ArrowDownTrayIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
        <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
);

export const Cog6ToothIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M11.228 1.522a.75.75 0 0 1 .448 1.312l-1.366.455a6.253 6.253 0 0 1 2.222 2.222l.455-1.366a.75.75 0 1 1 1.312.448l-.455 1.366a6.223 6.223 0 0 1 1.706 1.705l1.366-.455a.75.75 0 1 1 .448 1.312l-1.366.455a6.253 6.253 0 0 1 0 4.444l1.366.455a.75.75 0 1 1-.448 1.312l-1.366-.455a6.223 6.223 0 0 1-1.706 1.705l-.455 1.366a.75.75 0 1 1-1.312.448l.455-1.366a6.253 6.253 0 0 1-2.222 2.222l-1.366.455a.75.75 0 1 1-.448-1.312l1.366-.455a6.253 6.253 0 0 1-2.222-2.222l-.455 1.366a.75.75 0 1 1-1.312-.448l.455-1.366a6.223 6.223 0 0 1-1.706-1.705l-1.366.455a.75.75 0 0 1-.448-1.312l1.366-.455a6.253 6.253 0 0 1 0-4.444l-1.366-.455a.75.75 0 0 1 .448-1.312l1.366.455A6.223 6.223 0 0 1 4.5 5.103l.455-1.366a.75.75 0 0 1 1.312-.448l-.455 1.366a6.253 6.253 0 0 1 2.222-2.222l1.366-.455a.75.75 0 0 1 .896 0ZM10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" clipRule="evenodd" />
    </svg>
);

export const BookmarkSquareIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M3.5 2A1.5 1.5 0 0 0 2 3.5v13A1.5 1.5 0 0 0 3.5 18h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-13ZM4 4h12v2.5H4V4Zm0 4h5v8H4V8Zm6.5 0H16v8h-5.5V8Z" clipRule="evenodd" />
    </svg>
);

export const BookOpenIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M10.75 16.82A7.462 7.462 0 0 1 15 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0 0 18 15.06V4.94a.75.75 0 0 0-.546-.722A9.006 9.006 0 0 0 15 3.75a8.963 8.963 0 0 0-4.25 1.065V16.82ZM9.25 4.815A8.963 8.963 0 0 0 5 3.75c-.85 0-1.673.118-2.454.341A.75.75 0 0 0 2 4.866v10.268a.75.75 0 0 0 .954.721A7.506 7.506 0 0 1 5 15.5c1.579 0 3.042.487 4.25 1.32V4.815Z" />
    </svg>
);

export const DuplicateIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M5.5 2A1.5 1.5 0 0 0 4 3.5V12a1.5 1.5 0 0 0 1.5 1.5H7V7a3 3 0 0 1 3-3h4.5V3.5A1.5 1.5 0 0 0 13 2H5.5Z" />
        <path fillRule="evenodd" d="M10 5.5A1.5 1.5 0 0 0 8.5 7v9.5A1.5 1.5 0 0 0 10 18h5.5a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H10Zm3.5 3.25a.75.75 0 0 0-1.5 0V10H10.75a.75.75 0 0 0 0 1.5H12v1.25a.75.75 0 0 0 1.5 0V11.5h1.25a.75.75 0 0 0 0-1.5H13.5V8.75Z" clipRule="evenodd" />
    </svg>
);

export const LockClosedIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
    </svg>
);

export const ChevronDownIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
);

export const ChevronRightIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
);

export const FolderIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z" />
    </svg>
);

export const ArrowUturnLeftIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
    </svg>
);

export const CheckIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
);

export const ArrowUturnRightIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M12.207 2.232a.75.75 0 00.025 1.06l4.146 3.958H6.375a5.375 5.375 0 000 10.75H9.25a.75.75 0 000-1.5H6.375a3.875 3.875 0 010-7.75h10.003l-4.146 3.957a.75.75 0 001.036 1.085l5.5-5.25a.75.75 0 000-1.085l-5.5-5.25a.75.75 0 00-1.06.025z" clipRule="evenodd" />
    </svg>
);

export const GridIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm9-9A2.25 2.25 0 0011 4.25v2.5A2.25 2.25 0 0013.25 9h2.5A2.25 2.25 0 0018 6.75v-2.5A2.25 2.25 0 0015.75 2h-2.5zm0 9A2.25 2.25 0 0011 13.25v2.5A2.25 2.25 0 0013.25 18h2.5A2.25 2.25 0 0018 15.75v-2.5A2.25 2.25 0 0015.75 11h-2.5z" clipRule="evenodd" />
    </svg>
);

export const ListIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM1.99 4.75a1 1 0 011-1H3a1 1 0 011 1v.01a1 1 0 01-1 1h-.01a1 1 0 01-1-1v-.01zM1.99 15.25a1 1 0 011-1H3a1 1 0 011 1v.01a1 1 0 01-1 1h-.01a1 1 0 01-1-1v-.01zM1.99 10a1 1 0 011-1H3a1 1 0 011 1v.01a1 1 0 01-1 1h-.01a1 1 0 01-1-1V10z" clipRule="evenodd" />
    </svg>
);

export const SearchIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
    </svg>
);

export const SwatchIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M2.25 4.125c0-1.036.84-1.875 1.875-1.875h5.25c1.036 0 1.875.84 1.875 1.875V17.25a4.5 4.5 0 11-9 0V4.125zm4.5 14.25a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z" clipRule="evenodd" />
        <path d="M10.719 21.75h9.156c1.036 0 1.875-.84 1.875-1.875v-5.25c0-1.036-.84-1.875-1.875-1.875h-.14l-8.742 8.743c-.09.089-.18.175-.274.257zM12.738 17.625l6.474-6.474a1.875 1.875 0 000-2.651L15.5 4.787a1.875 1.875 0 00-2.651 0l-.1.099V17.25c0 .126-.003.251-.01.375z" />
    </svg>
);

// 🎚️ Adjustments - Horizontal sliders icon (for scene settings)
export const AdjustmentsIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M18.75 12.75h1.5a.75.75 0 000-1.5h-1.5a.75.75 0 000 1.5zM12 6a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 0112 6zM12 18a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 0112 18zM3.75 6.75h1.5a.75.75 0 100-1.5h-1.5a.75.75 0 000 1.5zM5.25 18.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 010 1.5zM3 12a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 013 12zM9 3.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5zM12.75 12a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zM9 15.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
    </svg>
);

// 👁️ Eye icon (for visibility toggles)
export const EyeIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
        <path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd" />
    </svg>
);

// 👁️‍🗨️ Eye slash icon (for hidden state)
export const EyeSlashIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553c-1.182 3.549-4.266 6.28-8.048 7.043l-1.636-1.636a5.25 5.25 0 006.293-6.293l-1.272-1.272a3 3 0 01-4.305 4.305l-1.636-1.636C15.293 13.768 18.976 10.684 22.524 9.447a1.762 1.762 0 01.152 3.106zM15.747 15.747a3 3 0 01-4.494-4.494l4.494 4.494zM1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c1.456 0 2.858.281 4.14.793l-1.47 1.47A5.25 5.25 0 006.75 12c0 .643.116 1.259.328 1.828l-1.963 1.963C3.258 14.536 1.873 13.169 1.323 11.447a1.762 1.762 0 010-1.113z" />
    </svg>
);

// --- Contextual Toolbar Icons ---

// 💬 Speech bubble icon for dialogue
export const ChatBubbleIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M3.43 2.524A41.29 41.29 0 0 1 10 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.202 41.202 0 0 1-5.183.501l-2.792 2.792a.75.75 0 0 1-1.28-.53v-2.37a41.618 41.618 0 0 1-1.885-.277C4.993 13.244 4 11.986 4 10.574V5.426c0-1.413.993-2.67 2.43-2.902Z" clipRule="evenodd" />
    </svg>
);

// 🔀 Branch/Fork icon for choices
export const BranchIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V7a2 2 0 0 0 2 2h1.293l-1.647-1.646a.75.75 0 0 1 1.06-1.061l3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 1 1-1.06-1.06L9.793 10.5H8.5A3.5 3.5 0 0 1 5 7V2.75A.75.75 0 0 1 5.75 2Zm8.5 0a.75.75 0 0 1 .75.75V7a3.5 3.5 0 0 1-3.5 3.5h-1.293l1.647 1.646a.75.75 0 0 1-1.061 1.061l-3-3a.75.75 0 0 1 0-1.06l3-3a.75.75 0 1 1 1.06 1.06L10.207 8.5H11.5a2 2 0 0 0 2-2V2.75a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
    </svg>
);

// 😊 Face/Expression icon for character expressions
export const FaceSmileIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.536-4.464a.75.75 0 1 0-1.061-1.061 3.5 3.5 0 0 1-4.95 0 .75.75 0 0 0-1.06 1.06 5 5 0 0 0 7.07 0ZM9 8.5c0 .828-.448 1.5-1 1.5s-1-.672-1-1.5S7.448 7 8 7s1 .672 1 1.5Zm3 1.5c.552 0 1-.672 1-1.5S12.552 7 12 7s-1 .672-1 1.5.448 1.5 1 1.5Z" clipRule="evenodd" />
    </svg>
);

// 👔 Shirt/outfit icon
export const ShirtIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M7 1L1 5l2 2 1-1v11h12V6l1 1 2-2-6-4h-2a2 2 0 0 1-4 0H7z" />
    </svg>
);

// 🔘 Cursor/click icon for buttons
export const CursorClickIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M6.672 1.911a1 1 0 1 0-1.932.518l.259.966a1 1 0 0 0 1.932-.518l-.26-.966ZM2.429 4.74a1 1 0 1 0-.517 1.932l.966.259a1 1 0 0 0 .517-1.932l-.966-.26Zm8.814-.569a1 1 0 0 0-1.415-1.414l-.707.707a1 1 0 1 0 1.415 1.414l.707-.707Zm-7.071 7.072.707-.707A1 1 0 0 0 3.465 9.12l-.708.707a1 1 0 0 0 1.415 1.415Zm3.2-5.171a1 1 0 0 0-1.3 1.3l4.117 10.293a1 1 0 0 0 1.84.062l1.694-3.791 3.792-1.694a1 1 0 0 0-.062-1.84L7.372 6.072Z" clipRule="evenodd" />
    </svg>
);

// ⚡ Lightning bolt icon for actions
export const BoltIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
    </svg>
);

// 🐛 Bug icon for debugging
export const BugIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M6.56 1.14a.75.75 0 0 1 .177 1.045 3.989 3.989 0 0 0-.464.86c.185.17.382.329.59.473A5.985 5.985 0 0 1 10 3c1.332 0 2.56.433 3.552 1.166.144-.11.28-.227.405-.349a4.01 4.01 0 0 0-.629-1.132.75.75 0 1 1 1.222-.869c.357.502.638 1.058.834 1.652A7.966 7.966 0 0 0 18 3.75a.75.75 0 0 1 0 1.5 6.48 6.48 0 0 1-2.025-.327 5.15 5.15 0 0 1-.317.268A5.978 5.978 0 0 1 16 7.5h1.75a.75.75 0 0 1 0 1.5H16v.25c0 .907-.2 1.767-.558 2.54l1.616.927a.75.75 0 1 1-.749 1.3l-1.598-.918A5.988 5.988 0 0 1 10 16a5.988 5.988 0 0 1-4.71-2.9l-1.6.918a.75.75 0 1 1-.75-1.3l1.617-.929A5.972 5.972 0 0 1 4 9.25V9H2.25a.75.75 0 0 1 0-1.5H4A5.978 5.978 0 0 1 4.343 5.39a5.15 5.15 0 0 1-.318-.267A6.48 6.48 0 0 1 2 5.25a.75.75 0 0 1 0-1.5c.965 0 1.89.21 2.717.587.196-.594.477-1.15.834-1.652a.75.75 0 0 1 1.045-.177Zm4.192 6.357a.75.75 0 0 1-.247 1.032L10 8.834v3.916a.75.75 0 0 1-1.5 0V8.834l-.505-.305a.75.75 0 0 1 .785-1.28l.97.585.97-.585a.75.75 0 0 1 1.032.248Z" clipRule="evenodd" />
    </svg>
);

// ⭐ Star icon for favorites
export const StarIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd" />
    </svg>
);

// 💡 Lightbulb icon for suggestions/tips
export const LightBulbIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 1ZM5.05 3.05a.75.75 0 0 1 1.06 0l1.062 1.06a.75.75 0 1 1-1.061 1.061l-1.06-1.06a.75.75 0 0 1 0-1.06ZM14.95 3.05a.75.75 0 0 1 0 1.061l-1.06 1.06a.75.75 0 1 1-1.062-1.06l1.061-1.06a.75.75 0 0 1 1.06 0ZM3 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 3 8ZM14 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 14 8ZM7.253 14.734a.75.75 0 0 1 .514-.919A4.992 4.992 0 0 0 10 9a4.992 4.992 0 0 0 2.233 4.815.75.75 0 1 1-.405 1.434A6.492 6.492 0 0 1 8.172 15.248a.75.75 0 0 1-.919-.514ZM10 18a2 2 0 0 0 2-2H8a2 2 0 0 0 2 2Z" />
    </svg>
);

// ↕ Sort/reorder icon
export const ArrowsUpDownIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M2.24 6.8a.75.75 0 0 0 1.06-.04l1.95-2.1v8.59a.75.75 0 0 0 1.5 0V4.66l1.95 2.1a.75.75 0 1 0 1.1-1.02l-3.25-3.5a.75.75 0 0 0-1.1 0L2.2 5.74a.75.75 0 0 0 .04 1.06Zm8.6 9.4a.75.75 0 0 1 1.06.04l1.95 2.1V9.75a.75.75 0 0 1 1.5 0v8.59l1.95-2.1a.75.75 0 1 1 1.1 1.02l-3.25 3.5a.75.75 0 0 1-1.1 0l-3.25-3.5a.75.75 0 0 1 .04-1.06Z" clipRule="evenodd" />
    </svg>
);

// 📝 Document/text icon
export const DocumentTextIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
    </svg>
);

// ◀ Arrow left (back/previous)
export const ArrowLeftIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 0 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
    </svg>
);

// ▶ Arrow right (forward/next)
export const ArrowRightIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638l-4.158-3.96a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
    </svg>
);

// ❓ Question mark circle (for conditions/help)
export const QuestionMarkIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
);

// ▲ Chevron up (for reorder up / collapse)
export const ChevronUpIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M9.47 6.47a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06l4.25-4.25Z" clipRule="evenodd" />
    </svg>
);

// 🌐 Globe (for localization / web)
export const GlobeIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M16.555 5.412a8.028 8.028 0 0 0-3.503-2.81 14.9 14.9 0 0 1 1.663 4.472 8.547 8.547 0 0 0 1.84-1.662ZM13.326 7.825a13.43 13.43 0 0 0-2.413-5.773 8.087 8.087 0 0 0-1.826 0 13.43 13.43 0 0 0-2.413 5.773A8.473 8.473 0 0 0 10 8.5c1.18 0 2.304-.238 3.326-.675ZM14.006 9a8.522 8.522 0 0 1-4.006.998 8.522 8.522 0 0 1-4.006-.998 13.43 13.43 0 0 0 .172 5.031c.044.174.094.347.149.518A8.48 8.48 0 0 1 10 12.5a8.48 8.48 0 0 1 3.685 2.049 12.7 12.7 0 0 0 .149-.518A13.43 13.43 0 0 0 14.006 9ZM12.16 15.658a8.466 8.466 0 0 0-4.32 0 13.43 13.43 0 0 0 2.16 3.29 13.43 13.43 0 0 0 2.16-3.29ZM6.948 2.601A8.028 8.028 0 0 0 3.445 5.412 8.547 8.547 0 0 0 5.285 7.074 14.9 14.9 0 0 1 6.948 2.6ZM2.56 7.235a7.966 7.966 0 0 0-.41 2.765c0 1.816.607 3.49 1.627 4.83.08-.103.164-.204.251-.303a9.96 9.96 0 0 1 2.76-2.386A14.94 14.94 0 0 1 6.67 7.689 10.046 10.046 0 0 1 2.56 7.236ZM17.44 7.235a10.046 10.046 0 0 1-4.11.454 14.94 14.94 0 0 1-.118 4.452 9.96 9.96 0 0 1 2.76 2.386c.088.1.172.2.252.303A7.966 7.966 0 0 0 17.44 7.236Z" />
    </svg>
);

// 🧩 Puzzle piece (for plugins)
export const PuzzlePieceIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M12 4.467c0-.405.262-.75.559-1.027.276-.257.441-.584.441-.94 0-.828-.895-1.5-2-1.5s-2 .672-2 1.5c0 .362.171.694.456.953.29.265.544.6.544.994a.968.968 0 0 1-1.024.974 39.655 39.655 0 0 1-3.014-.155.75.75 0 0 0-.838.75v1.558c0 .405.262.75.56 1.027.276.257.44.584.44.94 0 .828-.895 1.5-2 1.5s-2-.672-2-1.5c0-.362.171-.694.456-.953.29-.265.544-.6.544-.994a.968.968 0 0 0-1.024-.974A39.655 39.655 0 0 0 .124 7.574.75.75 0 0 0-.714 8.324v5.501a2.25 2.25 0 0 0 2.25 2.25h5.5a.75.75 0 0 0 .75-.874c-.044-.416-.086-.832-.124-1.25a.97.97 0 0 1 .974-1.025c.395 0 .73.262.994.544.259.285.591.456.953.456.828 0 1.5-.895 1.5-2s-.672-2-1.5-2c-.356 0-.688.165-.953.44-.265.29-.6.544-.994.544a.97.97 0 0 1-.974-1.024 39.649 39.649 0 0 1 .155-3.014.75.75 0 0 0-.75-.838H2.286a2.25 2.25 0 0 1-2.25-2.25v-.036c.42.03.84.054 1.262.071a.97.97 0 0 0 1.024-.974Z" transform="translate(4 1)" />
    </svg>
);

// 🎮 Gamepad (for build/game)
export const GamepadIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M15 7.5V2H9v5.5l3 3 3-3ZM7.5 9H2v6h5.5l3-3-3-3ZM9 16.5V22h6v-5.5l-3-3-3 3ZM16.5 9l-3 3 3 3H22V9h-5.5Z" />
    </svg>
);

// 🔁 Common Events icon (arrows in loop — represents reusable command blocks)
export const CommonEventsIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903H14.25a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 .75-.75v-6a.75.75 0 0 0-1.5 0v3.068l-1.658-1.658A9 9 0 0 0 3.341 9.497a.75.75 0 1 0 1.414.562Zm14.49 3.882a7.5 7.5 0 0 1-12.548 3.364l-1.903-1.903H9.75a.75.75 0 0 0 0-1.5h-6a.75.75 0 0 0-.75.75v6a.75.75 0 0 0 1.5 0v-3.068l1.658 1.658A9 9 0 0 0 20.659 14.503a.75.75 0 1 0-1.414-.562Z" clipRule="evenodd" />
    </svg>
);

// 📋 Scripting / JSON Editor icon (code brackets)
export const CodeBracketIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M14.447 3.027a.75.75 0 0 1 .527.92l-4.5 16.5a.75.75 0 0 1-1.448-.394l4.5-16.5a.75.75 0 0 1 .921-.526ZM16.72 6.22a.75.75 0 0 1 1.06 0l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06L21.44 12l-4.72-4.72a.75.75 0 0 1 0-1.06Zm-9.44 0a.75.75 0 0 1 0 1.06L2.56 12l4.72 4.72a.75.75 0 0 1-1.06 1.06L.97 12.53a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
    </svg>
);
