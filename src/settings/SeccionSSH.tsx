import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface Conexion {
  id: string
  nombre: string
  host: string
  usuario: string
  puerto: number
  identidad: string
}

const VACIA: Conexion = {
  id: '',
  nombre: '',
  host: '',
  usuario: '',
  puerto: 22,
  identidad: '',
}

interface Props {
  onCambio: () => void
}

export function SeccionSSH({ onCambio }: Props) {
  const [conexiones, setConexiones] = useState<Conexion[]>([])
  const [borrador, setBorrador] = useState<Conexion>(VACIA)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    invoke<Conexion[]>('ssh_list')
      .then(setConexiones)
      .catch(() => setConexiones([]))
  }, [])

  const guardar = () => {
    const nombre = borrador.nombre.trim() || borrador.host.trim()
    if (!borrador.host.trim()) {
      setError('Host is required')
      return
    }

    const conexion: Conexion = {
      ...borrador,
      nombre,
      // El id sale del nombre para que la conexion sea reconocible en el
      // archivo; si ya existe, guardar la reemplaza.
      id: borrador.id || nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    }

    invoke<Conexion[]>('ssh_save', { conexion })
      .then((lista) => {
        setConexiones(lista)
        setBorrador(VACIA)
        setError(null)
        onCambio()
      })
      .catch((e) => setError(String(e)))
  }

  const borrar = (id: string) => {
    invoke<Conexion[]>('ssh_delete', { id })
      .then((lista) => {
        setConexiones(lista)
        onCambio()
        if (borrador.id === id) setBorrador(VACIA)
      })
      .catch((e) => setError(String(e)))
  }

  return (
    <>
      <p className="grupo">Saved connections</p>

      {conexiones.length === 0 && (
        <p className="nota">No saved connections yet. Open them as tabs from the + button.</p>
      )}

      <ul className="lista-ssh">
        {conexiones.map((conexion) => (
          <li key={conexion.id}>
            <button className="editar" onClick={() => setBorrador(conexion)}>
              <strong>{conexion.nombre}</strong>
              <span>
                {conexion.usuario ? `${conexion.usuario}@` : ''}
                {conexion.host}
                {conexion.puerto !== 22 ? `:${conexion.puerto}` : ''}
              </span>
            </button>
            <button
              className="borrar"
              onClick={() => borrar(conexion.id)}
              aria-label={`Delete ${conexion.nombre}`}
              title="Delete"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="separador" />
      <p className="grupo">{borrador.id ? 'Edit connection' : 'New connection'}</p>

      <Text
        etiqueta="Name"
        valor={borrador.nombre}
        placeholder="Production"
        onChange={(v) => setBorrador({ ...borrador, nombre: v })}
      />
      <Text
        etiqueta="Host"
        valor={borrador.host}
        placeholder="192.168.1.50"
        onChange={(v) => setBorrador({ ...borrador, host: v })}
      />
      <Text
        etiqueta="User"
        valor={borrador.usuario}
        placeholder="root"
        onChange={(v) => setBorrador({ ...borrador, usuario: v })}
      />
      <Text
        etiqueta="Port"
        valor={String(borrador.puerto)}
        placeholder="22"
        onChange={(v) => setBorrador({ ...borrador, puerto: Number(v) || 22 })}
      />
      <Text
        etiqueta="Private key"
        valor={borrador.identidad}
        placeholder="~/.ssh/id_ed25519"
        onChange={(v) => setBorrador({ ...borrador, identidad: v })}
      />

      {error && <p className="nota error">{error}</p>}

      <div className="botones-ssh">
        <button className="primario" onClick={guardar}>
          {borrador.id ? 'Save changes' : 'Add'}
        </button>
        {borrador.id && <button onClick={() => setBorrador(VACIA)}>Cancel</button>}
      </div>

      <p className="nota">
        Passwords are not stored. Use public key authentication; if the server requests a password,
        SSH prompts for it inside the terminal.
      </p>
    </>
  )
}

function Text({
  etiqueta,
  valor,
  placeholder,
  onChange,
}: {
  etiqueta: string
  valor: string
  placeholder: string
  onChange: (valor: string) => void
}) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <input
        className="texto"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </label>
  )
}
