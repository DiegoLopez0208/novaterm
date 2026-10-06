export function filterOutput(text, query) {
  const term = query.trim().toLowerCase();
  return term ? text.split('\n').filter((line) => line.toLowerCase().includes(term)).join('\n') : text;
}

if (typeof document !== 'undefined') {
  let snapshot = '';
  const heading = document.createElement('h2'); heading.textContent = 'Output inspector';
  const notice = document.createElement('p'); notice.textContent = 'Capture a snapshot from the active terminal. Filtering stays local and never executes commands.';
  const capture = document.createElement('button'); capture.textContent = 'Capture last 500 lines';
  const label = document.createElement('label'); label.textContent = 'Filter by text';
  const input = document.createElement('input'); input.type = 'search'; input.maxLength = 500; label.append(input);
  const output = document.createElement('textarea'); output.readOnly = true; output.setAttribute('aria-label', 'Filtered terminal snapshot'); output.style.minHeight = '260px';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  input.addEventListener('input', () => { output.value = filterOutput(snapshot, input.value); });
  capture.addEventListener('click', async () => {
    capture.disabled = true;
    try { snapshot = await nova.terminal.read(500); output.value = filterOutput(snapshot, input.value); status.textContent = snapshot ? 'Snapshot captured. Select the result to copy.' : 'The active terminal is empty.'; }
    catch (error) { snapshot = ''; output.value = ''; status.textContent = String(error.message ?? error); }
    finally { capture.disabled = false; }
  });
  const clear = document.createElement('button'); clear.textContent = 'Clear snapshot';
  clear.addEventListener('click', () => { snapshot = ''; output.value = ''; status.textContent = 'Snapshot cleared.'; });
  document.body.append(heading, notice, capture, clear, label, status, output);
}
