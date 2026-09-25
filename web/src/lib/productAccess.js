export const RECORDSWEB_PRODUCTS = Object.freeze({
  clinical: Object.freeze({ id: 'clinical', name: 'RecordsWeb Clinical', shortName: 'Clinical', path: '/', description: 'Healthcare records, appointments, consultations, medication and care workflows.' }),
  policing: Object.freeze({ id: 'policing', name: 'RecordsWeb Policing', shortName: 'Policing', path: '/policing', description: 'Operational policing records, incidents, FPNs, persons, vehicles and intelligence.' }),
})

export const RECORDSWEB_PRODUCT_IDS = Object.freeze(Object.keys(RECORDSWEB_PRODUCTS))

export function normaliseProductPackage(value) {
  const packageName = String(value || '').trim().toLowerCase()
  return ['clinical', 'policing', 'complete', 'custom'].includes(packageName) ? packageName : 'clinical'
}

export function normaliseEnabledProducts(value, testerProgram = false) {
  if (testerProgram) return [...RECORDSWEB_PRODUCT_IDS]
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.replace(/[{}]/g, '').split(',')
      : []
  const products = [...new Set(raw.map((item) => String(item || '').trim().toLowerCase()).filter((item) => RECORDSWEB_PRODUCT_IDS.includes(item)))]
  return products.length ? products : ['clinical']
}

export function getOrganisationProductState(profile = {}, settings = {}) {
  const organisation = profile?.organisations || {}
  const testerProgram = Boolean(
    organisation?.tester_program ??
    profile?.tester_program ??
    settings?.testerProgram ??
    false
  )
  const packageName = normaliseProductPackage(
    organisation?.product_package ??
    profile?.product_package ??
    settings?.productPackage ??
    'clinical'
  )
  const enabledProducts = normaliseEnabledProducts(
    organisation?.enabled_products ??
    profile?.enabled_products ??
    settings?.enabledProducts,
    testerProgram,
  )
  return { enabledProducts, packageName, testerProgram }
}

export function hasRecordsWebProduct(profile, productId, settings = {}) {
  return getOrganisationProductState(profile, settings).enabledProducts.includes(productId)
}

export function defaultProductPath(profile, settings = {}) {
  const { enabledProducts } = getOrganisationProductState(profile, settings)
  if (enabledProducts.includes('clinical')) return '/'
  if (enabledProducts.includes('policing')) return '/policing'
  return '/'
}
