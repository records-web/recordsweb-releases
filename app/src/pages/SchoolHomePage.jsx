import React, { useEffect, useState } from 'react'
import { BookOpenCheck, CalendarDays, ClipboardCheck, GraduationCap, School, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getSchoolDashboard } from '../lib/schoolService'

export default function SchoolHomePage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ pupils: 0, classes: 0, registers: 0, completedRegisters: 0, attendancePercent: null })
  const [error, setError] = useState('')
  useEffect(() => { getSchoolDashboard().then(setStats).catch((e) => setError(e?.message || 'Unable to load Ro-School dashboard.')) }, [])

  const cards = [
    ['Pupils on roll', stats.pupils, GraduationCap, '/school/pupils'],
    ['Classes', stats.classes, UsersRound, '/school/classes'],
    ["Today's registers", `${stats.completedRegisters}/${stats.registers}`, ClipboardCheck, '/school/registers'],
    ["Today's attendance", stats.attendancePercent == null ? '—' : `${stats.attendancePercent}%`, BookOpenCheck, '/school/attendance'],
  ]

  return <div className="school-page page-pad compact-pad">
    <section className="school-hero"><div><span>RECORDSWEB · RO-SCHOOL</span><h1>School operations</h1><p>Pupil records, registers, attendance and timetable management for your RecordsWeb education community.</p></div><School size={38}/></section>
    {error && <div className="form-error">{error}</div>}
    <section className="school-stat-grid">{cards.map(([label, value, Icon, path]) => <button key={label} onClick={() => navigate(path)}><Icon size={21}/><strong>{value}</strong><span>{label}</span></button>)}</section>
    <section className="school-shortcuts">
      <button onClick={() => navigate('/school/registers')}><ClipboardCheck size={19}/><div><strong>Take a register</strong><span>Open an AM, PM or lesson register and record attendance marks.</span></div></button>
      <button onClick={() => navigate('/school/pupils')}><GraduationCap size={19}/><div><strong>Pupil records</strong><span>Search the school roll and add pupil records.</span></div></button>
      <button onClick={() => navigate('/school/classes')}><UsersRound size={19}/><div><strong>Classes &amp; groups</strong><span>Create teaching groups and assign pupils.</span></div></button>
      <button onClick={() => navigate('/school/attendance')}><BookOpenCheck size={19}/><div><strong>Attendance</strong><span>Review attendance percentages, late marks and absences.</span></div></button>
      <button onClick={() => navigate('/school/timetable')}><CalendarDays size={19}/><div><strong>Timetable</strong><span>Manage lesson periods, rooms, teachers and classes.</span></div></button>
    </section>
  </div>
}
