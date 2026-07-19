import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Rewrites `import { MaybeInvalid } from 'lucide-react'` into a namespace
// import with per-icon fallback so AI-hallucinated icon names don't crash the app.
function lucideSafeImport() {
  return {
    name: 'lucide-safe-import',
    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || id.includes('node_modules')) return
      const re = /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]lucide-react['"]/g
      if (!re.test(code)) return
      re.lastIndex = 0

      const bindings = []
      const cleaned = code.replace(re, (_, nameList) => {
        for (const raw of nameList.split(',')) {
          const trimmed = raw.trim()
          if (!trimmed) continue
          const [orig, alias] = trimmed.split(/\s+as\s+/).map(s => s.trim())
          bindings.push({ orig, alias: alias || orig })
        }
        return ''
      })

      if (!bindings.length) return
      const header = `import * as __lucide from 'lucide-react';\n` +
        bindings.map(b => `const ${b.alias} = __lucide["${b.orig}"] || __lucide.Circle;`).join('\n') + '\n'
      return { code: header + cleaned, map: null }
    },
  }
}

// Auto-injects missing React hook imports in AI-generated code.
// Same defensive pattern as lucideSafeImport — if the AI writes useRef()
// but forgets to add it to the import statement, this plugin patches it at build time.
function reactHooksAutoImport() {
  const HOOKS = [
    'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo',
    'useContext', 'useReducer', 'useLayoutEffect', 'useId',
    'useTransition', 'useDeferredValue', 'useImperativeHandle',
    'useInsertionEffect', 'useSyncExternalStore', 'useDebugValue',
    'memo', 'forwardRef', 'createContext', 'lazy', 'Suspense',
  ]
  const HOOK_CALL = HOOKS.map(h => `\\b${h}\\b`).join('|')
  const HOOK_RE = new RegExp(HOOK_CALL, 'g')

  return {
    name: 'react-hooks-auto-import',
    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || id.includes('node_modules')) return

      const used = new Set()
      for (const m of code.matchAll(HOOK_RE)) used.add(m[0])
      if (!used.size) return

      const importRe = /import\s+(?:(\w+)\s*,\s*)?\{\s*([^}]*)\}\s*from\s*['"]react['"]/
      const importReG = new RegExp(importRe.source, 'g')
      const defaultImportRe = /import\s+(\w+)\s+from\s*['"]react['"]/

      const allMatches = [...code.matchAll(importReG)]
      const firstMatch = allMatches[0] || null
      const defaultMatch = !firstMatch && code.match(defaultImportRe)

      const alreadyImported = new Set()
      for (const m of allMatches) {
        for (const name of m[2].split(',')) {
          const t = name.replace(/\s+as\s+\w+/, '').trim()
          if (t) alreadyImported.add(t)
        }
      }

      const missing = [...used].filter(h => !alreadyImported.has(h))
      if (!missing.length) return

      if (firstMatch) {
        const firstNames = new Set()
        for (const name of firstMatch[2].split(',')) {
          const t = name.replace(/\s+as\s+\w+/, '').trim()
          if (t) firstNames.add(t)
        }
        const merged = [...new Set([...firstNames, ...missing])]
        const defaultPart = firstMatch[1] ? `${firstMatch[1]}, ` : ''
        const newImport = `import ${defaultPart}{ ${merged.join(', ')} } from 'react'`
        return { code: code.replace(importRe, newImport), map: null }
      }

      if (defaultMatch) {
        const newImport = `import ${defaultMatch[1]}, { ${missing.join(', ')} } from 'react'`
        return { code: code.replace(defaultImportRe, newImport), map: null }
      }

      // No react import at all — add one
      return { code: `import { ${missing.join(', ')} } from 'react';\n` + code, map: null }
    },
  }
}

export default defineConfig({
  plugins: [reactHooksAutoImport(), lucideSafeImport(), react()],
  base: process.env.VITE_BASE || '/',
  cacheDir: './.vite',
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    host: true,
    allowedHosts: true,
    hmr: false,
  },
  // Pre-bundle ALL libraries that generated code may import.
  // Without this, Vite discovers new imports at runtime, triggers re-optimization,
  // and invalidates existing chunks — causing 404s in the browser.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'lucide-react',
      'date-fns',
      'date-fns/locale',
      'phaser',
      'leaflet',
      'react-leaflet',
      'qrcode.react',
      '@supabase/supabase-js',
    ],
  },
})
