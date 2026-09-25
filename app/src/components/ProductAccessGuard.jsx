import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getCachedOrganisationSettings } from '../lib/organisationSettings'
import { defaultProductPath, hasRecordsWebProduct, RECORDSWEB_PRODUCTS } from '../lib/productAccess'

export default function ProductAccessGuard({ product }) {
  const { session } = useAuth()
  const profile = session?.profile || {}
  const settings = getCachedOrganisationSettings()
  if (hasRecordsWebProduct(profile, product, settings)) return <Outlet />
  const destination = defaultProductPath(profile, settings)
  const name = RECORDSWEB_PRODUCTS[product]?.name || 'This RecordsWeb product'
  if (destination !== window.location.pathname) return <Navigate to={destination} replace />
  return <div className="product-access-empty"><strong>{name} is not enabled</strong><span>Ask your RecordsWeb community administrator or the RecordsWeb platform team to enable this product.</span></div>
}
