/** Small stroke icons for the assistant (24px grid, currentColor). */

type IconProps = { size?: number; className?: string };

function Svg({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** The assistant's mark: a cloud with a spark, Cumulus' cloud plus "ask". */
export function AssistantMark({ size = 20, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M7.5 18.5h9.2a4.3 4.3 0 0 0 .5-8.57A5.8 5.8 0 0 0 6.1 11.1 3.7 3.7 0 0 0 7.5 18.5Z" />
      <path d="M12 9.6v4.6M9.7 11.9h4.6" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  );
}

export function StopIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="10" height="10" rx="2.5" fill="currentColor" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function NewChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20h8M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </Svg>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 4h5v5M9 20H4v-5M20 4l-6.5 6.5M4 20l6.5-6.5" />
    </Svg>
  );
}

export function CollapseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 10h-5V5M5 14h5v5M14 10l6.5-6.5M10 14l-6.5 6.5" />
    </Svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </Svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.4" />
      <path d="M15.5 8.5V6.4a1.9 1.9 0 0 0-1.9-1.9H6.4a1.9 1.9 0 0 0-1.9 1.9v7.2a1.9 1.9 0 0 0 1.9 1.9h2.1" />
    </Svg>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.6M20 4v4.6h-4.6M20 12a8 8 0 0 1-13.7 5.6L4 15.4M4 20v-4.6h4.6" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
    </Svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.8 2.8 19.5h18.4Z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </Svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  );
}
