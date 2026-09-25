import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { getLiveKitClient } from '../lib/livekitClient'
import { heartbeatBodycamSession, startBodycamSession, stopBodycamSession } from '../lib/bodycamService'
import { recordAudit } from '../lib/auditService'

const BodycamContext = createContext(null)

export function BodycamProvider({ children }) {
  const { session } = useAuth()
  const [bodycam, setBodycamState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bodycamRef = useRef(null)
  const roomRef = useRef(null)
  const heartbeatRef = useRef(null)
  const stoppingRef = useRef(false)

  const setBodycam = useCallback((value) => {
    bodycamRef.current = value
    setBodycamState(value)
  }, [])

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current)
    heartbeatRef.current = null
  }, [])

  const stop = useCallback(async ({ silent = false, remoteOnly = false } = {}) => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    clearHeartbeat()
    const active = bodycamRef.current
    const room = roomRef.current
    roomRef.current = null

    try {
      if (room && !remoteOnly) {
        try { await room.localParticipant.setScreenShareEnabled(false) } catch {}
        try { await room.localParticipant.setMicrophoneEnabled(false) } catch {}
      }
      try { room?.disconnect?.() } catch {}
      if (active?.id) await stopBodycamSession(active.id).catch(() => {})
      if (active?.id) await recordAudit({
        action: 'policing.bodycam.stopped',
        entityType: 'police_bodycam_session',
        entityId: active.id,
        description: `Stopped live bodycam${active.callsign ? ` ${active.callsign}` : ''}.`,
      }).catch(() => {})
      setBodycam(null)
      if (!silent) setError('')
    } finally {
      stoppingRef.current = false
    }
  }, [clearHeartbeat, setBodycam])

  const start = useCallback(async (options = {}) => {
    if (busy || bodycamRef.current) return bodycamRef.current
    setBusy(true)
    setError('')
    let created = null
    let room = null

    try {
      created = await startBodycamSession(options)
      const livekit = await getLiveKitClient()
      room = new livekit.Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room

      room.on(livekit.RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication?.source === livekit.Track.Source.ScreenShare && !stoppingRef.current) {
          void stop({ silent: true, remoteOnly: true })
        }
      })
      room.on(livekit.RoomEvent.Disconnected, () => {
        if (!stoppingRef.current && bodycamRef.current) void stop({ silent: true, remoteOnly: true })
      })

      await room.connect(created.livekit_url, created.token)
      await room.localParticipant.setScreenShareEnabled(true, { audio: true })
      if (options.microphone_enabled) await room.localParticipant.setMicrophoneEnabled(true)

      const next = created.session || { id: created.session_id, ...options }
      setBodycam(next)
      await recordAudit({
        action: 'policing.bodycam.started',
        entityType: 'police_bodycam_session',
        entityId: next.id,
        description: `Started live bodycam${next.callsign ? ` ${next.callsign}` : ''}.`,
      }).catch(() => {})

      heartbeatRef.current = window.setInterval(() => {
        heartbeatBodycamSession(next.id).catch((heartbeatError) => {
          console.warn('RecordsWeb bodycam heartbeat failed:', heartbeatError)
        })
      }, 20000)

      return next
    } catch (startError) {
      try { room?.disconnect?.() } catch {}
      roomRef.current = null
      if (created?.session?.id || created?.session_id) {
        await stopBodycamSession(created?.session?.id || created?.session_id).catch(() => {})
      }
      const message = startError?.message || 'Unable to start RecordsWeb Bodycam.'
      setError(message)
      throw startError
    } finally {
      setBusy(false)
    }
  }, [busy, setBodycam, stop])

  useEffect(() => {
    if (session?.user?.id) return undefined
    if (bodycamRef.current) void stop({ silent: true })
    return undefined
  }, [session?.user?.id, stop])

  useEffect(() => () => {
    clearHeartbeat()
    try { roomRef.current?.disconnect?.() } catch {}
  }, [clearHeartbeat])

  const value = useMemo(() => ({
    bodycam,
    isLive: Boolean(bodycam),
    busy,
    error,
    setError,
    startBodycam: start,
    stopBodycam: stop,
  }), [bodycam, busy, error, start, stop])

  return <BodycamContext.Provider value={value}>{children}</BodycamContext.Provider>
}

export function useBodycam() {
  const context = useContext(BodycamContext)
  if (!context) throw new Error('useBodycam must be used inside BodycamProvider')
  return context
}
