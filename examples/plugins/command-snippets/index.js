export function prepareSnippet(text) {
  const value = text.trim();
  if (!value || value.length > 4000) throw new Error('Enter a command between 1 and 4,000 characters.');
  if (Array.from(value).some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029;
  })) throw new Error('Use one line without control characters.');
  return value;
}

if (typeof document !== 'undefined') {
  const heading = document.createElement('h2'); heading.textContent = 'Command snippets';
  const notice = document.createElement('p'); notice.textContent = 'Insertion appends to the current shell input. Start with an empty prompt and review the entire line before pressing Enter. NovaTerm asks for approval unless you have trusted this plugin.';
  const label = document.createElement('label'); label.textContent = 'Command to insert';
  const input = document.createElement('textarea'); input.maxLength = 4000; input.value = 'git status --short'; label.append(input);
  const presets = document.createElement('div');
  for (const [title, command] of [['Git status', 'git status --short'], ['Recent commits', 'git log --oneline -10'], ['Changed files', 'git diff --stat'], ['npm scripts', 'npm run']]) {
    const button = document.createElement('button'); button.textContent = title;
    button.addEventListener('click', () => { input.value = command; }); presets.append(button);
  }
  const insert = document.createElement('button'); insert.textContent = 'Insert into terminal';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  insert.addEventListener('click', async () => {
    insert.disabled = true;
    try { await nova.terminal.write(prepareSnippet(input.value)); status.textContent = 'Inserted without Enter. Review your shell input before executing.'; }
    catch (error) { status.textContent = String(error.message ?? error); }
    finally { insert.disabled = false; }
  });
  document.body.append(heading, notice, presets, label, insert, status);
}
