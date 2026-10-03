import { avatarColor, initials } from '../lib/format'

interface AvatarProps {
  seed: string
  title: string
  size?: 'md' | 'lg'
}

export function Avatar({ seed, title, size = 'md' }: AvatarProps) {
  return (
    <span className={`avatar avatar--${size}`} style={{ backgroundColor: avatarColor(seed) }} aria-hidden="true">
      {initials(title)}
    </span>
  )
}
