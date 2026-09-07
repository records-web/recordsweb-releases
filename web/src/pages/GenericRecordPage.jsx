import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PatientHeader from '../components/PatientHeader'
import ClinicalToolbar from '../components/ClinicalToolbar'
import Panel from '../components/Panel'
import { getPatient, listForPatient } from '../lib/dataService'

const columns = {
  problems: [['name','Problem'],['status','Status'],['significance','Significance'],['onset_date','Onset date']],
  investigations: [['name','Investigation'],['result','Result'],['status','Status'],['date','Date']],
  diary_tasks: [['title','Task'],['priority','Priority'],['due_date','Due date']],
  documents: [['title','Document'],['category','Category'],['author','Author'],['date','Date']],
  referrals: [['service','Service'],['priority','Priority'],['status','Status'],['date','Date']],
}

export default function GenericRecordPage({ type, title }) {
  const { patientId } = useParams()
  const [patient, setPatient] = useState(null)
  const [rows, setRows] = useState([])
  useEffect(() => { Promise.all([getPatient(patientId), listForPatient(type, patientId, type === 'diary_tasks' ? 'due_date' : 'date')]).then(([p,r])=>{setPatient(p);setRows(r)}) }, [patientId,type])
  const cols = columns[type] || []
  return <div><ClinicalToolbar actions={[{label:`Add ${title.slice(0,-1).toLowerCase()}`,icon:'add'},{label:'Filters',icon:'filter',groupStart:true},{label:'Print',icon:'print'},{label:'Search',icon:'search'}]} /><PatientHeader patient={patient}/><div className="page-pad compact-pad"><Panel title={title} count={rows.length}><div className="generic-table"><div className="generic-row generic-head">{cols.map(([,label])=><span key={label}>{label}</span>)}</div>{rows.map((row)=><div className="generic-row" key={row.id}>{cols.map(([key])=><span key={key}>{formatValue(key,row[key])}</span>)}</div>)}</div></Panel></div></div>
}

function formatValue(key, value) {
  if (!value) return '—'
  if (key.includes('date')) return new Date(value).toLocaleDateString('en-GB')
  return value
}
