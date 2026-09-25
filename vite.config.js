import { defineConfig } from 'vite';

// Keep the distribution portable between the domain root and subdirectories.
export default defineConfig({ base: './' });
