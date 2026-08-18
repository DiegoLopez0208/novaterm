import { useEffect, useState } from 'react'

/// Si la ventana esta al frente y visible.
///
/// La barra de estado sondea el sistema una vez por segundo y cada widget de
/// plugin lanza un proceso: con la ventana atras o minimizada eso es CPU que se
/// gasta para dibujar algo que nadie mira. Al volver el foco se refresca en el
/// acto, asi que no se nota que estuvo dormida.
export function useEnFoco(): boolean {
  const [enFoco, setEnFoco] = useState(
    () => typeof document === 'undefined' || (document.hasFocus() && !document.hidden),
  )

  useEffect(() => {
    const revisar = () => setEnFoco(document.hasFocus() && !document.hidden)

    window.addEventListener('focus', revisar)
    window.addEventListener('blur', revisar)
    document.addEventListener('visibilitychange', revisar)

    return () => {
      window.removeEventListener('focus', revisar)
      window.removeEventListener('blur', revisar)
      document.removeEventListener('visibilitychange', revisar)
    }
  }, [])

  return enFoco
}
