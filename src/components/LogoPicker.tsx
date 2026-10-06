import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PhotoCropper } from './PhotoCropper'

// File button + the shared round cropper; hands back the cropped JPEG.
export function LogoPicker({ hasLogo, onPicked }: { hasLogo: boolean; onPicked: (logo: Blob) => void }) {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string | null>(null)
  const srcRef = useRef<string | null>(null)
  srcRef.current = src
  useEffect(() => () => { if (srcRef.current) URL.revokeObjectURL(srcRef.current) }, [])

  const drop = () => {
    if (src) URL.revokeObjectURL(src)
    setSrc(null)
  }

  return (
    <>
      <label className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold cursor-pointer text-center">
        📷 {hasLogo ? t('league.changeLogo') : t('league.chooseLogo')}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) {
              if (src) URL.revokeObjectURL(src)
              setSrc(URL.createObjectURL(file))
            }
            e.target.value = ''
          }}
        />
      </label>
      {src && <PhotoCropper src={src} onCancel={drop} onDone={blob => { drop(); onPicked(blob) }} />}
    </>
  )
}
