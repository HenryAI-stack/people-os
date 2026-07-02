/**
 * Resizes an image File to a square thumbnail and returns a base64 data URL.
 * Keeps files small enough to store inside the encrypted JSON without
 * bloating the GitHub commit size.
 */
export function resizeImage(file, maxPx = 200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        // Crop to square from centre
        const size = Math.min(img.width, img.height)
        const sx   = (img.width  - size) / 2
        const sy   = (img.height - size) / 2

        const canvas = document.createElement('canvas')
        canvas.width  = maxPx
        canvas.height = maxPx
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxPx, maxPx)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}
