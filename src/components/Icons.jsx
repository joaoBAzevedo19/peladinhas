// Inline SVG icons (stroke-based, inherit currentColor).
const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const CalendarIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </svg>
);

export const HistoryIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
    <path d="M3 3.5V8h4.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const TableIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M8 21h8M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4" />
  </svg>
);

export const SettingsIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const LogoutIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M9.5 20.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h4.5" />
    <path d="M16 16.5 20.5 12 16 7.5M20.5 12H9.5" />
  </svg>
);

export const ChevronRight = (props) => (
  <svg {...base} width={18} height={18} {...props}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const BackIcon = (props) => (
  <svg {...base} width={20} height={20} {...props}>
    <path d="M15 6 9 12l6 6" />
  </svg>
);

export const CheckIcon = (props) => (
  <svg {...base} width={16} height={16} strokeWidth={3} {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const PlusIcon = (props) => (
  <svg {...base} width={18} height={18} strokeWidth={2.5} {...props}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = (props) => (
  <svg {...base} width={18} height={18} strokeWidth={2.5} {...props}>
    <path d="M5 12h14" />
  </svg>
);

export const BallIcon = (props) => (
  <svg {...base} width={14} height={14} strokeWidth={1.8} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m12 7.5 4 2.9-1.5 4.7h-5L8 10.4 12 7.5Z" />
    <path d="M12 3v4.5M21 10l-5 .4M17.5 19.5l-3-4.4M6.5 19.5l3-4.4M3 10l5 .4" />
  </svg>
);

export const ShuffleIcon = (props) => (
  <svg {...base} width={18} height={18} {...props}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
);

export const AlertIcon = (props) => (
  <svg {...base} width={18} height={18} {...props}>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </svg>
);
