export function formatJson(text, compact = false) {
  if (text.length > 200000) throw new Error('Keep JSON below 200,000 characters.');
  return JSON.stringify(JSON.parse(text), null, compact ? undefined : 2);
}

if (typeof document !== 'undefined') {
  const heading = document.createElement('h2'); heading.textContent = 'JSON tools';
  const description = document.createElement('p'); description.textContent = 'Paste JSON to format or minify it locally. Large integers follow JavaScript number precision; keep exact identifiers as strings.';
  const label = document.createElement('label'); label.textContent = 'JSON input';
  const input = document.createElement('textarea'); input.maxLength = 200000; label.append(input);
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const output = document.createElement('textarea'); output.readOnly = true; output.setAttribute('aria-label', 'Formatted JSON');
  document.body.append(heading, description, label);
  for (const [title, compact] of [['Format JSON', false], ['Minify JSON', true]]) {
    const button = document.createElement('button'); button.textContent = title;
    button.addEventListener('click', () => {
      try { output.value = formatJson(input.value, compact); status.textContent = 'Valid JSON. Select the result to copy it.'; }
      catch (error) { output.value = ''; status.textContent = String(error.message ?? error); }
    });
    document.body.append(button);
  }
  document.body.append(status, output);
}
