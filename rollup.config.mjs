import terser from '@rollup/plugin-terser';

const js = {
	input: 'js/saber.js',
	output: [
		{
			file: 'dist/saber.min.js',
            sourcemap: true,
			format: 'iife',
			name: 'version',
			plugins: [terser()]
		}
	],
};

export default [js];
