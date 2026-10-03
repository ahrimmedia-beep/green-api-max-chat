import { useState } from 'react'
import { avatarColor, initials } from '../lib/format'

interface AvatarProps {
  seed: string
  title: string
  url?: string | null
  size?: 'md' | 'lg'
}

export function Avatar({ seed, title, url, size = 'md' }: AvatarProps) {
  // Если картинка не загрузилась (ссылка устарела, закрыта приватностью), показываем инициалы.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = Boolean(url) && url !== failedUrl

  return (
    <span className={`avatar avatar--${size}`} style={{ backgroundColor: avatarColor(seed) }} aria-hidden="true">
      {showImage ? (
        <img
          className="avatar__image"
          src={url ?? undefined}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailedUrl(url ?? null)}
        />
      ) : (
        initials(title)
      )}
    </span>
  )
}
