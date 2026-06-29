import { NextRequest, NextResponse } from 'next/server'
import { checkAdminStatus } from '@/lib/admin'
import getClientPromise from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const auth = await checkAdminStatus()
  if (auth.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const youtubeId = searchParams.get('youtube_id')
  if (!youtubeId) return NextResponse.json({ error: 'youtube_id required' }, { status: 400 })

  const client = await getClientPromise()
  const db = client.db('13f-tracker')
  const doc = await db.collection('video_transcripts').findOne({ youtube_id: youtubeId })

  if (!doc) {
    return NextResponse.json(
      { error: '完整逐字稿不存在或已過期，請重新讀取影片內容', notFound: true },
      { status: 404 }
    )
  }

  return NextResponse.json({
    ok: true,
    youtube_id: doc.youtube_id,
    video_title: doc.video_title,
    channel: doc.channel,
    fullTranscript: doc.fullTranscript,
    transcriptLength: doc.transcriptLength,
    transcriptSegments: doc.transcriptSegments,
    fetchedAt: doc.fetchedAt,
    expiresAt: doc.expiresAt,
  })
}
