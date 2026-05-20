interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
}

export function Icon({ name, size = 20, stroke = 1.5 }: IconProps) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor',
    strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'stack': return (
      <svg {...props}>
        <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z"/>
        <path d="m3 12 9 4.5 9-4.5"/>
        <path d="m3 16.5 9 4.5 9-4.5"/>
      </svg>
    );
    case 'star-tracker': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>
        <path d="m7.2 7.2 6 6"/>
        <circle cx="14" cy="14" r="1.6"/>
        <circle cx="8.5" cy="8.5" r="0.6" fill="currentColor"/>
      </svg>
    );
    case 'telescope': return (
      <svg {...props}>
        <path d="m4 14 11-4 1.5 4-11 4Z"/>
        <path d="m14.5 10.4 3.5-1.3 1.5 4-3.5 1.3"/>
        <path d="M8 18v3M12 17v4"/>
        <path d="M5.5 17.5h9"/>
      </svg>
    );
    case 'dark-frame': return (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="14" rx="1.5"/>
        <path d="M3 9h18"/>
        <circle cx="8" cy="14" r="2"/>
        <path d="M14 13h4M14 16h3"/>
      </svg>
    );
    case 'calendar': return (
      // Calendar grid: outer rounded body, header rule under the top edge,
      // and two short binder ticks above for the day-picker affordance.
      <svg {...props}>
        <rect x="3" y="5" width="18" height="16" rx="1.5"/>
        <path d="M3 10h18"/>
        <path d="M8 3v3M16 3v3"/>
      </svg>
    );
    case 'cursor': return (
      <svg {...props}><path d="M5 3v15l4-3 2.5 5 2.5-1-2.5-5h6L5 3Z"/></svg>
    );
    case 'crop': return (
      <svg {...props}><path d="M7 2v15a1 1 0 0 0 1 1h14"/><path d="M2 7h15a1 1 0 0 1 1 1v14"/></svg>
    );
    case 'align': return (
      <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>
    );
    case 'wand': return (
      <svg {...props}><path d="M5 19 19 5"/><path d="M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/><path d="M5 11l.5 1 1 .5-1 .5L5 14l-.5-1-1-.5 1-.5L5 11Z"/></svg>
    );
    case 'levels': return (
      <svg {...props}><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="1.6" fill="currentColor"/><circle cx="15" cy="12" r="1.6" fill="currentColor"/><circle cx="7" cy="18" r="1.6" fill="currentColor"/></svg>
    );
    case 'curves': return (
      <svg {...props}><rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 21C9 21 9 3 21 3"/></svg>
    );
    case 'noise': return (
      <svg {...props}><circle cx="6" cy="7" r=".7" fill="currentColor"/><circle cx="13" cy="5" r=".7" fill="currentColor"/><circle cx="18" cy="9" r=".7" fill="currentColor"/><circle cx="9" cy="13" r=".7" fill="currentColor"/><circle cx="16" cy="16" r=".7" fill="currentColor"/><circle cx="7" cy="18" r=".7" fill="currentColor"/><circle cx="20" cy="18" r=".7" fill="currentColor"/><circle cx="4" cy="13" r=".7" fill="currentColor"/></svg>
    );
    case 'export': return (
      <svg {...props}><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
    );
    case 'settings': return (
      <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c0-.4.1-.8.1-1.2Z"/></svg>
    );
    case 'help': return (
      <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7v.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>
    );
    case 'arrow-right': return (
      <svg {...props}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
    );
    case 'arrow-left': return (
      <svg {...props}><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>
    );
    case 'sun': return (
      <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>
    );
    case 'moon': return (
      <svg {...props}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>
    );
    case 'eye': return (
      <svg {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>
    );
    case 'eye-off': return (
      <svg {...props}><path d="M2 12s3.5-7 10-7c2.4 0 4.4.9 6 2"/><path d="M22 12s-3.5 7-10 7c-2.4 0-4.4-.9-6-2"/><path d="m3 3 18 18"/></svg>
    );
    case 'plus': return (
      <svg {...props}><path d="M12 5v14M5 12h14"/></svg>
    );
    case 'play': return (
      <svg {...props}><path d="m6 4 14 8-14 8V4Z"/></svg>
    );
    case 'check': return (
      <svg {...props}><path d="m4 12 5 5L20 6"/></svg>
    );
    case 'compass': return (
      <svg {...props}><circle cx="12" cy="12" r="9"/><path d="m9 15 2-6 6-2-2 6-6 2Z"/></svg>
    );
    case 'bell': return (
      <svg {...props}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    );
    case 'x': return (
      <svg {...props}><path d="M18 6 6 18M6 6l12 12"/></svg>
    );
    case 'search': return (
      <svg {...props}>
        <circle cx="10.5" cy="10.5" r="6.5"/>
        <path d="m20 20-4.8-4.8"/>
      </svg>
    );
    case 'star': return (
      <svg {...props}>
        <path
          d="M8 1.4 L9.78 5.98 L14.7 6.34 L10.92 9.5 L12.13 14.3 L8 11.7 L3.87 14.3 L5.08 9.5 L1.3 6.34 L6.22 5.98 Z"
          transform="translate(4 4) scale(1)"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    );
    case 'layer-sun': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>
      </svg>
    );
    case 'layer-moon': return (
      <svg {...props}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>
      </svg>
    );
    case 'map-pin': return (
      <svg {...props}><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/></svg>
    );
    case 'x-circle': return (
      <svg {...props}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
    );
    case 'alert': return (
      <svg {...props}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>
    );
    case 'cloud-off': return (
      <svg {...props}><path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3M1 1l22 22"/></svg>
    );
    case 'info': return (
      <svg {...props}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
    );
    case 'sparkle': return (
      <svg {...props}><path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2 2-8Z"/></svg>
    );
    case 'constellation': return (
      <svg {...props}>
        <path d="M4.5 6.5 L9.5 4.5 L14.5 8 L18.5 5.5 M14.5 8 L16.5 14 L8 17.5 M16.5 14 L19.5 19"/>
        <circle cx="4.5" cy="6.5" r="1" fill="currentColor"/>
        <circle cx="9.5" cy="4.5" r="1" fill="currentColor"/>
        <circle cx="14.5" cy="8" r="1.25" fill="currentColor"/>
        <circle cx="18.5" cy="5.5" r="1" fill="currentColor"/>
        <circle cx="16.5" cy="14" r="1" fill="currentColor"/>
        <circle cx="8" cy="17.5" r="1" fill="currentColor"/>
        <circle cx="19.5" cy="19" r="1" fill="currentColor"/>
      </svg>
    );
    case 'galaxy': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
        <path d="M12 5.2 C 16.6 5.2 19 8.4 19 12"/>
        <path d="M19 12 C 19 14.7 17.2 16.5 14.8 16.5 C 13.1 16.5 12 15.4 12 14"/>
        <path d="M12 18.8 C 7.4 18.8 5 15.6 5 12"/>
        <path d="M5 12 C 5 9.3 6.8 7.5 9.2 7.5 C 10.9 7.5 12 8.6 12 10"/>
      </svg>
    );
    case 'sky-viewer': return (
      // Crescent moon (arc) on the left with two stars to the upper-right —
      // a compact "night sky" mark for the Sky Viewer feature card.
      <svg {...props}>
        <path d="M15.5 13.5 A 6.5 6.5 0 1 1 10.5 5"/>
        <path d="M18 4l.6 1.4L20 6l-1.4.6L18 8l-.6-1.4L16 6l1.4-.6L18 4Z"/>
        <circle cx="20.5" cy="11" r="0.6" fill="currentColor"/>
      </svg>
    );
    case 'globe-grid': return (
      // Globe with crossing latitude/longitude arcs — a sphere viewed face-on.
      <svg {...props}>
        <circle cx="12" cy="12" r="9"/>
        <path d="M3 12h18"/>
        <path d="M12 3a13 13 0 0 1 0 18"/>
        <path d="M12 3a13 13 0 0 0 0 18"/>
      </svg>
    );
    case 'reset': return (
      // Circular counter-clockwise arrow returning to start — the standard
      // "reset / recenter" glyph. Arc sweeps ~3/4 of a circle with an arrowhead
      // pointing back toward the starting position at the top.
      <svg {...props}>
        <path d="M20 12a8 8 0 1 1-2.34-5.66"/>
        <path d="M20 4v4h-4"/>
      </svg>
    );
    case 'chevron-up': return (
      <svg {...props}>
        <polyline points="6 15 12 9 18 15"/>
      </svg>
    );
    case 'chevron-down': return (
      <svg {...props}>
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    );

    /* ─── Sky Viewer 2 — layer toggles (ported from temp/icons.jsx) ─── */
    case 'layer-labels': return (
      <svg {...props}>
        <path d="M11 3H6a3 3 0 0 0-3 3v5a2 2 0 0 0 .58 1.4l7.5 7.5a2 2 0 0 0 2.84 0l5.08-5.08a2 2 0 0 0 0-2.84l-7.5-7.5A2 2 0 0 0 11 3Z"/>
        <circle cx="8" cy="8" r="1.4"/>
      </svg>
    );
    case 'layer-grid': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="8.5"/>
        <ellipse cx="12" cy="12" rx="8.5" ry="3.2"/>
        <path d="M12 3.5v17"/>
      </svg>
    );
    case 'layer-horizon': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="8.5"/>
        <path d="M3.5 12h17" strokeDasharray="2.4 2"/>
        <path d="M16 7v1.4M15.3 7.7h1.4" strokeWidth={stroke * 0.9}/>
        <circle cx="16" cy="7.7" r=".6" fill="currentColor" stroke="none"/>
      </svg>
    );
    case 'layer-ground': return (
      <svg {...props}>
        <path d="M3 18h18"/>
        <path d="M3 18l4.5-5.5L10 15l3.5-7L17 14l4-3.2"/>
        <path d="M5 21h14" strokeDasharray="2 2" strokeWidth={stroke * 0.8}/>
      </svg>
    );
    case 'layer-galaxies': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
        <path d="M12 4.5c4.4 0 7.5 3.1 7.5 7.5"/>
        <path d="M12 19.5c-4.4 0-7.5-3.1-7.5-7.5"/>
        <path d="M16.6 8.3c-2.1-1.7-5.3-1.4-7.6.9"/>
        <path d="M7.4 15.7c2.1 1.7 5.3 1.4 7.6-.9"/>
      </svg>
    );
    case 'layer-stars': return (
      <svg {...props}>
        <path d="m13 3.5 1.92 4.32L19.5 8.4l-3.4 3.16.94 4.6L13 13.86l-4.04 2.3.94-4.6L6.5 8.4l4.58-.58L13 3.5Z"/>
        <path d="m5.7 16.5.66 1.45 1.54.18-1.14 1.06.32 1.55L5.7 20l-1.38.74.32-1.55L3.5 18.13l1.54-.18L5.7 16.5Z" strokeWidth={stroke * 0.9}/>
      </svg>
    );
    case 'layer-constellations': return (
      <svg {...props}>
        <path d="M5.5 6.5 L10.5 4.5 L15.5 8 L19.5 5.5 M15.5 8 L17.5 14 L9 17.5"/>
        <circle cx="5.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/>
        <circle cx="10.5" cy="4.5" r="1.1" fill="currentColor" stroke="none"/>
        <circle cx="15.5" cy="8" r="1.3" fill="currentColor" stroke="none"/>
        <circle cx="19.5" cy="5.5" r="1.1" fill="currentColor" stroke="none"/>
        <circle cx="17.5" cy="14" r="1.1" fill="currentColor" stroke="none"/>
        <circle cx="9" cy="17.5" r="1.1" fill="currentColor" stroke="none"/>
      </svg>
    );

    /* ─── Projection family ─── */
    case 'projection-rectilinear': return (
      <svg {...props}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/>
        <path d="M12 3.5v17M3.5 12h17"/>
      </svg>
    );
    case 'projection-fisheye': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="8.5"/>
        <path d="M12 3.5v17"/>
        <path d="m4.64 7.75 14.72 8.5"/>
        <path d="m4.64 16.25 14.72-8.5"/>
      </svg>
    );
    case 'projection-stereographic': return (
      <svg {...props}>
        <circle cx="12" cy="12" r="8.5"/>
        <path d="M6.2 8.3a10 10 0 0 1 11.6 0"/>
        <path d="M7.2 12a8 8 0 0 1 9.6 0"/>
        <path d="M8.4 15.4a6 6 0 0 1 7.2 0"/>
      </svg>
    );

    /* ─── Star-density family ─── */
    case 'star-density-full': return (
      <svg {...props}>
        <path d="M12 5v14M5 12h14" strokeWidth={stroke * 0.9}/>
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>
        <circle cx="5"  cy="6"  r="0.9" fill="currentColor" stroke="none"/>
        <circle cx="19" cy="6"  r="0.9" fill="currentColor" stroke="none"/>
        <circle cx="5"  cy="18" r="0.9" fill="currentColor" stroke="none"/>
        <circle cx="19" cy="18" r="0.9" fill="currentColor" stroke="none"/>
      </svg>
    );
    case 'star-density-balanced': return (
      <svg {...props}>
        <path d="M12 5v14M5 12h14" strokeWidth={stroke * 0.9}/>
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>
        <circle cx="5"  cy="6"  r="0.9" fill="currentColor" stroke="none"/>
        <circle cx="19" cy="18" r="0.9" fill="currentColor" stroke="none"/>
      </svg>
    );
    case 'star-density-performance': return (
      <svg {...props}>
        <path d="M12 5v14M5 12h14" strokeWidth={stroke * 0.9}/>
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>
      </svg>
    );

    /* ─── Galaxy-density family ─── */
    case 'galaxy-density-full': return (
      <svg {...props}>
        <g transform="translate(7 7) rotate(-20)">
          <ellipse cx="0" cy="0" rx="4" ry="1.6"/>
          <circle cx="0" cy="0" r="0.7" fill="currentColor" stroke="none"/>
        </g>
        <g transform="translate(17 10) rotate(35)">
          <ellipse cx="0" cy="0" rx="3.4" ry="1.3"/>
          <circle cx="0" cy="0" r="0.6" fill="currentColor" stroke="none"/>
        </g>
        <g transform="translate(10 17) rotate(10)">
          <ellipse cx="0" cy="0" rx="3.6" ry="1.4"/>
          <circle cx="0" cy="0" r="0.6" fill="currentColor" stroke="none"/>
        </g>
      </svg>
    );
    case 'galaxy-density-balanced': return (
      <svg {...props}>
        <g transform="translate(7 7) rotate(-20)">
          <ellipse cx="0" cy="0" rx="4" ry="1.6"/>
          <circle cx="0" cy="0" r="0.7" fill="currentColor" stroke="none"/>
        </g>
        <g transform="translate(15 16) rotate(35)">
          <ellipse cx="0" cy="0" rx="3.4" ry="1.3"/>
          <circle cx="0" cy="0" r="0.6" fill="currentColor" stroke="none"/>
        </g>
      </svg>
    );
    case 'galaxy-density-performance': return (
      <svg {...props}>
        <g transform="translate(12 12) rotate(-20)">
          <ellipse cx="0" cy="0" rx="4.4" ry="1.8"/>
          <circle cx="0" cy="0" r="0.8" fill="currentColor" stroke="none"/>
        </g>
      </svg>
    );

    /* ─── Galaxy-mode (visual vs true 1:1) ─── */
    case 'galaxy-mode-visual': return (
      <svg {...props}>
        <g transform="rotate(-25 12 12)">
          <ellipse cx="12" cy="12" rx="6.5" ry="2.6"/>
          <ellipse cx="12" cy="12" rx="9" ry="4" strokeDasharray="2 2" strokeWidth={stroke * 0.75}/>
          <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>
        </g>
      </svg>
    );
    case 'galaxy-mode-true': return (
      <svg {...props}>
        <g transform="rotate(-25 12 12)">
          <ellipse cx="12" cy="12" rx="4.5" ry="1.8"/>
          <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/>
        </g>
        <path d="M4 20.5 H7"  strokeWidth={stroke * 0.9}/>
        <path d="M17 20.5 H20" strokeWidth={stroke * 0.9}/>
        <path d="M5.5 19.2 V21.8" strokeWidth={stroke * 0.9}/>
        <path d="M18.5 19.2 V21.8" strokeWidth={stroke * 0.9}/>
      </svg>
    );

    default: return null;
  }
}
