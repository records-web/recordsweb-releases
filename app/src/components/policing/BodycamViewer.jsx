import React, { useEffect, useRef, useState } from 'react'
import { Maximize2, Volume2, X } from 'lucide-react'
import { endBodycamView, getBodycamViewerToken } from '../../lib/bodycamService'
import { getLiveKitClient } from '../../lib/livekitClient'
import XionBodycamOverlay from './XionBodycamOverlay'
import { recordAudit } from '../../lib/auditService'

export default function BodycamViewer({ session, onClose }) {
  const videoRef = useRef(null)
  const audioHostRef = useRef(null)
  const roomRef = useRef(null)
  const eventIdRef = useRef('')
  const [state, setState] = useState('Connecting…')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let livekit = null

    const attachTrack = (track, publication) => {
      if (!active || !track) return
      if (track.kind === 'video' || publication?.source === livekit?.Track?.Source?.ScreenShare) {
        if (videoRef.current) track.attach(videoRef.current)
      } else if (track.kind === 'audio' && audioHostRef.current) {
        const element = track.attach()
        element.autoplay = true
        audioHostRef.current.appendChild(element)
      }
    }

    ;(async () => {
      try {
        const credentials = await getBodycamViewerToken(session.id)
        eventIdRef.current = credentials.view_event_id || ''
        livekit = await getLiveKitClient()
        const room = new livekit.Room({ adaptiveStream: true, dynacast: true })
        roomRef.current = room
        room.on(livekit.RoomEvent.TrackSubscribed, attachTrack)
        room.on(livekit.RoomEvent.Disconnected, () => active && setState('Bodycam disconnected'))
        await room.connect(credentials.livekit_url, credentials.token)
        setState('LIVE')

        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track) attachTrack(publication.track, publication)
          }
        }

        await recordAudit({
          action: 'policing.bodycam.viewed',
          entityType: 'police_bodycam_session',
          entityId: session.id,
          description: `Viewed live bodycam${session.callsign ? ` ${session.callsign}` : ''}.`,
        }).catch(() => {})
      } catch (viewerError) {
        if (!active) return
        setError(viewerError?.message || 'Unable to connect to this bodycam.')
        setState('Unavailable')
      }
    })()

    return () => {
      active = false
      try { roomRef.current?.disconnect?.() } catch {}
      roomRef.current = null
      if (eventIdRef.current) void endBodycamView(eventIdRef.current).catch(() => {})
      if (audioHostRef.current) audioHostRef.current.replaceChildren()
    }
  }, [session])

  const fullscreen = async () => {
    const target = videoRef.current?.closest('.bodycam-video-stage')
    try { await target?.requestFullscreen?.() } catch {}
  }

  return (
    <div className="modal-backdrop bodycam-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <section className="bodycam-viewer-modal" role="dialog" aria-modal="true" aria-label={`Live bodycam ${session.callsign || ''}`}>
        <header>
          <div><strong>{session.officer_name || 'RecordsWeb officer'}</strong><span>{session.callsign || session.camera_label || 'Body worn video'} · {state}</span></div>
          <div className="bodycam-viewer-actions"><button type="button" onClick={fullscreen} title="Fullscreen"><Maximize2 size={17}/></button><button type="button" onClick={onClose} title="Close"><X size={18}/></button></div>
        </header>
        <div className="bodycam-video-stage">
          <video ref={videoRef} autoPlay playsInline muted={false}/>
          <div ref={audioHostRef} className="bodycam-audio-host"/>
          <XionBodycamOverlay session={session}/>
          {state !== 'LIVE' && !error && <div className="bodycam-video-message">{state}</div>}
          {error && <div className="bodycam-video-message error">{error}</div>}
        </div>
        <footer><span><Volume2 size={14}/>Live audio plays when the publishing officer shares system audio or microphone audio.</span><span>{session.location_label || session.incident?.reference || 'Live RecordsWeb Policing feed'}</span></footer>
      </section>
    </div>
  )
}
