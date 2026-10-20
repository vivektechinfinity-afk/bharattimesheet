import { useState } from 'react';

/**
 * Bharat Enterprises "EB" monogram.
 *
 * Renders /logo.png when that file exists in frontend/public (drop the real brand
 * asset there for a pixel-exact mark). Falls back to an inline SVG recreation —
 * gradient E+B letterforms over a dark offset shadow — so the app always has a logo.
 */
export default function Logo({ size = 40, className = '' }) {
  const [useFallback, setUseFallback] = useState(false);
  const id = `eb${size}`;

  if (!useFallback) {
    return (
      <img
        src="/logo.png"
        width={size}
        height={size}
        alt="Bharat Enterprises"
        className={`object-contain ${className}`}
        onError={() => setUseFallback(true)}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Bharat Enterprises"
    >
      <defs>
        <linearGradient id={`${id}e`} x1="6" y1="54" x2="34" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2F7FD4" />
          <stop offset="50%" stopColor="#4FC9A0" />
          <stop offset="100%" stopColor="#8DD94A" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="28" y1="10" x2="58" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5AC6B0" />
          <stop offset="45%" stopColor="#A8D948" />
          <stop offset="100%" stopColor="#F2B733" />
        </linearGradient>
      </defs>

      {/* Dark offset shadow behind the B — the depth cue in the brand mark */}
      <g fill="#16304A" opacity="0.92" transform="translate(2.5, 2.5)">
        <rect x="30" y="9" width="10" height="46" rx="2" />
        <path d="M38 9h8a11.5 11.5 0 0 1 0 23h-8V9Z" />
        <path d="M38 32h9a11.5 11.5 0 0 1 0 23h-9V32Z" />
      </g>

      {/* E */}
      <g fill={`url(#${id}e)`}>
        <rect x="5" y="9" width="10" height="46" rx="2" />
        <rect x="5" y="9" width="27" height="10" rx="2" />
        <rect x="5" y="27" width="22" height="10" rx="2" />
        <rect x="5" y="45" width="27" height="10" rx="2" />
      </g>

      {/* B */}
      <g fill={`url(#${id}b)`}>
        <rect x="30" y="9" width="10" height="46" rx="2" />
        <path d="M38 9h8a11.5 11.5 0 0 1 0 23h-8v-9.5h7a2.5 2.5 0 0 0 0-4h-7V9Z" />
        <path d="M38 32h9a11.5 11.5 0 0 1 0 23h-9v-9.5h8a2.5 2.5 0 0 0 0-4h-8V32Z" />
      </g>
    </svg>
  );
}
