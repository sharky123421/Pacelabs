// Serves a simple HTML page for uploading large Apple Health export to Storage.
// User opens this URL in a browser (ideally on computer), logs in, uploads file, then uses "Process from cloud" in the app.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const REDIRECT_URL = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/upload-health-page` : "";

const html = (url: string, key: string, redirectUrl: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pacelab – Ladda upp Apple Health-export</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.25rem; }
    input, button { display: block; width: 100%; margin: 0.5rem 0; padding: 0.75rem; font-size: 1rem; box-sizing: border-box; }
    button { background: #007AFF; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .msg { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; }
    .success { background: #d4edda; color: #155724; }
    .linkSentBox { margin: 1rem 0; padding: 1rem; border-radius: 8px; background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .error { background: #f8d7da; color: #721c24; }
    .step { margin: 1.5rem 0; }
    label { font-weight: 600; }
  </style>
</head>
<body>
  <h1>Ladda upp Apple Health-export</h1>
  <p>För stora filer: exportera från Hälsa-appen, öppna denna sida i webbläsaren (t.ex. på datorn), logga in med samma konto som i Pacelab, och ladda upp zip eller xml. Öppna sedan appen och tryck på "Process from cloud".</p>

  <div id="authStep" class="step">
    <label>E-post (samma som i Pacelab)</label>
    <input type="email" id="email" placeholder="din@epost.se" />
    <button id="sendLink">Skicka magic link</button>
    <div id="linkSent" class="linkSentBox" style="display:none;">
      <strong>Länk skickad!</strong><br/>
      Kolla din e-post (och skräppost) – klicka på länken i mailet. När du är inloggad kan du ladda upp filen här.
    </div>
  </div>

  <div id="uploadStep" class="step" style="display:none;">
    <label>Välj fil (export.xml eller export.zip)</label>
    <input type="file" id="file" accept=".xml,.zip,application/zip,application/xml,text/xml" />
    <button id="uploadBtn" disabled>Ladda upp</button>
    <div id="uploadMsg"></div>
  </div>

  <script>
    const SUPABASE_URL = ${JSON.stringify(url)};
    const SUPABASE_ANON_KEY = ${JSON.stringify(key)};
    const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    async function initSession() {
      const hash = window.location.hash || '';
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error) {
          window.location.hash = '';
          showUpload();
          return true;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        showUpload();
        return true;
      }
      return false;
    }

    function showUpload() {
      document.getElementById('authStep').style.display = 'none';
      document.getElementById('uploadStep').style.display = 'block';
    }

    document.getElementById('sendLink').onclick = async () => {
      const email = document.getElementById('email').value.trim();
      if (!email) { alert('Ange e-post'); return; }
      const redirectTo = ${JSON.stringify(redirectUrl)} || window.location.origin + '/functions/v1/upload-health-page';
      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });
      if (error) {
        alert('Fel: ' + error.message + (error.message.includes('redirect') ? ' Lägg till ' + redirectTo + ' under Supabase → Authentication → URL Configuration → Redirect URLs.' : ''));
        return;
      }
      const btn = document.getElementById('sendLink');
      btn.textContent = 'Länk skickad ✓';
      btn.disabled = true;
      document.getElementById('linkSent').style.display = 'block';
    };

    document.getElementById('file').onchange = () => {
      document.getElementById('uploadBtn').disabled = !document.getElementById('file').files?.length;
    };

    document.getElementById('uploadBtn').onclick = async () => {
      const file = document.getElementById('file').files?.[0];
      if (!file) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { alert('Logga in först (magic link).'); return; }
      const path = user.id + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const msgEl = document.getElementById('uploadMsg');
      msgEl.className = '';
      msgEl.textContent = 'Laddar upp…';
      document.getElementById('uploadBtn').disabled = true;
      const { error } = await supabase.storage.from('health-exports').upload(path, file, { upsert: true });
      if (error) {
        msgEl.className = 'msg error';
        msgEl.textContent = 'Fel: ' + error.message;
        document.getElementById('uploadBtn').disabled = false;
        return;
      }
      msgEl.className = 'msg success';
      msgEl.textContent = 'Klar! Öppna Pacelab-appen och tryck på "Process from cloud" under Import Apple Health-export.';
      document.getElementById('uploadBtn').disabled = false;
    };

    initSession();
  </script>
</body>
</html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey" } });
  }
  const body = html(SUPABASE_URL || "", SUPABASE_ANON_KEY || "", REDIRECT_URL);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
