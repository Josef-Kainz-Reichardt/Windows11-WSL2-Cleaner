import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts']
  }
})
