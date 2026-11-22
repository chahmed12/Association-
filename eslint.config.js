const js = require('@eslint/js');

module.exports = [
    { ignores: ['node_modules/**'] },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                __dirname: 'readonly',
                AbortController: 'readonly',
                Buffer: 'readonly',
                clearTimeout: 'readonly',
                console: 'readonly',
                fetch: 'readonly',
                module: 'writable',
                process: 'readonly',
                require: 'readonly',
                setTimeout: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none' }]
        }
    }
];
