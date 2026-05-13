interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size = 18 }: BrandMarkProps) {
  const w = size;
  const h = (size * 58) / 67;
  return (
    <svg width={w} height={h} viewBox="0 0 67 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle opacity="0.64" cx="47" cy="29" r="20" fill="url(#rs_glow)"/>
      <rect y="20"  width="3" height="18" rx="1.5" fill="#B40719"/>
      <rect x="8"  y="14" width="3" height="30" rx="1.5" fill="#B40719"/>
      <rect x="16" y="10" width="3" height="38" rx="1.5" fill="#B40719"/>
      <rect x="24" y="7"  width="3" height="44" rx="1.5" fill="#CA1D26"/>
      <rect x="32" y="5"  width="3" height="48" rx="1.5" fill="#CA1D26"/>
      <rect x="40" y="6"  width="3" height="46" rx="1.5" fill="#CA1D26"/>
      <rect x="48" y="8"  width="3" height="42" rx="1.5" fill="#EB434A"/>
      <rect x="56" y="10" width="3" height="38" rx="1.5" fill="#EB434A"/>
      <rect x="64" y="13" width="3" height="32" rx="1.5" fill="#EB434A"/>
      <defs>
        <radialGradient id="rs_glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(47 29) rotate(90) scale(20)">
          <stop stopColor="#EB4343"/>
          <stop offset="1" stopColor="#EB4343" stopOpacity="0"/>
        </radialGradient>
      </defs>
    </svg>
  );
}
