import React from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import recordsWebLogo from '../assets/recordsweb-update-logo.png'

export default function BillingCompletePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const status = new URLSearchParams(location.search).get('status') || 'success'
  const success = status === 'success'
  return (
    <main className="stripe-checkout-shell stripe-checkout-result">
      <div className="stripe-checkout-brand"><img src={recordsWebLogo} alt="RecordsWeb" /><div><strong>RecordsWeb</strong><span>Subscription & billing</span></div></div>
      <section className="stripe-checkout-card">
        {success ? <CheckCircle2 className="stripe-checkout-result-icon success" size={40}/> : <XCircle className="stripe-checkout-result-icon" size={40}/>} 
        <h1>{success ? 'Payment submitted' : 'Checkout cancelled'}</h1>
        <p>{success ? 'Stripe has received the checkout. Return to RecordsWeb and refresh Subscription & billing to see the latest status.' : 'No new subscription was completed. You can return to RecordsWeb and try again whenever you are ready.'}</p>
        <button type="button" className="stripe-checkout-primary" onClick={() => navigate('/login')}>Open RecordsWeb</button>
      </section>
    </main>
  )
}
