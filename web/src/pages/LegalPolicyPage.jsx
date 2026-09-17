import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileText, Mail, Moon, ShieldCheck, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import recordsWebWordmark from '../assets/RW-Logo.png'
import privacyPolicy from '../legal/RecordsWeb-Privacy-Policy.md?raw'
import termsOfService from '../legal/RecordsWeb-Terms-of-Service.md?raw'
import { APP_VERSION } from '../lib/webRuntime'
import { applyRecordsWebProductBrand } from '../lib/organisationSettings'

function inlineMarkup(text) {
  return String(text || '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    return <React.Fragment key={index}>{part}</React.Fragment>
  })
}

function parsePolicy(markdown) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n')
  const nodes = []
  let paragraph = []
  let bullets = []
  let key = 0

  const flushParagraph = () => {
    if (!paragraph.length) return
    nodes.push(<p key={`p-${key++}`}>{inlineMarkup(paragraph.join(' '))}</p>)
    paragraph = []
  }
  const flushBullets = () => {
    if (!bullets.length) return
    nodes.push(<ul key={`ul-${key++}`}>{bullets.map((item, index) => <li key={index}>{inlineMarkup(item)}</li>)}</ul>)
    bullets = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) { flushParagraph(); flushBullets(); continue }
    if (line.startsWith('# ')) { flushParagraph(); flushBullets(); continue }
    if (line.startsWith('### ')) { flushParagraph(); flushBullets(); nodes.push(<h3 key={`h3-${key++}`}>{line.slice(4)}</h3>); continue }
    if (line.startsWith('## ')) { flushParagraph(); flushBullets(); nodes.push(<h2 key={`h2-${key++}`}>{line.slice(3)}</h2>); continue }
    if (line.startsWith('- ')) { flushParagraph(); bullets.push(line.slice(2)); continue }
    flushBullets()
    paragraph.push(line)
  }
  flushParagraph(); flushBullets()
  return nodes
}

export default function LegalPolicyPage({ type }) {
  const navigate = useNavigate()
  const isPrivacy = type === 'privacy'
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service'
  const markdown = isPrivacy ? privacyPolicy : termsOfService
  const [publicTheme, setPublicTheme] = useState(() => localStorage.getItem('recordsweb-public-theme') || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  const content = useMemo(() => parsePolicy(markdown), [markdown])

  useEffect(() => {
    applyRecordsWebProductBrand()
    document.title = `${title} · RecordsWeb`
    return () => { document.title = 'RecordsWeb' }
  }, [title])

  function toggleTheme() {
    setPublicTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem('recordsweb-public-theme', next)
      return next
    })
  }

  return (
    <div className={`public-home legal-policy-page public-theme-${publicTheme}`}>
      <header className="public-home-header">
        <div className="public-home-brand" role="button" tabIndex={0} onClick={() => navigate('/')} onKeyDown={(event) => event.key === 'Enter' && navigate('/')}>
          <img className="public-home-wordmark" src={recordsWebWordmark} alt="RecordsWeb" />
          <span>Roleplay records platform</span>
        </div>
        <nav>
          <button type="button" onClick={() => navigate('/')}><ArrowLeft size={15}/> Home</button>
          <button type="button" onClick={() => navigate(isPrivacy ? '/terms' : '/privacy')}>{isPrivacy ? <FileText size={14}/> : <ShieldCheck size={14}/>} {isPrivacy ? 'Terms of Service' : 'Privacy Policy'}</button>
          <button type="button" onClick={() => navigate('/contact')}><Mail size={14}/> Contact</button>
          <button type="button" className="public-theme-toggle" onClick={toggleTheme}>{publicTheme === 'dark' ? <Sun size={15}/> : <Moon size={15}/>}<span>{publicTheme === 'dark' ? 'Light' : 'Dark'}</span></button>
        </nav>
      </header>

      <main className="legal-policy-main">
        <section className="legal-policy-hero">
          <span className="public-eyebrow">RECORDSWEB LEGAL</span>
          <h1>{title}</h1>
          <p>{isPrivacy ? 'How RecordsWeb handles account, security, moderation and integration information.' : 'The rules that apply when accessing or using RecordsWeb and its integrations.'}</p>
          <div className="legal-roleplay-notice"><ShieldCheck size={19}/><div><strong>Roleplay and simulation service</strong><span>RecordsWeb is not an NHS service, healthcare provider, clinical system, medical device or emergency service. Do not use it for genuine patient records.</span></div></div>
        </section>
        <article className="legal-policy-document">{content}</article>
      </main>

      <footer className="public-home-footer">
        <span>RecordsWeb · {title}</span>
        <div className="public-home-footer-actions">
          <button type="button" onClick={() => navigate('/privacy')}>Privacy</button>
          <button type="button" onClick={() => navigate('/terms')}>Terms</button>
          <button type="button" onClick={() => navigate('/contact')}>Contact Us</button>
          <span>Version {APP_VERSION}</span>
        </div>
      </footer>
    </div>
  )
}
