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
        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .53 1.405c.76-.236 1.54-.387 2.335-.45v10.587c0 .69.56 1.25 1.25 1.25h2.5c.69 0 1.25-.56 1.25-1.25V5.217c.795.062 1.575.214 2.335.45a.75.75 0 0 0 .53-1.405c-.785-.248-1.57-.391-2.365-.468V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4.25a.75.75 0 0 0-1.5 0v10.5a.75.75 0 0 0 1.5 0V4.25Z" clipRule="evenodd" />
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
        <path d="M3.196 12.87l-.825.483a.75.75 0 000 1.294l7.25 4.25a.75.75 0 00.758 0l7.25-4.25a.75.75 0 000-1.294l-.825-.484-5.666 3.322a2.25 2.25 0 01-2.276 0L3.196 12.87z" />
        <path d="M3.196 8.87l-.825.483a.75.75 0 000 1.294l7.25 4.25a.75.75 0 00.758 0l7.25-4.25a.75.75 0 000-1.294l-.825-.484-5.666 3.322a2.25 2.25 0 01-2.276 0L3.196 8.87z" />
        <path d="M10.38 1.103a.75.75 0 00-.76 0l-7.25 4.25a.75.75 0 000 1.294l7.25 4.25a.75.75 0 00.76 0l7.25-4.25a.75.75 0 000-1.294l-7.25-4.25z" />
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
        <path fillRule="evenodd" d="M10 2.5a.75.75 0 0 1 .75.75V6h2.75a.75.75 0 0 1 0 1.5H10.75V10h2.75a.75.75 0 0 1 0 1.5H10.75v2.75a.75.75 0 0 1-1.5 0V11.5H6.5a.75.75 0 0 1 0-1.5H9.25V7.5H6.5a.75.75 0 0 1 0-1.5H9.25V3.25A.75.75 0 0 1 10 2.5ZM3.5 6.5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm9 5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
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
        <path fillRule="evenodd" d="M10 2c-1.717 0-3.282.52-4.632 1.398a.75.75 0 0 0-.253 1.037l.286.42a.75.75 0 0 0 1.037-.253A2.993 2.993 0 0 1 10 3.5c.74 0 1.424.276 1.956.744a.75.75 0 0 0 1.037.253l.286-.42a.75.75 0 0 0-.253-1.037A4.478 4.478 0 0 0 10 2ZM3.25 5A2.25 2.25 0 0 0 1 7.25v7.5A2.25 2.25 0 0 0 3.25 17h13.5A2.25 2.25 0 0 0 19 14.75v-7.5A2.25 2.25 0 0 0 16.75 5H3.25Z" clipRule="evenodd" />
    </svg>
);

export const BookOpenIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Z" clipRule="evenodd" /><path d="M1.172 6.172a.75.75 0 0 1 .988-.07l1.838 1.225A.75.75 0 0 1 4 8.25c0 .202.08.39.222.528l8.352 8.352a3.75 3.75 0 0 1-5.303 0L1.172 10.828a3.75 3.75 0 0 1 0-5.304Zm16.656 2.078a.75.75 0 0 1 0 1.06l-2.222 2.223a.75.75 0 0 1-1.06-1.06l2.222-2.223a.75.75 0 0 1 1.06 0Zm-3.28 3.281a.75.75 0 0 1 0 1.06l-3.33 3.331a.75.75 0 1 1-1.06-1.06l3.33-3.331a.75.75 0 0 1 1.06 0Zm-3.53-2.47a.75.75 0 0 1 0 1.06l-1.047 1.047a.75.75 0 1 1-1.06-1.06L11 8.99a.75.75 0 0 1 1.06 0Z" />
    </svg>
);

export const DuplicateIcon = ({ className, title, ...props }: React.SVGProps<SVGSVGElement> & { title?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 ${className || ''}`} {...props}>
        {title && <title>{title}</title>}
        <path d="M3.25 3A2.25 2.25 0 0 0 1 5.25v9.5A2.25 2.25 0 0 0 3.25 17h9.5A2.25 2.25 0 0 0 15 14.75v-9.5A2.25 2.25 0 0 0 12.75 3h-9.5Z" />
        <path d="M19 5.25a2.25 2.25 0 0 0-2.25-2.25H7.875a.75.75 0 0 0 0 1.5h8.875a.75.75 0 0 1 .75.75v8.875a.75.75 0 0 0 1.5 0v-8.875Z" />
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
