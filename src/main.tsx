import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "maplibre-gl/dist/maplibre-gl.css"
import { App } from "./App.tsx"
import "./styles.css"

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
