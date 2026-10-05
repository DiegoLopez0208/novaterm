import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IconoPerfil } from '../chrome/Iconos'
import type { NovaConfig, PerfilPropio } from '../config/configBridge'

interface Props {
  config: NovaConfig
  onChange: (config: NovaConfig) => void
}

interface PerfilDetectado {
  id: string
  name: string
  command: string
  icon: string
  detectado: boolean
}

const ICONOS = ['', 'powershell', 'cmd', 'linux', 'bash', 'ssh'] as const

const VACIO = {
  nombre: '',
  comando: '',
  argumentos: '',
  icono: '',
  cwd: '',
}

/// Los perfiles que agrega el usuario. Hasta ahora esto solo se podia hacer
/// escribiendo `profiles = [...]` a mano en el config.toml, asi que el menu de
/// nueva pestaña mostraba unicamente lo que la app detectaba sola.
export function ProfilesSection({ config, onChange }: Props) {
  const [detectados, setDetectados] = useState<PerfilDetectado[]>([])
  const [borrador, setBorrador] = useState(VACIO)
  const [error, setError] = useState<string | null>(null)
  const [redetectando, setRedetectando] = useState(false)

  const cargar = (comando: 'profiles_list' | 'profiles_refresh') =>
    invoke<PerfilDetectado[]>(comando)
      .then((lista) => setDetectados(lista.filter((p) => p.detectado)))
      .catch(() => setDetectados([]))

  useEffect(() => {
    void cargar('profiles_list')
  }, [])

  const propios = config.profiles ?? []

  const guardar = () => {
    const nombre = borrador.nombre.trim()
    const comando = borrador.comando.trim()

    if (!nombre) {
      setError('Name is required')
      return
    }
    if (!comando) {
      setError('Command is required')
      return
    }

    const perfil: PerfilPropio = {
      // El id sale del nombre para que se reconozca en el archivo. Si coincide
      // con uno detectado, el propio gana: es la forma de pisar, por ejemplo,
      // los argumentos con los que se abre PowerShell.
      id: nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: nombre,
      command: comando,
      // Un argumento por linea, no separados por espacios: una ruta con
      // espacios se partiria al medio y el perfil no abriria nunca.
      args: borrador.argumentos
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean),
      icon: borrador.icono,
      cwd: borrador.cwd.trim() || null,
      detectado: false,
    }

    onChange({
      ...config,
      profiles: [...propios.filter((p) => p.id !== perfil.id), perfil],
    })
    setBorrador(VACIO)
    setError(null)
  }

  const borrar = (id: string) =>
    onChange({ ...config, profiles: propios.filter((p) => p.id !== id) })

  return (
    <>
      <p className="nota">
        Each profile appears in the <strong>+</strong> menu in the tab bar and
        the command palette. Use profiles for WSL distributions, remote shells or
        environments with their own variables.
      </p>

      {propios.length > 0 && (
        <ul className="lista-ssh lista-perfiles">
          {propios.map((perfil) => (
            <li key={perfil.id}>
              <IconoPerfil nombre={perfil.icon} />
              <span className="nombre">{perfil.name}</span>
              <code>{[perfil.command, ...perfil.args].join(' ')}</code>
              <button className="borrar" onClick={() => borrar(perfil.id)} aria-label={`Delete ${perfil.name}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="alta-perfil">
        <label className="campo">
          <span>Name</span>
          <input
            className="texto"
            value={borrador.nombre}
            placeholder="Ubuntu"
            onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>

        <label className="campo">
          <span>Command</span>
          <input
            className="texto"
            value={borrador.comando}
            placeholder="wsl.exe"
            onChange={(e) => setBorrador({ ...borrador, comando: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>

        <label className="campo">
          <span>Arguments</span>
          <textarea
            className="texto"
            rows={3}
            value={borrador.argumentos}
            placeholder={'-d\nUbuntu'}
            onChange={(e) => setBorrador({ ...borrador, argumentos: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
        <p className="nota">
          One argument per line. Arguments are passed separately, so put an entire path
          containing spaces on a single line.
        </p>

        <label className="campo">
          <span>Icon</span>
          <select
            value={borrador.icono}
            onChange={(e) => setBorrador({ ...borrador, icono: e.target.value })}
          >
            {ICONOS.map((icono) => (
              <option key={icono} value={icono}>
                {icono || 'generic'}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span>Starting directory</span>
          <input
            className="texto"
            value={borrador.cwd}
            placeholder="optional"
            onChange={(e) => setBorrador({ ...borrador, cwd: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>

        {error && (
          <p className="nota error" role="alert">
            {error}
          </p>
        )}

        <button className="primario" onClick={guardar}>
          Add profile
        </button>
      </div>

      <p className="grupo">Detected</p>
      <p className="nota">
        NovaTerm finds these automatically. If you install WSL, pwsh or Git while NovaTerm
        is open, run detection again.
      </p>

      <ul className="lista-ssh lista-perfiles detectados">
        {detectados.map((perfil) => (
          <li key={perfil.id}>
            <IconoPerfil nombre={perfil.icon} />
            <span className="nombre">{perfil.name}</span>
            <code>{perfil.command}</code>
          </li>
        ))}
        {detectados.length === 0 && <li className="vacia">No shells detected.</li>}
      </ul>

      <button
        onClick={() => {
          setRedetectando(true)
          void cargar('profiles_refresh').finally(() => setRedetectando(false))
        }}
        disabled={redetectando}
      >
        {redetectando ? 'Searching…' : 'Detect again'}
      </button>
    </>
  )
}
