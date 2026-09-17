import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { runMigrations } from './storage/migrations.ts'
import './index.css'

/*
 * Backfills for words saved before a later schema change, started here rather
 * than inside a component: this module runs once, where StrictMode deliberately
 * mounts components twice in development. Not awaited — the library renders
 * from disk, and a backfill that may touch the network should never be what
 * keeps the first screen blank.
 */
void runMigrations()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
