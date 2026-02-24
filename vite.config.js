import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { obfuscator } from 'rollup-obfuscator'

export default defineConfig({
  plugins: [
    react(),
    obfuscator({
      options: {
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
        domainLock: [],
        selfDefending: false,
        debugProtection: false,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
