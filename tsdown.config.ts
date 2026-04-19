import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  dts: true,
  exports: true,
})
