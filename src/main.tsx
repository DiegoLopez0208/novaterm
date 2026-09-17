import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import './index.css'
import App from './App.tsx'

// La ventana nace oculta (`visible: false` en tauri.conf.json) y se muestra
// desde aca, antes de montar React. Cuando este modulo corre, el splash del
// index.html ya esta en el DOM y pintado, asi que lo primero que se ve es el
// cartel y no un rectangulo vacio.
//
// Antes esto vivia en App.tsx y esperaba a que la config estuviera cargada y el
// arbol montado. El resultado era que el splash se borraba en la misma vuelta en
// que la ventana aparecia: no se veia nunca, y la espera se percibia como que la
// app tardaba en abrir.
void invoke('window_ready').catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
