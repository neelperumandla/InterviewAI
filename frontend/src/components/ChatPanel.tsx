import { useEffect, useRef } from 'react'
import type { FeedItem } from '../types/interview'
import { FeedItemView } from './FeedItems'

interface Props {
  feedItems: FeedItem[]
  emptyMessage?: string
}

export function ChatPanel({ feedItems, emptyMessage }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feedItems])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {feedItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-500">
            <p className="text-sm">{emptyMessage ?? 'Researching your target company...'}</p>
          </div>
        ) : (
          feedItems.map(item => (
            <FeedItemView key={item.id} item={item} />
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
