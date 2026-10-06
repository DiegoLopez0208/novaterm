export function convertTimestamp(value, unit) {
  const text = value.trim();
  if (!text) throw new Error('Enter a timestamp or date.');
  if (!['seconds', 'milliseconds', 'iso'].includes(unit)) throw new Error('Choose a supported input format.');
  if (unit !== 'iso' && !/^-?\d+(\.\d+)?$/.test(text)) throw new Error('Enter a numeric Unix timestamp.');
  if (unit === 'iso' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) throw new Error('Use an ISO date with a timezone, for example 2026-10-06T12:00:00Z.');
  const date = new Date(unit === 'iso' ? text : Number(text) * (unit === 'seconds' ? 1000 : 1));
  if (!Number.isFinite(date.getTime())) throw new Error('This timestamp is outside the supported date range.');
  return `UTC: ${date.toISOString()}\nLocal: ${date.toString()}\nUnix seconds: ${Math.floor(date.getTime() / 1000)}\nUnix milliseconds: ${date.getTime()}`;
}

if (typeof document !== 'undefined') {
  const heading = document.createElement('h2'); heading.textContent = 'Timestamp tools';
  const description = document.createElement('p'); description.textContent = 'Explicit units, UTC and local time. Everything stays inside this panel.';
  const formatLabel = document.createElement('label'); formatLabel.textContent = 'Input format';
  const format = document.createElement('select');
  for (const [value, text] of [['seconds', 'Unix seconds'], ['milliseconds', 'Unix milliseconds'], ['iso', 'ISO date with timezone']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = text; format.append(option);
  }
  formatLabel.append(format);
  const valueLabel = document.createElement('label'); valueLabel.textContent = 'Timestamp or date';
  const input = document.createElement('input'); input.type = 'text'; input.maxLength = 100; valueLabel.append(input);
  const output = document.createElement('pre'); output.setAttribute('role', 'status');
  const convert = document.createElement('button'); convert.textContent = 'Convert';
  convert.addEventListener('click', () => {
    try { output.textContent = convertTimestamp(input.value, format.value); }
    catch (error) { output.textContent = String(error.message ?? error); }
  });
  const now = document.createElement('button'); now.textContent = 'Use current time';
  now.addEventListener('click', () => { input.value = String(Date.now()); format.value = 'milliseconds'; convert.click(); });
  document.body.append(heading, description, formatLabel, valueLabel, convert, now, output);
}
