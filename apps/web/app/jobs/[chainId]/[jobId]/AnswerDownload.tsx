'use client'

/** Download the verified original UTF-8 bytes, rather than a reformatted JSON copy. */
export function AnswerDownload({ raw }: { raw: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url
        link.download = 'agent-answer.json'
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}
      style={{
        font: 'inherit',
        color: 'inherit',
        background: 'none',
        border: 0,
        padding: '8px 0',
        textDecoration: 'underline',
        cursor: 'pointer',
      }}
    >
      Download answer JSON
    </button>
  )
}
