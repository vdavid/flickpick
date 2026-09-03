import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: '404.html' }),
		paths: {
			// GitHub Pages serves the demo from /<repo>. Set BASE_PATH in CI.
			base: process.env.BASE_PATH ?? ''
		}
	}
};

export default config;
