/* Small stroke icons for the admin pages (24px grid, 1.75 stroke, currentColor). */

type IconProps = { size?: number; className?: string };

function Svg({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  home: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-5h4v5" />
    </Svg>
  ),
  megaphone: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </Svg>
  ),
  text: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 6h16M4 12h10M4 18h13" />
    </Svg>
  ),
  message: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 5h16v11H9l-5 4V5Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </Svg>
  ),
  sprout: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 20v-9" />
      <path d="M12 11c0-3.5-2.5-6-7-6 0 4 2.5 6 7 6Z" />
      <path d="M12 13c0-3 2.2-5.5 7-5.5 0 3.7-2.6 5.5-7 5.5Z" />
    </Svg>
  ),
  gauge: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="m12 14 4-5" />
      <circle cx="12" cy="14" r="1.2" />
    </Svg>
  ),
  calendar: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Svg>
  ),
  map: (p: IconProps) => (
    <Svg {...p}>
      <path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </Svg>
  ),
  tag: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5-8.5-8.5Z" />
      <circle cx="8" cy="8.5" r="1.3" />
    </Svg>
  ),
  users: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
    </Svg>
  ),
  user: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  ),
  history: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3 4v4h4" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  ),
  eye: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  ),
  eyeOff: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.7M6.6 6.7C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.6-1.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </Svg>
  ),
  plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  trash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Svg>
  ),
  undo: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Svg>
  ),
  more: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" />
    </Svg>
  ),
  close: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  check: (p: IconProps) => (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  ),
  alert: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </Svg>
  ),
  info: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Svg>
  ),
  arrowUp: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  ),
  arrowDown: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  ),
  external: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  ),
  copy: (p: IconProps) => (
    <Svg {...p}>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
      <path d="M15.5 8.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h3.5" />
    </Svg>
  ),
  key: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2" />
    </Svg>
  ),
  logout: (p: IconProps) => (
    <Svg {...p}>
      <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </Svg>
  ),
  menu: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  ),
  dot: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </Svg>
  ),
  chevronRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  ),
  cloud: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 18.5h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 10.1 4.2 4.2 0 0 0 7 18.5Z" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icons;

export function Icon({ name, ...props }: IconProps & { name: IconName }) {
  const Component = Icons[name];
  return <Component {...props} />;
}
