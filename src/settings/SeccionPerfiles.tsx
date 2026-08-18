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
export function SeccionPerfiles({ config, onChange }: Props) {
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
      setError('Falta el nombre')
      return
    }
    if (!comando) {
      setError('Falta el comando')
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
        Cada perfil es una entrada en el menú <strong>+</strong> de la barra de pestañas y en
        la paleta de comandos. Sirve para cualquier cosa que abra una terminal: una distro de
        WSL, un shell de otra máquina, un entorno con variables propias.
      </p>

      {propios.length > 0 && (
        <ul className="lista-ssh lista-perfiles">
          {propios.map((perfil) => (
            <li key={perfil.id}>
              <IconoPerfil nombre={perfil.icon} />
              <span className="nombre">{perfil.name}</span>
              <code>{[perfil.command, ...perfil.args].join(' ')}</code>
              <button className="borrar" onClick={() => borrar(perfil.id)} aria-label={`Borrar ${perfil.name}`}>
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="alta-perfil">
        <label className="campo">
          <span>Nombre</span>
          <input
            className="texto"
            value={borrador.nombre}
            placeholder="Ubuntu"
            onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>

        <label className="campo">
          <span>Comando</span>
          <input
            className="texto"
            value={borrador.comando}
            placeholder="wsl.exe"
            onChange={(e) => setBorrador({ ...borrador, comando: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>

        <label className="campo">
          <span>Argumentos</span>
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
          Uno por línea. Nunca se arma una línea de comando pegando texto, así que una ruta
          con espacios va entera en su renglón.
        </p>

        <label className="campo">
          <span>Icono</span>
          <select
            value={borrador.icono}
            onChange={(e) => setBorrador({ ...borrador, icono: e.target.value })}
          >
            {ICONOS.map((icono) => (
              <option key={icono} value={icono}>
                {icono || 'genérico'}
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span>Carpeta inicial</span>
          <input
            className="texto"
            value={borrador.cwd}
            placeholder="opcional"
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
          Agregar perfil
        </button>
      </div>

      <p className="grupo">Detectados</p>
      <p className="nota">
        Estos los encuentra la app sola. Si instalás WSL, pwsh o Git con NovaTerm abierto,
        volvé a detectar.
      </p>

      <ul className="lista-ssh lista-perfiles detectados">
        {detectados.map((perfil) => (
          <li key={perfil.id}>
            <IconoPerfil nombre={perfil.icon} />
            <span className="nombre">{perfil.name}</span>
            <code>{perfil.command}</code>
          </li>
        ))}
        {detectados.length === 0 && <li className="vacia">No se detectó ningún shell.</li>}
      </ul>

      <button
        onClick={() => {
          setRedetectando(true)
          void cargar('profiles_refresh').finally(() => setRedetectando(false))
        }}
        disabled={redetectando}
      >
        {redetectando ? 'Buscando…' : 'Volver a detectar'}
      </button>
    </>
  )
}
