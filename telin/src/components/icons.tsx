import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  style: { flexShrink: 0, display: "inline-block" },
};

export const LockIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const FlameIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.3 2.4-5.3 3.6-7.9.4 1.8 1.4 3 2.6 3.6C11.6 7.6 13 4.8 15.4 3c-.3 2.6.8 4.5 2 6.2 1 1.4 1.6 3 1.6 5C19 18.2 16 21 12 21Z" />
    <path d="M12 21c-1.7 0-2.9-1.2-2.9-2.8 0-1.8 1.6-2.7 2.3-4.3.9 1 2.1 1.7 2.8 2.9.4.6.6 1.1.6 1.6 0 1.5-1.3 2.6-2.8 2.6Z" />
  </svg>
);

export const AlertIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

export const CopyIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
  </svg>
);

export const CheckIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const ShareIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <path d="M12 3.5v12" />
    <path d="m7.5 8 4.5-4.5L16.5 8" />
    <path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);

export const ChatIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <path d="M4.2 19.8 5.4 16A8 8 0 1 1 8 18.6l-3.8 1.2Z" />
    <path d="M9.3 9.2c.2 2.6 2.9 5.3 5.5 5.5l1-1.3-1.8-1-1 .7a4 4 0 0 1-2-2l.7-1-1-1.8-1.4.9Z" />
  </svg>
);

export const SendIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <path d="M21 3.5 2.8 10.7l6.9 2.6L21 3.5Z" />
    <path d="m9.7 13.3 2.6 6.9L21 3.5" />
  </svg>
);

export const MailIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
  </svg>
);

export const ArrowIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export const DiceIcon = ({ className = "", style, ...p }: P) => (
  <svg {...base} className={className} style={{ ...base.style, ...style }} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
  </svg>
);
