import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from 'rollup-plugin-obfuscator'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Disable source maps — prevents DevTools from showing original code
    sourcemap: false,
    rollupOptions: {
      plugins: [
        obfuscatorPlugin({
          options: {
            // ─── Obfuscation settings (balanced: good protection, reasonable size) ───
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.5,
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 0.2,
            identifierNamesGenerator: 'hexadecimal',
            renameGlobals: false,
            stringArray: true,
            stringArrayCallsTransform: true,
            stringArrayEncoding: ['base64'],
            stringArrayThreshold: 0.75,
            splitStrings: true,
            splitStringsChunkLength: 10,
            transformObjectKeys: true,
            unicodeEscapeSequence: false,
            // Don't break browser APIs
            domainLock: [],
            selfDefending: false,
            debugProtection: false,
          },
        }),
      ],
    },
  },
})
