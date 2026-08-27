import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const INTEGRATION_GLOB = 'src/__tests__/integration/**'

export default defineConfig({
  test: {
    projects: [
      {
        // Fast, hermetic tests. `firebase/firestore` is mocked, so these need
        // neither Java nor a running emulator.
        plugins: [react()],
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: false,
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [INTEGRATION_GLOB],
        },
      },
      {
        // Real Firestore, via the emulator. Node environment on purpose: the
        // firebase JS SDK is known to break against the emulator under jsdom
        // (firebase-js-sdk#8137, #9267), so nothing here may import react-dom.
        test: {
          name: 'integration',
          environment: 'node',
          globals: false,
          include: [`${INTEGRATION_GLOB}/*.test.ts`],
          // one emulator, shared by every file
          fileParallelism: false,
        },
      },
    ],
  },
})
