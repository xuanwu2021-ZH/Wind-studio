import { cn } from '@cherrystudio/ui/lib/utils'
import type { CSSProperties, FC } from 'react'

interface AgentAvatarProps {
  /** Absolute on-disk path to an image file (PNG/JPG/SVG/ICO/WEBP). When set
   *  and the file resolves to a usable URL it takes priority over `emoji`. */
  imageSrc?: string
  /** Emoji fallback (and the value rendered when `imageSrc` cannot be turned
   *  into a usable URL, e.g. while the file is missing on disk). */
  emoji: string
  className?: string
  size?: number
  fontSize?: number
}

/**
 * Round avatar tile that prefers a real image (asset path, file:// URL, or
 * HTTP(S) URL) and falls back to the emoji rendering when none is available.
 *
 * Used by the Work / Agent surfaces to show the bundled Windbot icon
 * (`avatar_image` on the builtin agent) and the generic emoji avatar for
 * user-created agents.
 */
const AgentAvatar: FC<AgentAvatarProps> = ({
  imageSrc,
  emoji,
  className,
  size = 26,
  fontSize = 15
}) => {
  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    fontSize
  }

  // imageSrc must be something the renderer can actually load. Only then do we
  // swap to the <img> path. Anything else falls through to emoji.
  const usableImage =
    imageSrc && (imageSrc.startsWith('file://') || imageSrc.startsWith('http://') || imageSrc.startsWith('https://'))
      ? imageSrc
      : imageSrc && /^[a-zA-Z]:[\\/]/.test(imageSrc)
        ? `file:///${imageSrc.replace(/\\/g, '/')}`
        : undefined

  if (usableImage) {
    return (
      <div
        className={cn(
          'relative mr-[3px] flex shrink-0 items-center justify-center overflow-hidden rounded-full',
          className
        )}
        style={containerStyle}>
        <img
          src={usableImage}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover blur-[5px] opacity-40 scale-150"
        />
        <img
          src={usableImage}
          alt=""
          draggable={false}
          className="relative h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative mr-[3px] flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        className
      )}
      style={containerStyle}>
      <div className="absolute inset-0 flex h-full w-full scale-150 items-center justify-center text-[200%] opacity-40 blur-[5px]">
        {emoji || '⭐️'}
      </div>
      {emoji}
    </div>
  )
}

export default AgentAvatar
