const SHELL_NAMES: Record<string, string> = {
  powershell: 'PowerShell', pwsh: 'PowerShell 7', cmd: 'CMD', wsl: 'WSL',
  bash: 'bash', zsh: 'zsh', ssh: 'ssh',
}

/** Turn an executable path into a readable tab title. */
export function shortTitle(raw: string): string {
  const filename = raw.split(/[\\/]/).pop() ?? raw
  const name = filename.replace(/\.exe$/i, '')
  return SHELL_NAMES[name.toLowerCase()] ?? name
}
