import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12 20 4l-6 16-3-7-7-1Z" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
    </Icon>
  )
}

export function BackIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 18 9 12l6-6" />
    </Icon>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon strokeWidth="2.2" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth="2.4" {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  )
}

export function DoubleCheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth="2.4" {...props}>
      <path d="m2 12.5 4.5 4.5L16 7.5M11.5 16l1 1L22 7.5" />
    </Icon>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon strokeWidth="2.2" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </Icon>
  )
}
