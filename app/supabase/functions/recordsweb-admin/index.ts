import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_ROLES = [
  'GP Partner','Practice Manager','Assistant Manager','General Practitioner','GP Registrar (GPST2-3)',
  'GP Registrar (GPST1)','Medical Student','Lead Nurse','Advanced Clinical Practitioner','General Practice Nurse',
  'Nurse Associate','Healthcare Assistant','Patient Coordinator',
] as const
const ALLOWED_TITLES = ['', 'Mr', 'Mrs', 'Miss', 'Ms', 'Mx', 'Dr', 'Prof'] as const
const COMMON_PASSWORDS = new Set(['password123','password1','qwerty123','letmein123','welcome123','recordsweb1','groveway123','changeme123','admin12345','1234567890'])

function cleanRoles(value: unknown, fallback = 'Patient Coordinator') {
  const source = Array.isArray(value) ? value : []
  const clean = [...new Set(source.map((item) => String(item || '').trim()).filter((role) => ALLOWED_ROLES.includes(role as typeof ALLOWED_ROLES[number])))]
  const safeFallback = ALLOWED_ROLES.includes(fallback as typeof ALLOWED_ROLES[number]) ? fallback : 'Patient Coordinator'
  return clean.length ? clean : [safeFallback]
}
function cleanTitle(value: unknown) { const title=String(value||'').trim(); return ALLOWED_TITLES.includes(title as typeof ALLOWED_TITLES[number]) ? title : '' }
function buildDisplayName(title:string, firstName:string, lastName:string){ return [title,firstName,lastName].map(v=>v.trim()).filter(Boolean).join(' ') }
function requiredEnv(name:string){ const value=Deno.env.get(name); if(!value) throw new Error(`Server configuration error: ${name} is unavailable.`); return value }
function normaliseUsername(value:unknown){ const raw=String(value||'').trim(); const withDomain=raw.includes('@')?raw:`${raw}@GW.HC`; const [local,domain]=withDomain.split('@'); return domain?.toLowerCase()==='gw.hc' ? `${local.toLowerCase()}@GW.HC` : withDomain }
function validatePassword(password:string, username=''){
  if(password.length<10) return 'Password must contain at least 10 characters.'
  if(!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)) return 'Password must contain at least one letter and one number.'
  if(COMMON_PASSWORDS.has(password.toLowerCase())) return 'Choose a less common password.'
  const local=String(username||'').split('@')[0].replace(/[^a-z0-9]/gi,'').toLowerCase()
  if(local.length>=5&&password.replace(/[^a-z0-9]/gi,'').toLowerCase().includes(local)) return 'Password must not contain the RecordsWeb username.'
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  try {
    const supabaseUrl=requiredEnv('SUPABASE_URL')
    const serviceRoleKey=requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}})
    const body=await req.json().catch(()=>({}))

    // Public recovery routes intentionally do not require an authenticated session because
    // they are used from the compact sign-in window. Recovery codes are hashed server-side,
    // rate-limited in SQL and these routes never return profile data beyond the verified username.
    if(body.action==='username-reminder'){
      const firstName=String(body.first_name||'').trim(), lastName=String(body.last_name||'').trim(), code=String(body.recovery_code||'').trim()
      if(!firstName||!lastName||!/^\d{6}$/.test(code)) return json({error:'Enter your name and 6-digit recovery code.'},400)
      const {data:candidates,error}=await admin.from('profiles').select('id,username,organisations!inner(org_code)').ilike('first_name',firstName).ilike('last_name',lastName).eq('active',true).eq('organisations.org_code','GW.HC').limit(10)
      if(error) return json({error:'Unable to verify recovery details.'},400)
      const verified=[] as any[]
      for(const candidate of candidates||[]){ const {data:ok}=await admin.rpc('recordsweb_service_verify_recovery_code',{p_user_id:candidate.id,p_code:code}); if(ok) verified.push(candidate) }
      if(verified.length!==1) return json({error:'The details could not be verified. Contact Management if you cannot recover your username.'},400)
      return json({username:verified[0].username})
    }

    if(body.action==='recover-password'){
      const username=normaliseUsername(body.username), code=String(body.recovery_code||'').trim(), password=String(body.new_password||'')
      const policy=validatePassword(password,username); if(policy) return json({error:policy},400)
      if(!/^\d{6}$/.test(code)) return json({error:'Enter your 6-digit recovery code.'},400)
      const {data:profile,error}=await admin.from('profiles').select('id,username,display_name,role,organisation_id,organisations!inner(org_code)').ilike('username',username).eq('active',true).eq('organisations.org_code','GW.HC').maybeSingle()
      if(error||!profile) return json({error:'The username or recovery code is incorrect.'},400)
      const {data:verified,error:verifyError}=await admin.rpc('recordsweb_service_verify_recovery_code',{p_user_id:profile.id,p_code:code})
      if(verifyError||!verified) return json({error:'The username or recovery code is incorrect, or recovery is temporarily locked.'},400)
      const {data:recent,error:recentError}=await admin.rpc('recordsweb_service_password_recently_used',{p_user_id:profile.id,p_password:password})
      if(recentError) return json({error:'Password history is unavailable. Run the RecordsWeb 2.7.0 Supabase migration.'},500)
      if(recent) return json({error:'Choose a password you have not used recently.'},400)
      const {error:authError}=await admin.auth.admin.updateUserById(profile.id,{password})
      if(authError) return json({error:authError.message},400)
      const {error:historyError}=await admin.rpc('recordsweb_service_record_password',{p_user_id:profile.id,p_password:password})
      if(historyError) return json({error:'Password changed, but password history could not be recorded. Contact Management.'},500)
      await admin.from('profiles').update({must_change_password:false,password_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',profile.id)
      await admin.from('audit_log').insert({organisation_id:profile.organisation_id,actor_id:profile.id,actor_name:profile.display_name,actor_role:profile.role,action:'account.password.recovered',entity_type:'profile',entity_id:profile.id,description:'Password reset using the account recovery code.'})
      return json({ok:true})
    }

    const authHeader=req.headers.get('Authorization')||''
    const token=authHeader.replace(/^Bearer\s+/i,'').trim()
    if(!token||token===authHeader) return json({error:'Unauthorised: missing bearer token.'},401)
    const {data:callerData,error:callerError}=await admin.auth.getUser(token)
    if(callerError||!callerData.user) return json({error:'Unauthorised session.'},401)
    const {data:callerProfile,error:profileError}=await admin.from('profiles').select('id,organisation_id,is_management,active,display_name,role,username').eq('id',callerData.user.id).single()
    if(profileError) return json({error:`Unable to verify RecordsWeb profile: ${profileError.message}`},500)
    if(!callerProfile?.active) return json({error:'This RecordsWeb account is disabled.'},403)

    if(body.action==='change-own-password'){
      const currentPassword=String(body.current_password||''), password=String(body.new_password||'')
      const username=callerProfile.username||callerData.user.email||''
      const policy=validatePassword(password,username); if(policy) return json({error:policy},400)
      if(!currentPassword) return json({error:'Enter your current password.'},400)
      if(currentPassword===password) return json({error:'Your new password must be different from your current password.'},400)
      const anonKey=requiredEnv('SUPABASE_ANON_KEY')
      const verifier=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}})
      const {error:verifyPasswordError}=await verifier.auth.signInWithPassword({email:String(callerData.user.email||'').toLowerCase(),password:currentPassword})
      if(verifyPasswordError) return json({error:'Current password is incorrect.'},400)
      const {data:recent,error:recentError}=await admin.rpc('recordsweb_service_password_recently_used',{p_user_id:callerData.user.id,p_password:password})
      if(recentError) return json({error:'Password history is unavailable. Run the RecordsWeb 2.7.0 Supabase migration.'},500)
      if(recent) return json({error:'Choose a password you have not used recently.'},400)
      const {error:updateError}=await admin.auth.admin.updateUserById(callerData.user.id,{password})
      if(updateError) return json({error:updateError.message},400)
      const {error:historyError}=await admin.rpc('recordsweb_service_record_password',{p_user_id:callerData.user.id,p_password:password})
      if(historyError) return json({error:'Password changed, but password history could not be recorded. Contact Management.'},500)
      await admin.from('profiles').update({must_change_password:false,password_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',callerData.user.id)
      await admin.from('audit_log').insert({organisation_id:callerProfile.organisation_id,actor_id:callerProfile.id,actor_name:callerProfile.display_name,actor_role:callerProfile.role,action:'account.password.changed',entity_type:'profile',entity_id:callerProfile.id,description:'Password changed.'})
      return json({ok:true})
    }

    if(!callerProfile?.is_management) return json({error:'Management permission is required.'},403)
    if(body.action==='health') return json({ok:true,admin_api:true,service_role_available:true,caller_id:callerData.user.id})

    if(body.action==='create'){
      const username=normaliseUsername(body.username), authUsername=username.toLowerCase(), password=String(body.password||''), title=cleanTitle(body.title), firstName=String(body.first_name||'').trim(), lastName=String(body.last_name||'').trim()
      const roles=cleanRoles(body.roles,String(body.role||'Patient Coordinator')), requestedPrimary=String(body.role||'').trim(), role=roles.includes(requestedPrimary)?requestedPrimary:roles[0], displayName=buildDisplayName(title,firstName,lastName)
      if(!authUsername.endsWith('@gw.hc')) return json({error:'Username must end in @GW.HC.'},400)
      if(!firstName||!lastName) return json({error:'First and last name are required.'},400)
      const policy=validatePassword(password,username); if(policy) return json({error:policy},400)
      const {data:created,error:createError}=await admin.auth.admin.createUser({email:authUsername,password,email_confirm:true,user_metadata:{recordsweb:true,display_name:displayName}})
      if(createError||!created.user) return json({error:createError?.message||'Unable to create authentication user.'},400)
      const {data:profile,error:insertError}=await admin.from('profiles').insert({id:created.user.id,organisation_id:callerProfile.organisation_id,username,title,first_name:firstName,last_name:lastName,display_name:displayName,role,roles,is_management:Boolean(body.is_management),active:true,must_change_password:true}).select('*').single()
      if(insertError){await admin.auth.admin.deleteUser(created.user.id);return json({error:`Authentication user was rolled back because the staff profile could not be created: ${insertError.message}`},400)}
      const {error:historyError}=await admin.rpc('recordsweb_service_record_password',{p_user_id:created.user.id,p_password:password})
      if(historyError){await admin.auth.admin.deleteUser(created.user.id);return json({error:'Authentication user was rolled back because password history could not be initialised. Run the RecordsWeb 2.7.0 Supabase migration.'},500)}
      await admin.from('audit_log').insert({organisation_id:callerProfile.organisation_id,actor_id:callerProfile.id,actor_name:callerProfile.display_name,actor_role:callerProfile.role,action:'account.created',entity_type:'profile',entity_id:created.user.id,description:`Created RecordsWeb account ${username}.`})
      return json({profile})
    }

    const targetId=String(body.user_id||''); if(!targetId) return json({error:'user_id is required.'},400)
    const {data:target,error:targetError}=await admin.from('profiles').select('id,organisation_id,is_management,username,active,disabled_reason').eq('id',targetId).single()
    if(targetError||!target||target.organisation_id!==callerProfile.organisation_id) return json({error:'Account not found.'},404)

    if(body.action==='update-profile'){
      const title=cleanTitle(body.title),firstName=String(body.first_name||'').trim(),lastName=String(body.last_name||'').trim(),roles=cleanRoles(body.roles,String(body.role||'Patient Coordinator')),requestedPrimary=String(body.role||'').trim(),role=roles.includes(requestedPrimary)?requestedPrimary:roles[0],isManagement=Boolean(body.is_management)
      if(!firstName||!lastName) return json({error:'First and last name are required.'},400)
      if(targetId===callerData.user.id&&target.is_management&&!isManagement) return json({error:'You cannot remove your own Management access while signed in.'},400)
      const displayName=buildDisplayName(title,firstName,lastName)
      const {data:profile,error}=await admin.from('profiles').update({title,first_name:firstName,last_name:lastName,display_name:displayName,role,roles,is_management:isManagement,updated_at:new Date().toISOString()}).eq('id',targetId).select('*').single()
      if(error) return json({error:error.message},400)
      const {error:authUpdateError}=await admin.auth.admin.updateUserById(targetId,{user_metadata:{recordsweb:true,display_name:displayName}})
      if(authUpdateError) return json({error:`Profile updated, but Auth metadata could not be updated: ${authUpdateError.message}`},500)
      await admin.from('audit_log').insert({organisation_id:callerProfile.organisation_id,actor_id:callerProfile.id,actor_name:callerProfile.display_name,actor_role:callerProfile.role,action:'account.profile.updated',entity_type:'profile',entity_id:targetId,description:`Updated staff account ${target.username}.`})
      return json({profile})
    }

    if(body.action==='set-active'){
      const active=Boolean(body.active)
      if(targetId===callerData.user.id&&!active) return json({error:'You cannot disable your own signed-in account.'},400)
      const reason=String(body.reason||'').trim()
      if(!active&&!reason) return json({error:'Enter a reason for disabling this account.'},400)
      if(reason.length>500) return json({error:'The disable reason must be 500 characters or fewer.'},400)
      const now=new Date().toISOString()
      const patch=active
        ? {active:true,disabled_reason:null,disabled_at:null,disabled_by:null,updated_at:now}
        : {active:false,disabled_reason:reason,disabled_at:now,disabled_by:callerProfile.id,force_logout_at:now,updated_at:now}
      const {error}=await admin.from('profiles').update(patch).eq('id',targetId); if(error)return json({error:error.message},400)
      await admin.from('audit_log').insert({organisation_id:callerProfile.organisation_id,actor_id:callerProfile.id,actor_name:callerProfile.display_name,actor_role:callerProfile.role,action:active?'account.enabled':'account.disabled',entity_type:'profile',entity_id:targetId,description:active?`Enabled ${target.username}.`:`Disabled ${target.username}. Reason: ${reason}`})
      return json({ok:true})
    }

    if(body.action==='force-logout'){
      if(targetId===callerData.user.id) return json({error:'Use the normal sign out control to sign out your own account.'},400)
      const now=new Date().toISOString()
      const {error}=await admin.from('profiles').update({force_logout_at:now,updated_at:now}).eq('id',targetId); if(error)return json({error:error.message},400)
      await admin.from('audit_log').insert({organisation_id:callerProfile.organisation_id,actor_id:callerProfile.id,actor_name:callerProfile.display_name,actor_role:callerProfile.role,action:'account.force_logout',entity_type:'profile',entity_id:targetId,description:`Forced ${target.username} to sign out of RecordsWeb.`})
      return json({ok:true,force_logout_at:now})
    }

    if(body.action==='reset-password'){
      const password=String(body.password||''); const policy=validatePassword(password,target.username); if(policy)return json({error:policy},400)
      const {data:recent,error:recentError}=await admin.rpc('recordsweb_service_password_recently_used',{p_user_id:targetId,p_password:password})
      if(recentError)return json({error:'Password history is unavailable. Run the RecordsWeb 2.7.0 Supabase migration.'},500)
      if(recent)return json({error:'Choose a temporary password this user has not used recently.'},400)
      const {error}=await admin.auth.admin.updateUserById(targetId,{password}); if(error)return json({error:error.message},400)
      const {error:historyError}=await admin.rpc('recordsweb_service_record_password',{p_user_id:targetId,p_password:password})
      if(historyError)return json({error:'Password changed, but password history could not be recorded. Contact the RecordsWeb administrator.'},500)
      await admin.from('profiles').update({must_change_password:true,updated_at:new Date().toISOString()}).eq('id',targetId)
      await admin.from('audit_log').insert({organisation_id:callerProfile.organisation_id,actor_id:callerProfile.id,actor_name:callerProfile.display_name,actor_role:callerProfile.role,action:'account.password.reset_by_management',entity_type:'profile',entity_id:targetId,description:`Reset password for ${target.username}; password change required at next sign-in.`})
      return json({ok:true})
    }
    return json({error:'Unknown action.'},400)
  } catch(error){console.error('recordsweb-admin error',error);return json({error:error instanceof Error?error.message:'Unexpected server error.'},500)}
})

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
