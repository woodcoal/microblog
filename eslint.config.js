import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';

export default [
	js.configs.recommended,
	...tseslint.configs.recommended,
	...astro.configs.recommended,
	{
		ignores: ['dist/', 'generated/', 'node_modules/', '.astro/']
	}
];
