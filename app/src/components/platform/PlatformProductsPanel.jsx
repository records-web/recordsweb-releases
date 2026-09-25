import React, { useCallback, useEffect, useState } from 'react'
import { Beaker, Layers, CheckCircle2, RefreshCw, Save } from 'lucide-react'
import { listPlatformCommunities, updatePlatformCommunityProducts } from '../../lib/platformOperationsService'

const PACKAGES = [
  ['clinical', 'Clinical'],
  ['policing', 'Policing'],
  ['complete', 'Complete'],
  ['custom', 'Custom'],
]

function packageProducts(packageName) {
  if (packageName === 'clinical') return { clinical: true, policing: false }
  if (packageName === 'policing') return { clinical: false, policing: true }
  if (packageName === 'complete') return { clinical: true, policing: true }
  return null
}

export default function PlatformProductsPanel() {
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setRows(await listPlatformCommunities())
    } catch (error) {
      setError(error?.message || 'Unable to load product entitlements.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  function edit(row) {
    const tester = Boolean(row.tester_program)
    const enabled = tester
      ? ['clinical', 'policing']
      : Array.isArray(row.enabled_products) && row.enabled_products.length
        ? row.enabled_products
        : ['clinical']

    setSelected(row)
    setForm({
      productPackage: row.product_package || 'clinical',
      clinical: enabled.includes('clinical'),
      policing: enabled.includes('policing'),
      testerProgram: tester,
      testerNotes: row.tester_notes || '',
    })
  }

  function changePackage(productPackage) {
    const products = packageProducts(productPackage)
    setForm((current) => ({
      ...current,
      productPackage,
      ...(products || {}),
    }))
  }

  function toggleProduct(product, checked) {
    setForm((current) => {
      const next = { ...current, [product]: checked }
      if (next.clinical && next.policing) next.productPackage = 'complete'
      else if (next.clinical) next.productPackage = 'clinical'
      else if (next.policing) next.productPackage = 'policing'
      else next.productPackage = 'custom'
      return next
    })
  }

  async function save(event) {
    event.preventDefault()
    const products = ['clinical', 'policing'].filter((product) => form[product])
    if (!form.testerProgram && !products.length) {
      setError('Enable at least one RecordsWeb product.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      await updatePlatformCommunityProducts({
        organisationId: selected.id,
        productPackage: form.productPackage,
        enabledProducts: products,
        testerProgram: form.testerProgram,
        testerNotes: form.testerNotes,
      })
      setNotice(`Product access updated for ${selected.name}.`)
      setSelected(null)
      setForm(null)
      await load()
    } catch (error) {
      setError(error?.message || 'Unable to update product access.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="platform-operator-panel">
      <header>
        <div>
          <span>PRODUCT CONTROL</span>
          <h2>Products &amp; tester programme</h2>
          <p>Control Clinical, Policing and Complete entitlements without changing organisation authentication or security.</p>
        </div>
        <button onClick={load} disabled={busy}><RefreshCw size={14}/>Refresh</button>
      </header>

      {error && <div className="review-request-message error">{error}</div>}
      {notice && <div className="review-request-message success"><CheckCircle2 size={15}/>{notice}</div>}

      <div className="platform-product-list">
        {rows.map((row) => {
          const products = row.tester_program ? ['clinical', 'policing'] : (row.enabled_products || ['clinical'])
          return (
            <button key={row.id} onClick={() => edit(row)}>
              <Layers size={18}/>
              <div>
                <strong>{row.name}</strong>
                <span>@{row.org_code} · {row.product_package || 'clinical'}</span>
              </div>
              <div className="platform-product-badges">
                {products.map((product) => <b key={product}>{product}</b>)}
                {row.tester_program && <b className="tester"><Beaker size={12}/>Tester</b>}
              </div>
            </button>
          )
        })}
      </div>

      {selected && form && (
        <div className="platform-community-modal-backdrop">
          <form className="platform-community-modal platform-products-modal" onSubmit={save}>
            <header>
              <div>
                <span>PRODUCT ACCESS</span>
                <h3>{selected.name}</h3>
                <p>@{selected.org_code}</p>
              </div>
              <button type="button" onClick={() => { setSelected(null); setForm(null) }}>×</button>
            </header>

            <div className="platform-community-modal-grid">
              <label>
                <span>Package</span>
                <select value={form.productPackage} onChange={(event) => changePackage(event.target.value)} disabled={form.testerProgram}>
                  {PACKAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <small>Clinical, Policing and Complete map directly to their product entitlements. Use Custom for future mixed access.</small>
              </label>

              <label className="platform-billing-check">
                <input
                  type="checkbox"
                  checked={form.clinical || form.testerProgram}
                  disabled={form.testerProgram}
                  onChange={(event) => toggleProduct('clinical', event.target.checked)}
                />
                <span>RecordsWeb Clinical</span>
              </label>

              <label className="platform-billing-check">
                <input
                  type="checkbox"
                  checked={form.policing || form.testerProgram}
                  disabled={form.testerProgram}
                  onChange={(event) => toggleProduct('policing', event.target.checked)}
                />
                <span>RecordsWeb Policing</span>
              </label>

              <label className="platform-billing-check">
                <input
                  type="checkbox"
                  checked={form.testerProgram}
                  onChange={(event) => setForm((current) => ({ ...current, testerProgram: event.target.checked }))}
                />
                <span>Tester Programme — unlock all current products</span>
              </label>

              <label className="wide platform-billing-notes">
                <span>Tester / entitlement notes</span>
                <textarea rows={4} maxLength={1000} value={form.testerNotes} onChange={(event) => setForm({ ...form, testerNotes: event.target.value })}/>
              </label>
            </div>

            <div className="platform-community-modal-actions">
              <button type="button" onClick={() => { setSelected(null); setForm(null) }}>Cancel</button>
              <button className="primary" disabled={busy}><Save size={13}/>{busy ? 'Saving…' : 'Save products'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
