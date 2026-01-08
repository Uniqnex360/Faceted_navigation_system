import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // Must use Service Role to invite
    )

    // // 1. Get the current user to verify they are an admin
    // const authHeader = req.headers.get('Authorization')!
    // const token = authHeader.replace('Bearer ', '')
    // const { data: { user: caller } } = await supabaseClient.auth.getUser(token)

    // if (!caller) throw new Error('Unauthorized')

    // 2. Parse request
    const { email, role, client_id, full_name } = await req.json()
     const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'
    // 3. Send Invite
    const { data, error } = await supabaseClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/set-password`,
      data: { role, client_id, full_name }
    })

    if (error) throw error
    const { error: profileError } = await supabaseClient
      .from('user_profiles')
      .insert({
        id: data.user.id,
        email: email,
        full_name: full_name,
        role: role,
        client_id: client_id,
        is_active: false
      })
      if (profileError) throw profileError
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})