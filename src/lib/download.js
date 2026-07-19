/**
 * Replacement for the Whacka `download` SDK stub — triggers a browser
 * "save file" for either a Blob or a plain URL string. No backend involved.
 */
export const download = {
  saveFile: async (fileOrUrl, filename) => {
    const isBlob = fileOrUrl instanceof Blob
    const url = isBlob ? URL.createObjectURL(fileOrUrl) : fileOrUrl
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (isBlob) setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
