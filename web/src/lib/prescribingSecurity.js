import { supabase, supabaseConfigured } from './supabase'

const DEMO_PIN_KEY = 'recordsweb-demo-prescribing-pin-v1'
const PIN_PATTERN = /^\d{4}$/

export function validatePrescribingPin(pin) {
  if (!PIN_PATTERN.test(String(pin || ''))) throw new Error('Prescribing PIN must contain exactly 4 digits.')
  return String(pin)
}

async function digest(value) {
  const text = new TextEncoder().encode(String(value))
  if (globalThis.crypto?.subtle) {
    const buffer = await globalThis.crypto.subtle.digest('SHA-256', text)
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return btoa(String(value))
}

export async function hasPrescribingPin() {
  if (!supabaseConfigured) return Boolean(localStorage.getItem(DEMO_PIN_KEY))
  const { data, error } = await supabase.rpc('recordsweb_has_prescribing_pin')
  if (error) {
    if (error.code === 'PGRST202' || /recordsweb_has_prescribing_pin/i.test(error.message || '')) {
      throw new Error('Prescribing PIN security is not installed in Supabase. Run supabase/recordsweb-2.6.2.sql.')
    }
    throw error
  }
  return Boolean(data)
}

export async function setPrescribingPin({ newPin, currentPin = '' }) {
  const cleanNew = validatePrescribingPin(newPin)
  if (!supabaseConfigured) {
    const existing = localStorage.getItem(DEMO_PIN_KEY)
    if (existing) {
      const current = validatePrescribingPin(currentPin)
      if (await digest(current) !== existing) throw new Error('Current prescribing PIN is incorrect.')
    }
    localStorage.setItem(DEMO_PIN_KEY, await digest(cleanNew))
    return true
  }

  const { data, error } = await supabase.rpc('recordsweb_set_prescribing_pin', {
    p_new_pin: cleanNew,
    p_current_pin: currentPin ? String(currentPin) : null,
  })
  if (error) throw new Error(error.message || 'Unable to update prescribing PIN.')
  return Boolean(data)
}

export async function verifyDemoPrescribingPin(pin) {
  const clean = validatePrescribingPin(pin)
  const existing = localStorage.getItem(DEMO_PIN_KEY)
  if (!existing) throw new Error('Create a prescribing PIN before authorising medication.')
  if (await digest(clean) !== existing) throw new Error('Prescribing PIN is incorrect.')
  return true
}
