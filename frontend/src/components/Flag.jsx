// Bandeiras em SVG (emoji de bandeira não renderiza no Windows/Chrome).
// Simplificadas, mas reconhecíveis, no aspecto 4:3.

const FLAGS = {
  // Brasil (pt)
  pt: (
    <svg viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg" aria-label="Português">
      <rect width="28" height="20" fill="#009b3a" />
      <path d="M14 2 26 10 14 18 2 10Z" fill="#fedf00" />
      <circle cx="14" cy="10" r="4" fill="#002776" />
      <path d="M10.4 9.2a7 7 0 0 1 7.2.9" stroke="#fff" strokeWidth="0.9" fill="none" />
    </svg>
  ),
  // Estados Unidos (en)
  en: (
    <svg viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg" aria-label="English">
      <rect width="28" height="20" fill="#b22234" />
      <g fill="#fff">
        <rect y="1.54" width="28" height="1.54" />
        <rect y="4.62" width="28" height="1.54" />
        <rect y="7.69" width="28" height="1.54" />
        <rect y="10.77" width="28" height="1.54" />
        <rect y="13.85" width="28" height="1.54" />
        <rect y="16.92" width="28" height="1.54" />
      </g>
      <rect width="12" height="10.77" fill="#3c3b6e" />
    </svg>
  ),
  // Espanha (es)
  es: (
    <svg viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg" aria-label="Español">
      <rect width="28" height="20" fill="#c60b1e" />
      <rect y="5" width="28" height="10" fill="#ffc400" />
    </svg>
  ),
  // França (fr)
  fr: (
    <svg viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg" aria-label="Français">
      <rect width="28" height="20" fill="#fff" />
      <rect width="9.33" height="20" fill="#0055a4" />
      <rect x="18.67" width="9.33" height="20" fill="#ef4135" />
    </svg>
  ),
  // Rússia (ru)
  ru: (
    <svg viewBox="0 0 28 20" xmlns="http://www.w3.org/2000/svg" aria-label="Русский">
      <rect width="28" height="20" fill="#fff" />
      <rect y="6.67" width="28" height="6.67" fill="#0039a6" />
      <rect y="13.33" width="28" height="6.67" fill="#d52b1e" />
    </svg>
  ),
};

export default function Flag({ code, className = "w-5 h-auto" }) {
  const svg = FLAGS[code] || FLAGS.pt;
  return (
    <span className={`inline-block overflow-hidden rounded-[3px] ring-1 ring-black/10 ${className}`}>
      {svg}
    </span>
  );
}
