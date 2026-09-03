import React, { useEffect, useState } from 'react'
import { CalendarDays, ClipboardList, HeartPulse, Pill, RefreshCcw, UsersRound } from 'lucide-react'
import Panel from '../components/Panel'
import { getPopulationStats, listPatients } from '../lib/dataService'

export default function PopulationReportingPage(){
  const [stats,setStats]=useState(null)
  const [patients,setPatients]=useState([])
  const [loading,setLoading]=useState(true)
  async function load(){setLoading(true);try{const [s,p]=await Promise.all([getPopulationStats(),listPatients()]);setStats(s);setPatients(p)}finally{setLoading(false)}}
  useEffect(()=>{load()},[])
  const cards=stats?[["Registered patients",stats.patients,UsersRound],["Active problems",stats.activeProblems,HeartPulse],["Repeat medicines",stats.repeatMeds,Pill],["Open workflow tasks",stats.openTasks,ClipboardList],["Appointments",stats.appointments,CalendarDays]]:[]
  return <div className="page-pad workspace-page"><div className="page-title-row"><div><h1>Population Reporting</h1><p>Operational overview for Grove Way Health Centre.</p></div><button className="secondary-button" onClick={load}><RefreshCcw size={14}/> Refresh</button></div>{loading?<div className="empty-state">Loading report…</div>:<><div className="report-card-grid">{cards.map(([label,value,Icon])=><div className="report-stat" key={label}><Icon size={21}/><div><strong>{value}</strong><span>{label}</span></div></div>)}</div><Panel title="Registered patient population"><div className="population-table"><div className="population-row population-head"><span>Patient</span><span>Date of birth</span><span>NHS number</span><span>Usual GP</span><span>Status</span></div>{patients.map((p)=><div className="population-row" key={p.id}><span><strong>{p.last_name.toUpperCase()}, {p.first_name}</strong></span><span>{new Date(p.dob).toLocaleDateString('en-GB')}</span><span>{p.nhs_number||'—'}</span><span>{p.usual_gp||'—'}</span><span>{p.status||'Active'}</span></div>)}</div></Panel></>}</div>
}
