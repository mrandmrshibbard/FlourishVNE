// Renderer logic: pick/drop a .flourish, run the pipeline, show a plain-language result.
const $ = (id) => document.getElementById(id);
let flourishPath = null;
let outParent = null;
let busy = false;

function setFile(p) {
  flourishPath = p;
  const name = p.replace(/\\/g, '/').split('/').pop();
  $('fileName').textContent = name;
  $('dropEmpty').style.display = 'none';
  $('dropFilled').style.display = 'flex';
  $('drop').classList.add('has-file');
  $('go').disabled = false;
}

$('drop').addEventListener('click', async () => {
  if (busy) return;
  const p = await window.companion.pickFlourish();
  if (p) setFile(p);
});

// drag & drop a file onto the window
const drop = $('drop');
['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (ev) => {
  const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (f && f.path) setFile(f.path);
});

$('chooseOut').addEventListener('click', async () => {
  const p = await window.companion.pickOutput();
  if (p) { outParent = p; $('outPath').textContent = p; }
});

window.companion.onStep((msg) => {
  $('steps').innerHTML = '<span class="spin"></span>' + msg;
});

$('go').addEventListener('click', async () => {
  if (busy || !flourishPath) return;
  busy = true;
  $('go').disabled = true;
  $('go').textContent = 'Working…';
  const card = $('card');
  card.classList.add('show');
  $('cardTitle').className = '';
  $('cardTitle').textContent = 'Making your Godot game…';
  ['stats', 'caps', 'warns', 'errs'].forEach((id) => ($(id).innerHTML = ''));
  ['capsWrap', 'warnsWrap', 'nextWrap', 'errWrap'].forEach((id) => ($(id).style.display = 'none'));

  const r = await window.companion.runPipeline({ flourishPath, outParent });

  busy = false;
  $('go').disabled = false;
  $('go').textContent = 'Make my Godot game';
  $('steps').innerHTML = '';

  if (!r || !r.ok) {
    $('cardTitle').className = 'err';
    $('cardTitle').textContent = 'Something went wrong';
    $('steps').textContent = (r && r.error) ? r.error : 'Unknown error.';
    return;
  }

  $('cardTitle').className = 'ok';
  $('cardTitle').textContent = `“${r.title}” is ready to play! 🎉`;
  $('stats').innerHTML =
    `<span><b>${r.scenes}</b> scenes</span>` +
    `<span><b>${r.characters}</b> characters</span>` +
    `<span><b>${r.variables}</b> variables</span>` +
    `<span><b>${r.assetsCopied}</b> assets` + (r.assetsMissing ? ` · <b style="color:#ffca6b">${r.assetsMissing} missing</b>` : '') + `</span>`;

  if (r.validationErrors && r.validationErrors.length) {
    $('errWrap').style.display = 'block';
    $('errs').innerHTML = r.validationErrors.map((e) => `<li>${escapeHtml(e)}</li>`).join('');
  }
  if (r.capabilities && r.capabilities.length) {
    $('capsWrap').style.display = 'block';
    $('caps').innerHTML = r.capabilities.map((c) => `<span class="cap">${c}</span>`).join('');
  }
  if (r.warnings && r.warnings.length) {
    $('warnsWrap').style.display = 'block';
    $('warns').innerHTML = r.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
  }
  $('nextWrap').style.display = 'block';
  $('openFolder').onclick = () => window.companion.openFolder(r.godotDir);
  $('showProject').onclick = () => window.companion.openPath(r.projectFile);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
