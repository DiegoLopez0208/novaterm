import { useCallback, useMemo, useState } from 'react'
import {
  ajustarProporcion,
  cerrarPanel as quitarPanel,
  crearPestana,
  dividir as dividirPanel,
  hojas,
  vecino,
  type Division,
  type Perfil,
  type Pestana,
} from './modelo'

export function useTabs() {
  const [pestanas, setPestanas] = useState<Pestana[]>(() => [crearPestana()])
  const [activa, setActiva] = useState(() => pestanas[0].id)

  const actual = useMemo(
    () => pestanas.find((p) => p.id === activa) ?? pestanas[0],
    [pestanas, activa],
  )

  const mapear = useCallback(
    (id: string, cambio: (p: Pestana) => Pestana) =>
      setPestanas((lista) => lista.map((p) => (p.id === id ? cambio(p) : p))),
    [],
  )

  const nueva = useCallback((perfil?: Perfil) => {
    const pestana = crearPestana(perfil)
    setPestanas((lista) => [...lista, pestana])
    setActiva(pestana.id)
  }, [])

  const duplicar = useCallback(() => {
    const base = hojas(actual.raiz).find((h) => h.id === actual.activo)
    nueva(base?.perfil)
  }, [actual, nueva])

  /// Cerrar la ultima pestaña dejaria la ventana vacia y sin forma de volver,
  /// asi que en ese caso se abre una limpia.
  const cerrar = useCallback(
    (id: string) => {
      setPestanas((lista) => {
        const restantes = lista.filter((p) => p.id !== id)
        if (restantes.length === 0) {
          const limpia = crearPestana()
          setActiva(limpia.id)
          return [limpia]
        }
        if (id === activa) {
          const indice = lista.findIndex((p) => p.id === id)
          setActiva(restantes[Math.min(indice, restantes.length - 1)].id)
        }
        return restantes
      })
    },
    [activa],
  )

  const mover = useCallback(
    (paso: 1 | -1) => {
      const indice = pestanas.findIndex((p) => p.id === activa)
      const siguiente = (indice + paso + pestanas.length) % pestanas.length
      setActiva(pestanas[siguiente].id)
    },
    [pestanas, activa],
  )

  const renombrar = useCallback(
    (id: string, alias: string) =>
      mapear(id, (p) => ({ ...p, alias: alias.trim() || undefined })),
    [mapear],
  )

  const tituloDesdeShell = useCallback(
    (idPestana: string, titulo: string) =>
      mapear(idPestana, (p) => (p.titulo === titulo ? p : { ...p, titulo })),
    [mapear],
  )

  const dividir = useCallback(
    (direccion: Division['direccion']) =>
      mapear(actual.id, (p) => {
        const hoja = hojas(p.raiz).find((h) => h.id === p.activo)
        const { raiz, nuevo } = dividirPanel(p.raiz, p.activo, direccion, hoja?.perfil)
        return nuevo ? { ...p, raiz, activo: nuevo } : p
      }),
    [mapear, actual],
  )

  const cerrarPanelActivo = useCallback(() => {
    const restante = quitarPanel(actual.raiz, actual.activo)
    if (!restante) {
      cerrar(actual.id)
      return
    }
    mapear(actual.id, (p) => ({
      ...p,
      raiz: restante,
      activo: hojas(restante)[0].id,
    }))
  }, [actual, cerrar, mapear])

  const activarPanel = useCallback(
    (idPanel: string) => mapear(actual.id, (p) => ({ ...p, activo: idPanel })),
    [mapear, actual],
  )

  const moverPanel = useCallback(
    (paso: 1 | -1) =>
      mapear(actual.id, (p) => ({ ...p, activo: vecino(p.raiz, p.activo, paso) })),
    [mapear, actual],
  )

  const ajustar = useCallback(
    (idDivision: string, proporcion: number) =>
      mapear(actual.id, (p) => ({
        ...p,
        raiz: ajustarProporcion(p.raiz, idDivision, proporcion),
      })),
    [mapear, actual],
  )

  return {
    pestanas,
    activa,
    actual,
    setActiva,
    nueva,
    duplicar,
    cerrar,
    mover,
    renombrar,
    tituloDesdeShell,
    dividir,
    cerrarPanelActivo,
    activarPanel,
    moverPanel,
    ajustar,
  }
}
